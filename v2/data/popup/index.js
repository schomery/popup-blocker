/* globals config */
'use strict';

// localization
[...document.querySelectorAll('[data-i18n]')].forEach(e => {
  if (e.tagName === 'INPUT') {
    e.value = chrome.i18n.getMessage(e.dataset.i18n);
  }
  else {
    e.textContent = chrome.i18n.getMessage(e.dataset.i18n);
  }
});

// Global
config.get(['enabled']).then(prefs => {
  document.getElementById('global').checked = prefs.enabled;
  if (prefs.enabled === false) {
    document.getElementById('page').disabled = true;
  }
});
document.getElementById('global').onchange = e => {
  chrome.storage.local.set({
    enabled: e.target.checked
  });
  document.getElementById('page').disabled = e.target.checked === false;
};

// This Page
chrome.tabs.executeScript({
  code: `({
    enabled: typeof prefs === 'object' ? prefs.enabled : undefined,
    hostname: location.hostname
  })`
}, async arr => {
  const lastError = chrome.runtime.lastError;
  if (lastError || arr[0] === undefined) {
    document.getElementById('page').disabled = true;
    // force disabled
    document.getElementById('page').classList.add('disabled');
  }
  else {
    if (arr[0].enabled === true || arr[0].enabled === false) {
      document.getElementById('page').checked = arr[0].enabled;
    }
    else {
      const prefs = await config.get(['top-hosts']);
      document.getElementById('page').checked =
        prefs['top-hosts'].some(h => h === arr[0].hostname) ? false : true;
    }
  }
});
document.getElementById('page').onchange = async e => {
  const prefs = await config.get(['top-hosts']);
  chrome.tabs.executeScript({
    code: 'location.hostname'
  }, ([hostname]) => {
    if (e.target.checked) {
      const n = prefs['top-hosts'].indexOf(hostname);
      if (n !== -1) {
        prefs['top-hosts'].splice(n, 1);
      }
    }
    else {
      prefs['top-hosts'].push(hostname);
      prefs['top-hosts'] = prefs['top-hosts'].filter((s, i, l) => s && l.indexOf(s) === i);
    }
    chrome.storage.local.set(prefs, () => chrome.tabs.reload());
  });
};

config.get(['immediate-action']).then(prefs => {
  document.getElementById('immediate-action').checked = prefs['immediate-action'];
});
document.getElementById('immediate-action').onchange = e => chrome.storage.local.set({
  'immediate-action': e.target.checked
});

config.get(['issue']).then(prefs => {
  document.getElementById('issue').checked = prefs.issue;
});
document.getElementById('issue').onchange = e => chrome.storage.local.set({
  'issue': e.target.checked
});

document.getElementById('test-page').onclick = () => chrome.tabs.create({
  url: 'https://webbrowsertools.com/popup-blocker/'
});

document.getElementById('homepage').onclick = () => chrome.tabs.create({
  url: chrome.runtime.getManifest().homepage_url
});

document.getElementById('options').onclick = () => chrome.runtime.openOptionsPage();

chrome.tabs.query({
  currentWindow: true,
  active: true
}, tabs => {
  if (tabs.length) {
    const tab = tabs[0];
    document.getElementById('use-shadow').onclick = () => chrome.tabs.sendMessage(tab.id, {
      cmd: 'use-shadow'
    }, () => window.close());

    document.getElementById('allow-last-request').onclick = () => chrome.tabs.sendMessage(tab.id, {
      cmd: 'allow-last-request'
    }, () => window.close());

    document.getElementById('deny-last-request').onclick = () => chrome.tabs.sendMessage(tab.id, {
      cmd: 'deny-last-request'
    }, () => window.close());
  }
});
