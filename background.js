// background.js

// Fonction pour mettre à jour le comportement de l'action (popup ou non)
function updateActionBehavior(mode) {
  if (mode === 'popup') {
    chrome.action.setPopup({ popup: 'popup.html' });
  } else {
    chrome.action.setPopup({ popup: '' });
  }
}

// Initialisation au démarrage
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(['display_mode'], (result) => {
    updateActionBehavior(result.display_mode || 'tab');
  });
});

// Initialisation à l'installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['display_mode'], (result) => {
    updateActionBehavior(result.display_mode || 'tab');
  });
});

// Écouter les changements de paramètres
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.display_mode) {
    updateActionBehavior(changes.display_mode.newValue);
  }
});

// Gérer le clic sur l'icône (uniquement si pas de popup défini)
chrome.action.onClicked.addListener(() => {
  chrome.storage.local.get(['display_mode'], (result) => {
    const mode = result.display_mode || 'tab';
    const url = chrome.runtime.getURL('popup.html');

    if (mode === 'window') {
      chrome.windows.create({
        url: url,
        type: 'popup',
        width: 600,
        height: 800
      });
    } else {
      // Par défaut : nouvel onglet
      chrome.tabs.create({ url: url });
    }
  });
});