'use strict';

// bounce && badge
chrome.runtime.onMessage.addListener((request, sender) => {
  // update badge counter
  if (request.cmd === 'popup-request') {
    let tabId = sender.tab.id;
    chrome.browserAction.getBadgeText({tabId}, text => {
      text = text ? parseInt(text) : 0;
      text = (text + 1) + '';
      chrome.browserAction.setBadgeText({
        tabId,
        text
      });
    });
  }
  // open new tab
  else if (request.cmd === 'open-tab') {
    chrome.tabs.create({
      url: request.url,
      active: false,
      index: sender.tab.index + 1
    });
  }
  // redirect current tab
  else if (request.cmd === 'popup-redirect') {
    chrome.tabs.query({
      active: true,
      currentWindow: true
    }, tabs => chrome.tabs.update(tabs[0].id, {
      url: request.url
    }));
  }

  // bouncing
  chrome.tabs.sendMessage(sender.tab.id, request);
});
// refresh
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    chrome.browserAction.setBadgeText({
      tabId,
      text: ''
    });
  }
});
// context menu
chrome.contextMenus.create({
  title: 'Test your popup blocker',
  contexts: ['browser_action'],
  onclick: () => chrome.tabs.create({
    url: 'http://tools.add0n.com/popup-blocker.html'
  })
});
// browser action
function update (toggle) {
  chrome.storage.local.get({
    'enabled': true
  }, obj => {
    if (toggle) {
      obj.enabled = !obj.enabled;
      chrome.storage.local.set(obj);
    }
    chrome.browserAction.setIcon({
      path: {
        16: 'data/icons/' + (obj.enabled ? '' : 'disabled/') + '16.png',
        32: 'data/icons/' + (obj.enabled ? '' : 'disabled/') + '32.png'
      }
    });
  });
}
chrome.browserAction.onClicked.addListener(() => update(true));
update();
// faqs
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
