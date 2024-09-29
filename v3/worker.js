/* global config */

if (typeof importScripts !== 'undefined') {
  self.importScripts('config.js');
  self.importScripts('badge.js');
}

/* enable or disable the blocker */
const activate = async () => {
  if (activate.busy) {
    return;
  }
  activate.busy = true;

  const prefs = await config.get(['enabled', 'top-hosts']);
  try {
    await chrome.scripting.unregisterContentScripts();

    if (prefs.enabled) {
      // exception list
      const th = [];
      for (const hostname of prefs['top-hosts']) {
        try {
          await activate.test('*://' + hostname + '/*');
          th.push('*://' + hostname + '/*');
        }
        catch (e) {
          console.warn('Cannot use ' + hostname + ' rule. Reason: ' + e.message);
        }
        try {
          await activate.test('*://*.' + hostname + '/*');
          th.push('*://*.' + hostname + '/*');
        }
        catch (e) {
          console.warn('Cannot use *.' + hostname + ' rule. Reason: ' + e.message);
        }
      }

      const props = {
        'matches': ['*://*/*'],
        'excludeMatches': th,
        'allFrames': true,
        'matchOriginAsFallback': true,
        'runAt': 'document_start'
      };

      await chrome.scripting.registerContentScripts([{
        'id': 'main',
        'js': ['/data/inject/block/main.js'],
        'world': 'MAIN',
        ...props
      }, {
        'id': 'isolated',
        'js': ['/data/inject/block/isolated.js'],
        'css': ['/data/inject/block/isolated.css'],
        'world': 'ISOLATED',
        ...props
      }]);

      // only on top frame
      if (th.length) {
        await chrome.scripting.registerContentScripts([{
          'id': 'disabled',
          'js': ['/data/inject/disabled.js'],
          'world': 'ISOLATED',
          'matches': th,
          'runAt': 'document_start'
        }]);
      }
    }
  }
  catch (e) {
    await chrome.scripting.unregisterContentScripts();

    const props = {
      'matches': ['*://*/*'],
      'allFrames': true,
      'matchOriginAsFallback': true,
      'runAt': 'document_start'
    };
    await chrome.scripting.registerContentScripts([{
      'id': 'main',
      'js': ['/data/inject/block/main.js'],
      'world': 'MAIN',
      ...props
    }, {
      'id': 'isolated',
      'js': ['/data/inject/block/isolated.js'],
      'world': 'ISOLATED',
      ...props
    }]);

    chrome.action.setBadgeBackgroundColor({color: '#b16464'});
    chrome.action.setBadgeText({text: 'E'});
    chrome.action.setTitle({title: chrome.i18n.getMessage('bg_msg_reg') + '\n\n' + e.message});
    console.error('Blocker Registration Failed', e);
  }
  activate.busy = false;
};
activate.test = async pattern => {
  await chrome.scripting.registerContentScripts([{
    'id': 'test',
    'js': ['/data/inject/test.js'],
    'world': 'MAIN',
    'matches': ['*://*/*'],
    'excludeMatches': [pattern]
  }]);
  await chrome.scripting.unregisterContentScripts({
    ids: ['test']
  }).catch(() => {});
};
chrome.runtime.onStartup.addListener(activate);
chrome.runtime.onInstalled.addListener(activate);
chrome.storage.onChanged.addListener(ps => {
  if (ps.enabled || ps['top-hosts']) {
    activate();
  }
});

chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.cmd === 'popup-request') {
    config.get(['silent', 'issue', 'placement']).then(prefs => {
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
            func: (request, tabId, placement) => {
              self.requests = self.requests || [];
              self.requests.push(request);

              const post = () => {
                if (self.container?.ready) {
                  self.container.contentWindow.postMessage({
                    requests: [...self.requests]
                  }, self.container.src);
                  self.requests.length = 0;
                }
              };
              // what if there is an element with id "container" in DOM
              if (!self.container || self.container.attached !== true) {
                const container = self.container = document.createElement('iframe');
                container.classList.add('pp-blocker');
                container.style = `
                  ${placement.includes('t') ? 'top' : 'bottom'}: 5px !important;
                  ${placement.includes('l') ? 'left' : 'right'}: 5px !important;
                `;
                container.attached = true;
                container.addEventListener('load', () => {
                  container.ready = true;
                  post();
                }, {once: true});
                const args = new URLSearchParams(location.search);
                args.set('tabId', tabId);
                args.set('parent', location.href);
                args.set('placement', placement);
                container.src = chrome.runtime.getURL('/data/ui/index.html') + '?' + args.toString();
                // do not attach to body to make sure the notification is visible
                document.documentElement.append(container);
              }
              post();
            },
            args: [request, sender.tab.id, prefs.placement]
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
  // resize
  else if (request.cmd === 'popup-resize') {
    chrome.scripting.executeScript({
      target: {
        tabId: sender.tab.id
      },
      func: height => {
        if (self.container) {
          self.container.style.setProperty('--height', height + 'px');
        }
      },
      args: [request.height]
    });
  }
  // terminate
  else if (request.cmd === 'popup-terminate') {
    chrome.scripting.executeScript({
      target: {
        tabId: sender.tab.id
      },
      func: () => {
        self.container.remove();
        self.container = null;
      }
    });
  }
  else if (request.cmd === 'run-records') {
    chrome.scripting.executeScript({
      target: {
        tabId: sender.tab.id,
        frameIds: [sender.frameId]
      },
      world: 'MAIN',
      func: (records, href, args) => {
        if (records) {
          const w = window.open(...args);
          for (const record of records) {
            let c = w;
            for (const name of record.tree) {
              c = c[name];
            }
            const {method, args} = record.action;
            if (method) {
              c[method](...args);
            }
            const {prop, value} = record.action;
            if (prop) {
              c[prop] = value;
            }
          }
        }
        else {
          const a = document.createElement('a');
          a.target = '_blank';
          a.href = href;
          a.click();
        }
      },
      args: [request.records || false, request.url, request.args]
    }).finally(() => response(true));

    return true;
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
        chrome.scripting.executeScript({
          target: {
            tabId: sender.tab.id,
            allFrames: true
          },
          func: () => {
            if (typeof prefs !== 'undefined') {
              prefs.enabled = false;
            }
          }
        });
      }
    });
  }
  else if (request.method === 'echo') {
    response(true);
  }
});

/* commands */
chrome.commands.onCommand.addListener(cmd => chrome.tabs.query({
  active: true,
  lastFocusedWindow: true
}, tabs => tabs && tabs[0] && chrome.tabs.sendMessage(tabs[0].id, {
  cmd
})));

/* FAQs & Feedback */
{
  const {management, runtime: {onInstalled, setUninstallURL, getManifest}, storage, tabs} = chrome;
  if (navigator.webdriver !== true) {
    const {homepage_url: page, name, version} = getManifest();
    onInstalled.addListener(({reason, previousVersion}) => {
      management.getSelf(({installType}) => installType === 'normal' && storage.local.get({
        'faqs': true,
        'last-update': 0
      }, prefs => {
        if (reason === 'install' || (prefs.faqs && reason === 'update')) {
          const doUpdate = (Date.now() - prefs['last-update']) / 1000 / 60 / 60 / 24 > 45;
          if (doUpdate && previousVersion !== version) {
            tabs.query({active: true, lastFocusedWindow: true}, tbs => tabs.create({
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
