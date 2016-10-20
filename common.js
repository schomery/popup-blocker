'use strict';

// bounce
chrome.runtime.onMessage.addListener((request, sender) => {
  if (request.cmd === 'update-badge') {
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
  chrome.tabs.sendMessage(sender.tab.id, request);
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
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, {
        cmd: 'popup-status',
        value: obj.enabled
      }));
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
