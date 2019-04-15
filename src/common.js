/* globals config */
'use strict';

var cookie = {
  get: host => {
    const key = document.cookie.split(`${host}-wot=`);
    if (key.length > 1) {
      return key[1].split(';')[0];
    }
  },
  set: (host, cmd) => {
    const days = 10;
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));

    document.cookie = `${host}-wot=${cmd}; expires=${date.toGMTString()}`;
  }
};

// observe preference changes
chrome.storage.onChanged.addListener(prefs => {
  if (prefs.badge && prefs.badge.newValue === false) {
    chrome.tabs.query({}, tabs => tabs.forEach(tab => chrome.browserAction.setBadgeText({
      tabId: tab.id,
      text: ''
    })));
  }
  // maybe multiple prefs changed
  if (prefs['badge-color']) {
    chrome.browserAction.setBadgeBackgroundColor({
      color: prefs['badge-color'].newValue
    });
  }
  // update toolbar's checkbox
  if (prefs['immediate-action']) {
    chrome.contextMenus.update('immediate-action', {
      checked: prefs['immediate-action'].newValue
    });
  }
});

var cache = {};
chrome.tabs.onRemoved.addListener(tabId => delete cache[tabId]);

// update badge counter
chrome.runtime.onMessage.addListener((request, sender) => {
  if (request.cmd === 'popup-request') {
    const tabId = sender.tab.id;
    config.get(['badge']).then(({badge}) => {
      if (badge) {
        chrome.browserAction.getBadgeText({tabId}, text => {
          text = text ? parseInt(text) : 0;
          text = String(text + 1);
          chrome.browserAction.setBadgeText({
            tabId,
            text
          });
        });
      }
    });
  }
});
// popup related
chrome.runtime.onMessage.addListener((request, sender, response) => {
  // console.log(request, sender);
  // bouncing back to ui.js; since ui.js is loaded on its frame, we need to send the message to all frames
  if (request.cmd === 'popup-request' && request.silent === false) {
    chrome.tabs.sendMessage(sender.tab.id, Object.assign(request, {
      frameId: sender.frameId
    }));
  }
  // popup is accepted
  else if (request.cmd === 'popup-accepted') {
    if (request.url.startsWith('http') || request.url.startsWith('ftp')) {
      config.get(['simulate-allow']).then(prefs => {
        if (prefs['simulate-allow'] && request.sameContext !== true) {
          return chrome.tabs.create({
            url: request.url,
            openerTabId: sender.tab.id
          });
        }
      });
    }
    chrome.tabs.sendMessage(sender.tab.id, request, {
      frameId: request.frameId
    });
  }
  // open a new tab or redirect current tab
  else if (request.cmd === 'popup-redirect' || request.cmd === 'open-tab') {
    const url = request.url;
    // validating request before proceeding
    if (url.startsWith('http') || url.startsWith('ftp') || url === 'about:blank') {
      if (request.cmd === 'popup-redirect') {
        // make sure redirect prevent is off (this needs {frameId: 1} when Edge supports it)
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
  // is this tab (top level url) in the white-list or black-list
  else if (request.cmd === 'exception' && request.top) {
    config.get(['blacklist', 'top-hosts', 'silent']).then(prefs => {
      let enabled = true;
      const {hostname} = request;
      if (hostname) {
        // white-list
        if (prefs.blacklist.length === 0) {
          enabled = prefs['top-hosts'].some(h => h.endsWith(hostname) || hostname.endsWith(h)) === false;
        }
        // black-list
        else {
          enabled = prefs.blacklist.some(h => h.endsWith(hostname) || hostname.endsWith(h));
        }
        if (hostname === 'tools.add0n.com') {
          enabled = true;
        }
      }
      cache[sender.tab.id] = {
        enabled,
        silent: prefs.silent.indexOf(request.hostname) !== -1
      };
      response(cache[sender.tab.id]);
    });
    return true;
  }
  // for all sub frame requests
  else if (request.cmd === 'exception') {
    response(cache[sender.tab.id] || {
      enabled: true
    });
  }
  else if (request.cmd === 'white-list') {
    config.get(['whitelist-mode', 'top-hosts', 'popup-hosts']).then(prefs => {
      const mode = prefs['whitelist-mode'];
      const {hostname} = new URL(mode === 'popup-hosts' ? request.url : sender.tab.url);
      if (hostname === 'tools.add0n.com') {
        return chrome.tabs.executeScript({
          code: `window.alert("${chrome.i18n.getMessage('background_msg1')}");`
        });
      }
      prefs[mode].push(hostname);
      prefs[mode] = prefs[mode].filter((h, i, l) => l.indexOf(h) === i);
      chrome.storage.local.set({
        [mode]: prefs[mode]
      });
      if (mode === 'top-hosts') {
        cache[sender.tab.id] = true;
        chrome.tabs.executeScript(sender.tab.id, {
          allFrames: true,
          code: 'prefs.enabled = false'
        });
      }
    });
  }
});
// wot
chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.cmd === 'wot') {
    const c = cookie.get(request.hostname);
    if (c) {
      return response(Number(c));
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
      }).catch(() => response());
    return true;
  }
});

