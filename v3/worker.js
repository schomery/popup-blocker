/* global config */
self.importScripts('config.js');
self.importScripts('badge.js');

/* enable or disable the blocker */
const activate = () => config.get(['enabled', 'top-hosts']).then(async prefs => {
  await chrome.scripting.unregisterContentScripts({
    ids: ['page', 'chrome', 'disabled']
  }).catch(() => {});

  if (prefs.enabled) {
    const props = {
      'matches': ['*://*/*'],
      'excludeMatches': prefs['top-hosts'].map(s => ['*://' + s + '/*', '*://*.' + s + '/*']).flat(),
      'allFrames': true,
      'runAt': 'document_start'
    };
    await chrome.scripting.registerContentScripts([{
      'id': 'page',
      'js': ['/data/inject/block/page.js'],
      'world': 'MAIN',
      ...props
    }, {
      'id': 'chrome',
      'js': ['/data/inject/block/chrome.js'],
      'world': 'ISOLATED',
      ...props
    }, { // only on top frame
      'id': 'disabled',
      'js': ['/data/inject/disabled.js'],
      'world': 'ISOLATED',
      'matches': prefs['top-hosts'].map(s => ['*://' + s + '/*', '*://*.' + s + '/*']).flat(),
      'runAt': 'document_start'
    }]);
  }
});
chrome.runtime.onStartup.addListener(activate);
chrome.runtime.onInstalled.addListener(activate);
chrome.storage.onChanged.addListener(ps => {
  if (ps.enabled || ps['top-hosts']) {
    activate();
  }
});

chrome.runtime.onMessage.addListener((request, sender) => {
  if (request.cmd === 'popup-request') {
    config.get(['silent', 'issue']).then(prefs => {
      if (prefs.issue === false) {
        return;
      }
      const {hostname} = new URL(sender.tab.url);
      if (prefs.silent.includes(hostname)) {
        return;
      }
      request.frameId = sender.frameId;
      chrome.tabs.sendMessage(sender.tab.id, request, response => {
        chrome.runtime.lastError;
        // iframe is not present or it is not loaded yet
        if (response !== true) {
          chrome.scripting.executeScript({
            target: {
              tabId: sender.tab.id
            },
            func: (request, tabId) => {
              // iframe is loading. Just add the request and it will get executed later
              if (window.container) {
                window.container.requests.push(request);
              }
              // there is no frame element
              else {
                window.container = document.createElement('iframe');
                window.container.requests = [request];
                window.container.setAttribute('style', `
                  z-index: 2147483649 !important;
                  color-scheme: light !important;
                  position: fixed !important;
                  right: 10px !important;
                  top: 10px !important;
                  width: 420px !important;
                  max-width: 80vw !important;
                  height: 85px !important;
                  border: none !important;
                  background: transparent !important;
                  border-radius: 0 !important;
                `);
                window.container.src = chrome.runtime.getURL('/data/ui/index.html?parent=' + encodeURIComponent(location.href)) + '&tabId=' + tabId;
                window.container.addEventListener('load', () => {
                  chrome.runtime.sendMessage({
                    cmd: 'cached-popup-requests',
                    requests: window.container.requests
                  });
                  delete window.container.requests;
                }, {once: true});
                // do not attach to body to make sure the notification is visible
                document.documentElement.appendChild(window.container);
              }
            },
            args: [request, sender.tab.id]
          });
        }
      });
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

/* commands */
chrome.commands.onCommand.addListener(cmd => chrome.tabs.query({
  active: true,
  currentWindow: true
}, tabs => tabs && tabs[0] && chrome.tabs.sendMessage(tabs[0].id, {
  cmd
})));

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
