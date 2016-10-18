'use strict';

// bounce
chrome.runtime.onMessage.addListener((request, sender) => {
  chrome.tabs.sendMessage(sender.tab.id, request);
});

// web page is under review
chrome.storage.local.get('version', (obj) => {
  let version = chrome.runtime.getManifest().version;
  if (obj.version !== version) {
    chrome.storage.local.set({version}, () => {
      chrome.tabs.create({
        url: 'http://add0n.com/popup-blocker.html?version=' + version + '&type=' + (obj.version ? ('upgrade&p=' + obj.version) : 'install')
      });
    });
  }
});
