document.addEventListener('DOMContentLoaded', function () {
  console.log('popup.js chargé et DOMContentLoaded déclenché');

  const toggleBtn = document.getElementById('toggleRecording');
  const recordBtnText = document.getElementById('recordBtnText');
  const clearTextBtn = document.getElementById('clearText');
  const copyBtn = document.getElementById('copyText');
  const cleanBtn = document.getElementById('cleanText');
  const restartBtn = document.getElementById('restartRecording');
  const transcribedText = document.getElementById('transcribedText');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const closeModal = document.querySelector('.close');
  const modelSelect = document.getElementById('modelSelect');
  const languageSelect = document.getElementById('languageSelect');
  const styleSelect = document.getElementById('styleSelect');
  const displayModeSelect = document.getElementById('displayModeSelect');
  const charCount = document.getElementById('charCount');
  const clearApiKeyBtn = document.getElementById('clearApiKey');

  let mediaRecorder;
  let audioChunks = [];
  let cursorPosition = 0;
  let isRecording = false;

  // Charger le modèle sélectionné depuis le stockage
  chrome.storage.local.get(['selected_model', 'selected_language', 'selected_style', 'display_mode'], function(result) {
    if (result.selected_model) modelSelect.value = result.selected_model;
    if (result.selected_language) languageSelect.value = result.selected_language;
    if (result.selected_style) styleSelect.value = result.selected_style;
    if (result.display_mode) displayModeSelect.value = result.display_mode;
  });

  // Mise à jour du compteur de caractères
  function updateCharCount() {
    charCount.textContent = `${transcribedText.value.length} caractères`;
  }
  transcribedText.addEventListener('input', updateCharCount);

  // Sauvegarder les préférences
  languageSelect.addEventListener('change', function() {
    chrome.storage.local.set({'selected_language': languageSelect.value});
  });
  styleSelect.addEventListener('change', function() {
    chrome.storage.local.set({'selected_style': styleSelect.value});
  });
  displayModeSelect.addEventListener('change', function() {
    chrome.storage.local.set({'display_mode': displayModeSelect.value});
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

  // Gestion du bouton Toggle (Dicter/Arrêter)
  toggleBtn.addEventListener('click', function() {
    if (!isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
  });

  // Gestion du bouton Effacer le texte
  clearTextBtn.addEventListener('click', function() {
    transcribedText.value = '';
    updateCharCount();
    transcribedText.focus();
  });

  // Gestion du bouton Recommencer (Nouvel enregistrement)
  if (restartBtn) {
    restartBtn.addEventListener('click', function () {
      console.log('Recommencer l\'enregistrement...');

      // Arrêter l'enregistrement en cours s'il y en a un
      if (isRecording) {
        stopRecording();
      }

      // Réinitialiser l'interface
      transcribedText.value = '';
      updateCharCount();
      audioChunks = [];

      // Réinitialiser le mediaRecorder
      if (mediaRecorder && mediaRecorder.stream) {
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
      }
      mediaRecorder = null;
      
      console.log('Enregistrement réinitialisé');
    });
  }

  copyBtn.addEventListener('click', function () {
    transcribedText.select();
    document.execCommand('copy');
    
    // Feedback visuel temporaire
    const originalText = copyBtn.innerHTML;
    copyBtn.innerHTML = '<i class="fas fa-check"></i> Copié !';
    setTimeout(() => {
      copyBtn.innerHTML = originalText;
    }, 2000);
  });

  cleanBtn.addEventListener('click', async function () {
    cleanBtn.disabled = true;
    const originalText = cleanBtn.innerHTML;
    cleanBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Traitement...';
    
    try {
      const cleanedText = await cleanTextWithAI(transcribedText.value);
      transcribedText.value = cleanedText;
      updateCharCount();
    } catch (error) {
      console.error('Erreur lors du nettoyage:', error);
      alert('Erreur lors du nettoyage : ' + error.message);
    } finally {
      cleanBtn.disabled = false;
      cleanBtn.innerHTML = originalText;
    }
  });

  function updateUIState(recording) {
    isRecording = recording;
    if (recording) {
      toggleBtn.classList.add('recording-pulse');
      recordBtnText.textContent = 'Arrêter';
      toggleBtn.style.backgroundColor = '#ef4444'; // Rouge
      clearTextBtn.disabled = true;
    } else {
      toggleBtn.classList.remove('recording-pulse');
      recordBtnText.textContent = 'Dicter';
      toggleBtn.style.backgroundColor = ''; // Retour couleur par défaut
      clearTextBtn.disabled = false;
    }
  }

  function startRecording() {
    console.log('Tentative d\'accès au microphone...');
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        console.log('Accès au microphone accordé.');
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.start();
        updateUIState(true);
        console.log('Enregistrement démarré.');

        mediaRecorder.ondataavailable = event => {
          audioChunks.push(event.data);
        };
      })
      .catch(error => {
        console.error('Erreur lors de l\'accès au microphone:', error);
        alert('Erreur lors de l\'accès au microphone : ' + error.message);
        updateUIState(false);
      });
  }

  function stopRecording() {
    if (mediaRecorder) {
      mediaRecorder.stop();
      updateUIState(false);
      console.log('Enregistrement arrêté.');
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        audioChunks = [];
        console.log('Données audio prêtes à être envoyées.');
        
        // Feedback visuel pendant la transcription
        transcribedText.placeholder = "Transcription en cours...";
        toggleBtn.disabled = true;
        
        sendAudioToWhisperAPI(audioBlob).finally(() => {
          toggleBtn.disabled = false;
          transcribedText.placeholder = "Cliquez ici pour placer votre curseur, puis utilisez le bouton 'Dicter' pour commencer...";
        });

        // Arrêter toutes les pistes audio
        if (mediaRecorder.stream) {
          mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
      };
    }
  }

  async function sendAudioToWhisperAPI(audioBlob) {
    try {
      const apiKey = await getAPIKey();
      const model = await getSelectedModel();
      const language = document.getElementById('languageSelect').value;
      
      let langName = 'français';
      if (language === 'en') langName = 'anglais';
      if (language === 'nl') langName = 'néerlandais';

      // Convertir le blob audio en base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);

      return new Promise((resolve, reject) => {
        reader.onloadend = async function() {
          const base64Audio = reader.result.split(',')[1];

          // Déterminer le type MIME
          const mimeType = audioBlob.type || 'audio/webm';

          try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { text: `Transcris l'audio suivant en ${langName}. Retourne uniquement le texte transcrit sans commentaire additionnel.` },
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
              
              updateCharCount();
              console.log('Transcription réussie.');
              resolve();
            } else {
              console.error('Erreur lors de la transcription:', data);
              alert('Erreur lors de la transcription : ' + JSON.stringify(data));
              reject(data);
            }
          } catch (error) {
            reject(error);
          }
        };
      });
    } catch (error) {
      console.error('Erreur lors de la transcription:', error);
      alert('Erreur lors de la transcription : ' + error.message);
    }
  }

  async function cleanTextWithAI(text) {
    const apiKey = await getAPIKey();
    const model = await getSelectedModel();
    const language = document.getElementById('languageSelect').value;
    const style = document.getElementById('styleSelect').value;

    let langName = 'français';
    if (language === 'en') langName = 'anglais';
    if (language === 'nl') langName = 'néerlandais';

    let prompt = "";
    
    switch (style) {
      case 'formel':
        prompt = `Réécris ce texte en ${langName} avec un ton professionnel et des formules de politesse. Corrige la grammaire et le vocabulaire. Retourne uniquement le texte réécrit sans introduction ni commentaire :\n\n${text}`;
        break;
      case 'informel':
        prompt = `Réécris ce texte en ${langName} avec un ton décontracté et amical. Corrige la grammaire. Retourne uniquement le texte réécrit sans introduction ni commentaire :\n\n${text}`;
        break;
      case 'pedagogique':
        prompt = `Réécris ce texte en ${langName} comme une remarque pédagogique bienveillante pour un élève. Sois constructif et encourageant. Retourne uniquement le texte réécrit sans introduction ni commentaire :\n\n${text}`;
        break;
      case 'neutre':
      default:
        prompt = `Corrige ce texte en ${langName} pour qu'il soit grammaticalement correct et bien formaté. N'ajoute pas de style particulier. Retourne uniquement le texte corrigé sans introduction ni commentaire :\n\n${text}`;
        break;
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
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