document.addEventListener('DOMContentLoaded', function () {
  console.log('popup.js chargé et DOMContentLoaded déclenché');

  const startBtn = document.getElementById('startRecording');
  const stopBtn = document.getElementById('stopRecording');
  const copyBtn = document.getElementById('copyText');
  const cleanBtn = document.getElementById('cleanText');
  const restartBtn = document.getElementById('restartRecording');
  const transcribedText = document.getElementById('transcribedText');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const closeModal = document.querySelector('.close');
  const modelSelect = document.getElementById('modelSelect');
  const clearApiKeyBtn = document.getElementById('clearApiKey');

  let mediaRecorder;
  let audioChunks = [];
  let cursorPosition = 0;

  // Charger le modèle sélectionné depuis le stockage
  chrome.storage.local.get(['selected_model'], function(result) {
    if (result.selected_model) {
      modelSelect.value = result.selected_model;
    } else {
      modelSelect.value = 'gemini-2.0-flash'; // Valeur par défaut
    }
  });

  // Ouvrir la modal des paramètres
  settingsBtn.addEventListener('click', function() {
    settingsModal.style.display = 'block';
  });

  // Fermer la modal
  closeModal.addEventListener('click', function() {
    settingsModal.style.display = 'none';
  });

  // Fermer la modal en cliquant en dehors
  window.addEventListener('click', function(event) {
    if (event.target === settingsModal) {
      settingsModal.style.display = 'none';
    }
  });

  // Sauvegarder le modèle sélectionné
  modelSelect.addEventListener('change', function() {
    chrome.storage.local.set({'selected_model': modelSelect.value}, function() {
      console.log('Modèle sauvegardé:', modelSelect.value);
    });
  });

  // Effacer la clé API
  clearApiKeyBtn.addEventListener('click', function() {
    if (confirm('Êtes-vous sûr de vouloir effacer la clé API ?')) {
      chrome.storage.local.remove('google_api_key', function() {
        alert('Clé API effacée avec succès');
        console.log('Clé API effacée');
      });
    }
  });

  // Ajoutez les écouteurs d'événements pour le curseur ici
  transcribedText.addEventListener('click', function() {
    cursorPosition = this.selectionStart;
  });

  transcribedText.addEventListener('keyup', function() {
    cursorPosition = this.selectionStart;
  });

  // Vérifiez si restartBtn n'est pas null avant d'ajouter l'écouteur d'événements
  if (restartBtn) {
    restartBtn.addEventListener('click', function () { // Gestionnaire d'événements pour le bouton "Recommencer"
      console.log('Recommencer l\'enregistrement...');

      // Arrêter l'enregistrement en cours s'il y en a un
      if (mediaRecorder && mediaRecorder.state === "recording") {
        stopRecording();
      }

      // Réinitialiser l'interface immédiatement
      transcribedText.value = ''; // Effacer le contenu précédent
      transcribedText.setAttribute('readonly', true);
      startBtn.disabled = false;
      stopBtn.disabled = true;
      audioChunks = [];

      // Réinitialiser le mediaRecorder
      if (mediaRecorder && mediaRecorder.stream) {
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
      }
      mediaRecorder = null;

      console.log('Enregistrement réinitialisé et prêt à redémarrer');
    });
  } else {
    console.error('Le bouton "Recommencer l\'enregistrement" n\'a pas été trouvé dans le DOM.');
  }

  startBtn.addEventListener('click', function () {
    console.log('Démarrage de l\'enregistrement...');
    startBtn.disabled = true;
    stopBtn.disabled = false;
    startRecording();
  });

  stopBtn.addEventListener('click', function () {
    console.log('Arrêt de l\'enregistrement...');
    startBtn.disabled = false;
    stopBtn.disabled = true;
    stopRecording();
  });

  copyBtn.addEventListener('click', function () {
    transcribedText.select();
    document.execCommand('copy');
    // alert('Texte copié dans le presse-papiers'); // Commenté pour annuler l'affichage du message
  });

  cleanBtn.addEventListener('click', async function () {
    cleanBtn.disabled = true;
    try {
      const cleanedText = await cleanTextWithAI(transcribedText.value);
      transcribedText.value = cleanedText;
    } catch (error) {
      console.error('Erreur lors du nettoyage:', error);
      alert('Erreur lors du nettoyage : ' + error.message);
    } finally {
      cleanBtn.disabled = false;
    }
  });

  function startRecording() {
    console.log('Tentative d\'accès au microphone...');
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        console.log('Accès au microphone accordé.');
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.start();
        console.log('Enregistrement démarré.');

        mediaRecorder.ondataavailable = event => {
          audioChunks.push(event.data);
          console.log('Données audio disponibles.');
        };

        // Arrêter l'enregistrement après 2 minutes
        setTimeout(() => {
          if (mediaRecorder && mediaRecorder.state === "recording") {
            stopRecording();
          }
        }, 120000); // 2 minutes
      })
      .catch(error => {
        console.error('Erreur lors de l\'accès au microphone:', error);
        alert('Erreur lors de l\'accès au microphone : ' + error.message);
        startBtn.disabled = false; // Réactiver le bouton en cas d'erreur
      });
  }

  function stopRecording() {
    if (mediaRecorder) {
      mediaRecorder.stop();
      console.log('Enregistrement arrêté.');
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        audioChunks = [];
        console.log('Données audio prêtes à être envoyées.');
        sendAudioToWhisperAPI(audioBlob);

        // Arrêter toutes les pistes audio
        if (mediaRecorder.stream) {
          mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
        
        // Réactiver le bouton de démarrage
        startBtn.disabled = false;
      };
    } else {
      console.error('mediaRecorder n\'est pas initialisé.');
    }
  }

  async function sendAudioToWhisperAPI(audioBlob) {
    try {
      const apiKey = await getAPIKey();
      const model = await getSelectedModel();

      // Convertir le blob audio en base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);

      reader.onloadend = async function() {
        const base64Audio = reader.result.split(',')[1];

        // Déterminer le type MIME
        const mimeType = audioBlob.type || 'audio/webm';

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: "Transcris l'audio suivant en français. Retourne uniquement le texte transcrit sans commentaire additionnel." },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Audio
                  }
                }
              ]
            }]
          })
        });

        const data = await response.json();

        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
          const transcription = data.candidates[0].content.parts[0].text;

          // Insérer le nouveau texte à la position du curseur
          let currentText = transcribedText.value;
          let newText = currentText.slice(0, cursorPosition) + transcription + currentText.slice(cursorPosition);
          transcribedText.value = newText;

          // Mettre à jour la position du curseur
          cursorPosition += transcription.length;
          transcribedText.setSelectionRange(cursorPosition, cursorPosition);

          transcribedText.removeAttribute('readonly');
          console.log('Transcription réussie.');
        } else {
          console.error('Erreur lors de la transcription:', data);
          alert('Erreur lors de la transcription : ' + JSON.stringify(data));
        }
      };
    } catch (error) {
      console.error('Erreur lors de la transcription:', error);
      alert('Erreur lors de la transcription : ' + error.message);
    }
  }

  async function cleanTextWithAI(text) {
    const apiKey = await getAPIKey();
    const model = await getSelectedModel();
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Corrige ce texte pour qu'il soit grammaticalement correct et bien formaté. N'hésite pas à réorganiser les idées en paragraphes, mais n'ajoute pas de nouvelles phrases. Retourne uniquement le texte corrigé sans introduction ni commentaire :\n\n${text}`
          }]
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1000
        }
      })
    });

    const data = await response.json();
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      return data.candidates[0].content.parts[0].text.trim();
    } else {
      console.error('Erreur lors du nettoyage du texte:', data);
      throw new Error('Erreur lors du nettoyage du texte : ' + JSON.stringify(data));
    }
  }

  // Fonction pour obtenir la clé API de manière sécurisée
  async function getAPIKey() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['google_api_key'], function(result) {
        if (result.google_api_key) {
          resolve(result.google_api_key);
        } else {
          const key = prompt('Veuillez entrer votre clé API Google AI Studio:');
          if (key) {
            chrome.storage.local.set({'google_api_key': key});
            resolve(key);
          } else {
            reject(new Error('Clé API requise pour utiliser cette fonctionnalité'));
          }
        }
      });
    });
  }

  // Fonction pour obtenir le modèle sélectionné
  async function getSelectedModel() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['selected_model'], function(result) {
        resolve(result.selected_model || 'gemini-2.0-flash');
      });
    });
  }
});