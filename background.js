// background.js

chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({
      url: chrome.runtime.getURL('popup.html')
    }, function(tab) {
      console.log('Nouvel onglet créé avec l\'ID:', tab.id);
    });
  });