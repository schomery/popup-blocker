'use strict';

var badge = true;
var whitelist = [];
var blacklist = [];
var _ = chrome.i18n.getMessage;

var cookie = {
  get: host => {
    const key = document.cookie.split(`${host}=`);
    if (key.length > 1) {
      return key[1].split(';')[0];
    }
  },
  set: (host, cmd) => {
    const days = 10;
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));

    document.cookie = `${host}=${cmd}; expires=${date.toGMTString()}`;
  }
};

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
  'top-hosts': ['yahoo.com', 'disqus.com', 'github.com', 'twitter.com', 'add0n.com', 'google.com'],
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
  const tabId = sender.tab.id;
  if (request.cmd === 'popup-request' && badge) {
    chrome.browserAction.getBadgeText({tabId}, text => {
      text = text ? parseInt(text) : 0;
      text = String(text + 1);
      chrome.browserAction.setBadgeText({
        tabId,
        text
      });
    });
  }
  // popup is accepted
  if (request.cmd === 'popup-accepted') {
    if (request.url.startsWith('http') || request.url.startsWith('ftp')) {
      chrome.storage.local.get({
        'simulate-allow': true
      }, prefs => {
        if (prefs['simulate-allow']) {
          chrome.tabs.create({
            url: request.url,
            openerTabId: sender.tab.id
          });
        }
        else {
          chrome.tabs.sendMessage(sender.tab.id, request);
        }
      });
    }
    else {
      chrome.tabs.sendMessage(sender.tab.id, request);
    }
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
    const url = request.url;
    // validating request before proceeding
    if (url.startsWith('http') || url.startsWith('ftp') || url === 'about:blank') {
      if (request.cmd === 'popup-redirect') {
        // make sure redirect prevent is off
        chrome.tabs.sendMessage(sender.tab.id, {
          cmd: 'release-beforeunload'
        }, () => {
          chrome.tabs.update(sender.tab.id, {
            url
          });
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
        const hostname = (new URL(sender.tab.url)).hostname;
        valid = Boolean(hostname) && whitelist.reduce((p, c) => p || c.endsWith(hostname) || hostname.endsWith(c), false);
      }
      catch (e) {}
    }
    else {
      try {
        const hostname = (new URL(sender.tab.url)).hostname;
        valid = Boolean(hostname) && blacklist.reduce((p, c) => p || c.endsWith(hostname) || hostname.endsWith(c), false);
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
      chrome.storage.local.get({
        'whitelist-mode': 'popup-hosts',
        'top-hosts': ['yahoo.com', 'disqus.com', 'github.com', 'add0n.com', 'google.com'],
        'popup-hosts': ['google.com', 'bing.com', 't.co', 'twitter.com']
      }, prefs => {
        const mode = prefs['whitelist-mode'];
        const hostname = new URL(mode === 'popup-hosts' ? request.url : sender.tab.url).hostname;
        if (hostname === 'tools.add0n.com') {
          return chrome.tabs.executeScript({
            code: 'window.alert("tools.add0n.com is used for popup testing. This hostname cannot be added to the whitelist.")'
          });
        }
        prefs[mode].push(hostname);
        prefs[mode] = prefs[mode].filter((h, i, l) => l.indexOf(h) === i);
        chrome.storage.local.set({
          [mode]: prefs[mode]
        });
        if (mode === 'top-hosts') {
          chrome.tabs.sendMessage(sender.tab.id, {
            cmd: 'disabled-top'
          });
        }
        chrome.tabs.create({
          url: request.url,
          openerTabId: sender.tab.id
        });
      });
    }
    catch (e) {}
  }
  else if (request.cmd === 'wot') {
    const c = cookie.get(request.hostname);
    if (c) {
      response(Number(c));
    }
    const key = atob('MjRmMTIwNDVlYjQ3Y2NmYzJkODdmNWQxOWM1MzY5NmIyZThlMjYwMg==');
    fetch(`http://api.mywot.com/0.4/public_link_json2?hosts=${request.hostname}/&key=${key}`)
      .then(r => r.json()).then(r => {
        let reputation = -1;
        try {
          reputation = r[request.hostname][0][0];
        }
        catch (e) {}
        if (r) {
          cookie.set(request.hostname, reputation);
        }
        response(reputation);
      })
      .catch(() => response());
    return true;
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
chrome.contextMenus.create({
  id: 'allow-last-request',
  title: _('context_item2'),
  contexts: ['browser_action']
});
chrome.contextMenus.create({
  id: 'deny-last-request',
  title: _('context_item3'),
  contexts: ['browser_action']
});
chrome.contextMenus.create({
  id: 'allow-shadow',
  title: _('context_item4'),
  contexts: ['browser_action']
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'open-test-page') {
    chrome.tabs.create({
      url: 'http://tools.add0n.com/popup-blocker.html'
    });
  }
  else {
    chrome.tabs.sendMessage(tab.id, {
      cmd: info.menuItemId
    });
  }
});
// browser action
function update(toggle) {
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

// FAQs & Feedback
chrome.storage.local.get({
  'version': null,
  'faqs': false
}, prefs => {
  const version = chrome.runtime.getManifest().version;

  if (prefs.version ? (prefs.faqs && prefs.version !== version) : true) {
    chrome.storage.local.set({version}, () => {
      chrome.tabs.create({
        url: 'http://add0n.com/popup-blocker.html?version=' + version +
          '&type=' + (prefs.version ? ('upgrade&p=' + prefs.version) : 'install')
      });
    });
  }
});
(function() {
  const {name, version} = chrome.runtime.getManifest();
  chrome.runtime.setUninstallURL('http://add0n.com/feedback.html?name=' + name + '&version=' + version);
})();
