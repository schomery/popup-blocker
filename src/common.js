'use strict';

var badge = true;
var whitelist = [];
var _ = chrome.i18n.getMessage;

// config
chrome.storage.onChanged.addListener(prefs => {
  if (prefs.badge) {
    badge = prefs.badge.newValue;
    if (!badge) {
      chrome.tabs.query({}, tabs => tabs.forEach(tab => {
        chrome.browserAction.setBadgeText({
          tabId: tab.id,
          text: ''
        });
      }));
    }
  }
  // maybe both change
  if (prefs['top-hosts']) {
    whitelist = prefs['top-hosts'].newValue;
  }
});
chrome.storage.local.get({
  badge: true,
  'top-hosts': ['yahoo.com', 'add0n.com']
}, prefs => {
  badge = prefs.badge;
  whitelist = prefs['top-hosts'];
});

// bounce && badge
chrome.runtime.onMessage.addListener((request, sender, response) => {
  // update badge counter
  if (request.cmd === 'popup-request' && badge) {
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
  // open a new tab or redirect current tab
  else if (request.cmd === 'popup-redirect' || request.cmd === 'open-tab') {
    let url = request.url;
    // validating request before proceeding
    if (url.startsWith('http') || url.startsWith('ftp') || url === 'about:blank') {
      if (request.cmd === 'popup-redirect') {
        chrome.tabs.query({
          active: true,
          currentWindow: true
        }, tabs => chrome.tabs.update(tabs[0].id, {url}));
      }
      else {
        chrome.tabs.create({
          url,
          active: false,
          index: sender.tab.index + 1
        });
      }
    }
  }
  // is this tab (top level url) in whitelist?
  else if (request.cmd === 'validate') {
    let valid = false;
    try {
      let hostname = (new URL(sender.tab.url)).hostname;
      valid = !!hostname && whitelist.reduce((p, c) => p || c.endsWith(hostname) || hostname.endsWith(c), false);
      valid = valid && sender.tab.url !== 'http://tools.add0n.com/popup-blocker.html';
    }
    catch (e) {}
    response({valid});
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
  title: _('context_item1'),
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
        url: 'http://add0n.com/popup-blocker.html?version=' + version + '&type=' +
          (obj.version ? ('upgrade&p=' + obj.version) : 'install')
      });
    });
  }
});