// context menu
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'open-test-page') {
    chrome.tabs.create({
      url: 'http://tools.add0n.com/popup-blocker.html'
    });
  }
  else if (info.menuItemId === 'open-options') {
    chrome.runtime.openOptionsPage();
  }
  else if (info.menuItemId === 'immediate-action') {
    chrome.storage.local.set({
      'immediate-action': info.checked
    });
  }
  else {
    chrome.tabs.sendMessage(tab.id, {
      cmd: info.menuItemId
    });
  }
});
chrome.commands.onCommand.addListener(cmd => chrome.tabs.query({
  active: true,
  currentWindow: true
}, tabs => tabs && tabs[0] && chrome.tabs.sendMessage(tabs[0].id, {
  cmd
})));
// browser action
var onClicked = async toggle => {
  const prefs = await config.get(['enabled']);
  if (toggle) {
    prefs.enabled = !prefs.enabled;
    chrome.storage.local.set(prefs);
  }
  const path = {
    16: 'data/icons/' + (prefs.enabled ? '' : 'disabled/') + '16.png',
    19: 'data/icons/' + (prefs.enabled ? '' : 'disabled/') + '19.png',
    32: 'data/icons/' + (prefs.enabled ? '' : 'disabled/') + '32.png',
    38: 'data/icons/' + (prefs.enabled ? '' : 'disabled/') + '38.png'
  };
  if (window.navigator.userAgent.indexOf('Edge') > -1) {
    delete path['16'];
    delete path['32'];
  }
  chrome.browserAction.setIcon({
    path
  });
};
chrome.browserAction.onClicked.addListener(() => onClicked(true));
onClicked();

// on startup (run once)
{
  const start = () => document.documentElement.appendChild(Object.assign(document.createElement('script'), {
    src: 'once.js'
  }));
  chrome.runtime.onInstalled.addListener(start);
  chrome.runtime.onStartup.addListener(start);
}

// FAQs
{
  const {onInstalled, setUninstallURL, getManifest} = chrome.runtime;
  const {name, version} = getManifest();
  const page = getManifest().homepage_url;
  onInstalled.addListener(({reason, previousVersion}) => {
    chrome.storage.local.get({
      'faqs': true,
      'last-update': 0
    }, prefs => {
      if (reason === 'install' || (prefs.faqs && reason === 'update')) {
        const doUpdate = (Date.now() - prefs['last-update']) / 1000 / 60 / 60 / 24 > 45;
        if (doUpdate && previousVersion !== version) {
          chrome.tabs.create({
            url: page + '?version=' + version +
              (previousVersion ? '&p=' + previousVersion : '') +
              '&type=' + reason,
            active: reason === 'install'
          });
          chrome.storage.local.set({'last-update': Date.now()});
        }
      }
    });
  });
  setUninstallURL(page + '?rd=feedback&name=' + encodeURIComponent(name) + '&version=' + version);
}
