/* globals config, browser */
'use strict';

const isFirefox = /Firefox/.test(navigator.userAgent) || typeof InstallTrigger !== 'undefined';

const cookie = {
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
  //
  if (prefs.enabled) {
    action();
  }
});

chrome.runtime.onMessage.addListener((request, sender) => {
  // update badge counter
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
  else if (request.cmd === 'state') {
    if (sender.tab) {
      config.get(['enabled']).then(({enabled}) => {
        let state = 4;
        if (enabled && request.active) {
          state = 1;
        }
        else if (enabled && request.active === false) {
          state = 2;
        }
        else if (enabled === false && request.active === false) {
          state = 3;
        }
        const path = {
          16: 'data/icons/state/' + state + '/16.png',
          32: 'data/icons/state/' + state + '/32.png'
        };
        chrome.browserAction.setIcon({
          tabId: sender.tab.id,
          path
        });
        chrome.browserAction.setTitle({
          tabId: sender.tab.id,
          title: chrome.i18n.getMessage('bg_msg_state_' + state)
        });
      });
    }
  }
  else if (request.cmd === 'is-active') { // only on CORS sub-frames
    chrome.tabs.executeScript(sender.tab.id, {
      code: 'prefs.enabled'
    }, ar => {
      const lastError = chrome.runtime.lastError;
      if (lastError === undefined) {
        chrome.tabs.executeScript(sender.tab.id, {
          frameId: sender.frameId,
          code: `prefs.enabled = ${ar[0]};`
        });
      }
    });
  }
});
// popup related
chrome.runtime.onMessage.addListener((request, sender) => {
  // bouncing back to ui.js; since ui.js is loaded on its frame, we need to send the message to all frames
  if (request.cmd === 'popup-request') {
    config.get(['silent', 'issue']).then(prefs => {
      if (prefs.issue === false) {
        return;
      }
      const {hostname} = new URL(sender.tab.url);
      if (prefs.silent.indexOf(hostname) === -1) {
        chrome.tabs.sendMessage(sender.tab.id, Object.assign(request, {
          frameId: sender.frameId
        }));
      }
    });
  }
  // popup is accepted
  else if (request.cmd === 'popup-accepted') {
    if (request.url.startsWith('http') || request.url.startsWith('ftp')) {
      config.get(['simulate-allow']).then(prefs => {
        if (prefs['simulate-allow'] && request.sameContext !== true) {
          chrome.tabs.create({
            url: request.url,
            openerTabId: sender.tab.id
          });
        }
        else {
          chrome.tabs.sendMessage(sender.tab.id, request, {
            frameId: request.frameId
          });
        }
      });
    }
    else {
      chrome.tabs.sendMessage(sender.tab.id, request, {
        frameId: request.frameId
      });
    }
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
  else if (request.cmd === 'white-list') {
    config.get(['whitelist-mode', 'top-hosts', 'popup-hosts']).then(prefs => {
      const mode = prefs['whitelist-mode'];
      const {hostname} = new URL(mode === 'popup-hosts' ? request.url : request.parent);
      prefs[mode].push(hostname);
      prefs[mode] = prefs[mode].filter((h, i, l) => l.indexOf(h) === i);
      chrome.storage.local.set({
        [mode]: prefs[mode]
      });
      if (mode === 'top-hosts') {
        chrome.tabs.executeScript(sender.tab.id, {
          allFrames: true,
          code: `
            if (typeof prefs !== 'undefined') {
              prefs.enabled = false
            }
          `
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

if (chrome.commands) {
  chrome.commands.onCommand.addListener(cmd => chrome.tabs.query({
    active: true,
    currentWindow: true
  }, tabs => tabs && tabs[0] && chrome.tabs.sendMessage(tabs[0].id, {
    cmd
  })));
}

// browser action
const action = async () => {
  const prefs = await config.get(['enabled']);
  const path = {
    16: 'data/icons/' + (prefs.enabled ? '' : 'disabled/') + '16.png',
    32: 'data/icons/' + (prefs.enabled ? '' : 'disabled/') + '32.png'
  };
  chrome.browserAction.setIcon({
    path
  });
  // make sure the blocker script is injected (on FF, when disabled, blocker.js is not being injected)
  if (isFirefox) {
    if (prefs.enabled) {
      chrome.tabs.executeScript({
        code: 'typeof prefs'
      }, async a => {
        const lastError = chrome.runtime.lastError;
        if (!lastError && a && a[0] !== 'object') {
          const opts = {
            'matchAboutBlank': true,
            'runAt': 'document_start',
            'allFrames': true
          };
          for (const file of ['actions/enabled.js', 'data/inject/ff.js', 'data/inject/uncode.js', 'data/inject/blocker.js']) {
            try {
              await browser.tabs.executeScript({...opts, file});
            }
            catch (e) {}
          }
        }
      });
    }
  }
};

// on startup (run once)
{
  const once = () => {
    // icon
    action();
    // badge color
    config.get(['badge-color']).then(prefs => chrome.browserAction.setBadgeBackgroundColor({
      color: prefs['badge-color']
    }));
  };
  chrome.runtime.onInstalled.addListener(once);
  chrome.runtime.onStartup.addListener(once);
}

/* enabled */
if (isFirefox) {
  let ps = [];
  const disable = () => {
    if (ps.length) {
      ps.forEach(p => p.unregister());
      ps = [];
    }
  };
  const enable = async () => {
    disable();
    const prefs = await config.get(['blacklist', 'top-hosts']);
    const opts = {
      'matchAboutBlank': true,
      'matches': ['<all_urls>'],
      'js': [
        {file: 'actions/enabled.js'},
        {file: 'data/inject/ff.js'},
        {file: 'data/inject/uncode.js'},
        {file: 'data/inject/blocker.js'}
      ],
      'runAt': 'document_start',
      'allFrames': true
    };
    // white-list
    if (prefs.blacklist.length === 0) {
      chrome.browserAction.setIcon({
        path: {
          '16': 'data/icons/16.png',
          '32': 'data/icons/32.png'
        }
      });
      chrome.browserAction.setTitle({
        title: chrome.i18n.getMessage('bg_msg_state_1')
      });

      if (prefs['top-hosts'].length) {
        ps.push(await browser.contentScripts.register({
          ...opts,
          'js': [{file: 'actions/disabled.js'}],
          'matches': prefs['top-hosts'].map(h => `*://${h}/*`)
        }));
        ps.push(await browser.contentScripts.register(opts));
      }
      else {
        ps.push(await browser.contentScripts.register(opts));
      }
    }
    else {
      chrome.browserAction.setIcon({
        path: {
          '16': 'data/icons/state/3/16.png',
          '32': 'data/icons/state/3/32.png'
        }
      });
      chrome.browserAction.setTitle({
        title: chrome.i18n.getMessage('bg_msg_state_3')
      });

      ps.push(await browser.contentScripts.register({
        ...opts,
        matches: prefs.blacklist.map(h => `*://${h}/*`)
      }));
    }
  };
  const once = () => chrome.storage.local.get({
    'enabled': true
  }, prefs => prefs.enabled ? enable() : disable());
  once();
  chrome.storage.onChanged.addListener(ps => {
    if (ps['top-hosts'] || ps['blacklist']) {
      once();
    }
    else if (ps.enabled && ps.enabled.newValue !== ps.enabled.oldValue) {
      if (ps.enabled.newValue) {
        enable();
      }
      else if (ps.enabled) {
        disable();
      }
    }
  });
}
else {
  const disable = isEnabled => new Promise(resolve => {
    chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
      if (isEnabled) {
        return resolve();
      }
      chrome.declarativeContent.onPageChanged.addRules([{
        conditions: [
          new chrome.declarativeContent.PageStateMatcher({
            pageUrl: {
              schemes: ['file', 'http', 'https']
            }
          })
        ],
        actions: [new chrome.declarativeContent.RequestContentScript({
          js: ['actions/disabled.js'],
          allFrames: true,
          matchAboutBlank: true
        })]
      }]);
      resolve();
    });
  });
  const enable = () => disable(true).then(async () => {
    const prefs = await config.get(['blacklist', 'top-hosts']);
    // white-list
    if (prefs['top-hosts'].length) {
      chrome.declarativeContent.onPageChanged.addRules([{
        conditions: prefs['top-hosts'].map(host => new chrome.declarativeContent.PageStateMatcher({
          pageUrl: {
            hostEquals: host
          }
        })),
        actions: [new chrome.declarativeContent.RequestContentScript({
          js: ['actions/disabled.js']
        })]
      }]);
    }
  });
  const once = () => chrome.storage.local.get({
    enabled: true
  }, prefs => prefs.enabled ? enable() : disable(prefs.enabled));
  chrome.runtime.onInstalled.addListener(once);
  chrome.runtime.onStartup.addListener(once);
  chrome.storage.onChanged.addListener(ps => {
    if (ps.enabled && ps.enabled.newValue) {
      enable();
    }
    else if (ps.enabled) {
      disable(false);
    }
    else if (ps['top-hosts'] || ps['blacklist']) {
      once();
    }
  });
}

/* FAQs & Feedback */
{
  const {management, runtime: {onInstalled, setUninstallURL, getManifest}, storage, tabs} = chrome;
  if (navigator.webdriver !== true) {
    const page = getManifest().homepage_url;
    const {name, version} = getManifest();
    onInstalled.addListener(({reason, previousVersion}) => {
      management.getSelf(({installType}) => installType === 'normal' && storage.local.get({
        'faqs': true,
        'last-update': 0
      }, prefs => {
        if (reason === 'install' || (prefs.faqs && reason === 'update')) {
          const doUpdate = (Date.now() - prefs['last-update']) / 1000 / 60 / 60 / 24 > 45;
          if (doUpdate && previousVersion !== version) {
            tabs.query({active: true, currentWindow: true}, tbs => tabs.create({
              url: page + '?version=' + version + (previousVersion ? '&p=' + previousVersion : '') + '&type=' + reason,
              active: reason === 'install',
              ...(tbs && tbs.length && {index: tbs[0].index + 1})
            }));
            storage.local.set({'last-update': Date.now()});
          }
        }
      }));
    });
    setUninstallURL(page + '?rd=feedback&name=' + encodeURIComponent(name) + '&version=' + version);
  }
}
