'use strict';

var badge = true;
var whitelist = [];
var blacklist = [];
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
  // maybe multiple prefs changed
  if (prefs['badge-color']) {
    chrome.browserAction.setBadgeBackgroundColor({
      color: prefs['badge-color'].newValue
    });
  }
  if (prefs['top-hosts']) {
    whitelist = prefs['top-hosts'].newValue;
  }
  if (prefs.blacklist) {
    blacklist = prefs.blacklist.newValue;
  }
});
chrome.storage.local.get({
  'badge': true,
  'badge-color': '#6e6e6e',
  'top-hosts': ['yahoo.com', 'add0n.com', 'google.com'],
  'blacklist': []
}, prefs => {
  badge = prefs.badge;
  whitelist = prefs['top-hosts'];
  blacklist = prefs.blacklist;
  chrome.browserAction.setBadgeBackgroundColor({
    color: prefs['badge-color']
  });
});

// bounce && badge
chrome.runtime.onMessage.addListener((request, sender, response) => {
  // update badge counter
  let tabId = sender.tab.id;
  if (request.cmd === 'popup-request' && badge) {
    chrome.browserAction.getBadgeText({tabId}, text => {
      text = text ? parseInt(text) : 0;
      text = (text + 1) + '';
      chrome.browserAction.setBadgeText({
        tabId,
        text
      });
    });
  }
  // bouncing back to ui.js
  if (
    request.cmd === 'popup-number' ||
    request.cmd === 'popup-request' ||
    request.cmd === 'popup-request-bounced'
  ) {
    chrome.tabs.sendMessage(sender.tab.id, request);
  }
  // open a new tab or redirect current tab
  else if (request.cmd === 'popup-redirect' || request.cmd === 'open-tab') {
    let url = request.url;
    // validating request before proceeding
    if (url.startsWith('http') || url.startsWith('ftp') || url === 'about:blank') {
      if (request.cmd === 'popup-redirect') {
        // make sure redirect prevent is off
        chrome.tabs.sendMessage(sender.tab.id, {
          cmd: 'release-beforeunload'
        }, () => {
          chrome.tabs.query({
            active: true,
            currentWindow: true
          }, tabs => chrome.tabs.update(tabs[0].id, {url}));
        });
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
  // is this tab (top level url) in whitelist or blacklist?
  else if (request.cmd === 'validate') {
    let valid = false;
    if (blacklist.length === 0) {
      try {
        let hostname = (new URL(sender.tab.url)).hostname;
        valid = !!hostname && whitelist.reduce((p, c) => p || c.endsWith(hostname) || hostname.endsWith(c), false);
      }
      catch (e) {}
    }
    else {
      try {
        let hostname = (new URL(sender.tab.url)).hostname;
        valid = !!hostname && blacklist.reduce((p, c) => p || c.endsWith(hostname) || hostname.endsWith(c), false);
        valid = !valid;
      }
      catch (e) {}
    }
    if (sender.tab.url.startsWith('http://tools.add0n.com/popup-blocker.html')) {
      valid = false;
    }
    response({valid});
  }
  else if (request.cmd === 'white-list') {
    try {
      let hostname = new URL(request.url).hostname;
      chrome.storage.local.get({
        'popup-hosts': ['google.com', 'bing.com', 't.co']
      }, prefs => {
        prefs['popup-hosts'].push(hostname);
        prefs['popup-hosts'] = prefs['popup-hosts'].filter((h, i, l) => l.indexOf(h) === i);
        chrome.storage.local.set(prefs);
      });
    }
    catch (e) {}
  }
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
  id: 'open-test-page',
  title: _('context_item1'),
  contexts: ['browser_action']
});
chrome.contextMenus.onClicked.addListener(() => chrome.tabs.create({
  url: 'http://tools.add0n.com/popup-blocker.html'
}));
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
(function () {
  let {name, version} = chrome.runtime.getManifest();
  chrome.runtime.setUninstallURL('http://add0n.com/feedback.html?name=' + name + '&version=' + version);
})();
