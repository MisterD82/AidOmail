document.addEventListener('DOMContentLoaded', function () {
  console.log('popup.js chargé et DOMContentLoaded déclenché');

  const startBtn = document.getElementById('startRecording');
  const stopBtn = document.getElementById('stopRecording');
  const copyBtn = document.getElementById('copyText');
  const cleanBtn = document.getElementById('cleanText');
  const restartBtn = document.getElementById('restartRecording');
  const transcribedText = document.getElementById('transcribedText');

  let mediaRecorder;
  let audioChunks = [];
  let cursorPosition = 0;

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
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', 'fr');

    try {
      const apiKey = await getAPIKey();
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey
          // Ne définissez pas 'Content-Type' lors de l'envoi de FormData
        },
        body: formData
      });

      const data = await response.json();

      if (data.text) {
        // Insérer le nouveau texte à la position du curseur
        let currentText = transcribedText.value;
        let newText = currentText.slice(0, cursorPosition) + data.text + currentText.slice(cursorPosition);
        transcribedText.value = newText;

        // Mettre à jour la position du curseur
        cursorPosition += data.text.length;
        transcribedText.setSelectionRange(cursorPosition, cursorPosition);

        transcribedText.removeAttribute('readonly');
        console.log('Transcription réussie.');
      } else {
        console.error('Erreur lors de la transcription:', data);
        alert('Erreur lors de la transcription : ' + JSON.stringify(data));
      }
    } catch (error) {
      console.error('Erreur lors de la transcription:', error);
      alert('Erreur lors de la transcription : ' + error.message);
    }
  }

  async function cleanTextWithAI(text) {
    const apiKey = await getAPIKey();
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant.'
          },
          {
            role: 'user',
            content: `Corrige ce texte pour qu'il soit grammaticalement correct et bien formaté. N'hésite pas à réorganiser les idées en paragraphes, mais n'ajoute pas de nouvelles phrases :\n\n${text}`
          }
        ],
        max_tokens: 1000,
        temperature: 0.2,
        n: 1,
        stop: null
      })
    });

    const data = await response.json();
    if (data.choices && data.choices.length > 0) {
      return data.choices[0].message.content.trim();
    } else {
      console.error('Erreur lors du nettoyage du texte:', data);
      throw new Error('Erreur lors du nettoyage du texte : ' + JSON.stringify(data));
    }
  }

  // Fonction pour obtenir la clé API de manière sécurisée
  async function getAPIKey() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['openai_api_key'], function(result) {
        if (result.openai_api_key) {
          resolve(result.openai_api_key);
        } else {
          const key = prompt('Veuillez entrer votre clé API OpenAI:');
          if (key) {
            chrome.storage.local.set({'openai_api_key': key});
            resolve(key);
          } else {
            reject(new Error('Clé API requise pour utiliser cette fonctionnalité'));
          }
        }
      });
    });
  }
});