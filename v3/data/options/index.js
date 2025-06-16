/* global config  */
'use strict';

// localization
[...document.querySelectorAll('[data-i18n]')].forEach(e => {
  if (e.dataset.i18nValue) {
    e.setAttribute(e.dataset.i18nValue, chrome.i18n.getMessage(e.dataset.i18n));
  }
  else {
    e.textContent = chrome.i18n.getMessage(e.dataset.i18n);
  }
});

async function restore(defaults = false) {
  document.getElementById('user-styling').value = localStorage.getItem('user-styling') || '';

  const prefs = defaults ? config : await config.get([
    'numbers', 'timeout', 'countdown', 'badge', 'badge-color', 'domain',
    'simulate-allow', 'focus-popup', 'faqs', 'popup-hosts',
    'block-page-redirection', 'block-page-redirection-same-origin', 'block-page-redirection-hostnames',
    'top-hosts', 'protocols', 'silent', 'default-action',
    'whitelist-mode', 'immediate-action', 'rules', 'placement', 'scope'
  ]);
  document.getElementById('rules').value = JSON.stringify(prefs.rules, undefined, '  ');
  document.getElementById('numbers').value = prefs.numbers;
  document.getElementById('timeout').value = prefs.timeout;
  document.getElementById('countdown').value = prefs.countdown;
  document.getElementById('badge').checked = prefs.badge;
  document.getElementById('badge-color').value = prefs['badge-color'];
  document.getElementById('domain').checked = prefs.domain;
  document.getElementById('simulate-allow').checked = prefs['simulate-allow'];
  document.getElementById('focus-popup').checked = prefs['focus-popup'];
  document.getElementById('faqs').checked = prefs.faqs;
  document.getElementById('block-page-redirection').checked = prefs['block-page-redirection'];
  document.getElementById('block-page-redirection-same-origin').checked = prefs['block-page-redirection-same-origin'];
  document.getElementById('block-page-redirection-hostnames').value =
    prefs['block-page-redirection-hostnames'].join(', ');
  document.getElementById('popup-hosts').value = prefs['popup-hosts'].join(', ');
  document.getElementById('top-hosts').value = prefs['top-hosts'].join(', ');
  document.getElementById('protocols').value = prefs.protocols.join(', ');
  document.getElementById('silent').value = prefs.silent.join(', ');
  document.getElementById('default-action').value = prefs['default-action'];
  document.getElementById('whitelist-mode').value = prefs['whitelist-mode'];
  document.getElementById('immediate-action').checked = prefs['immediate-action'];
  document.getElementById('placement').value = prefs['placement'];
  document.getElementById('scope').value = prefs['scope'].join(', ');
}

const prepare = str => str.split(/\s*,\s*/)
  .map(s => s.replace('http://', '').replace('https://', '').split('/')[0].trim())
  .filter((h, i, l) => h && l.indexOf(h) === i);

async function save() {
  const scopes = [];
  const patterns = document.getElementById('scope').value.split(/\s*,\s*/).filter((s, i, l) => {
    return s && l.indexOf(s) === i;
  });
  for (const pattern of patterns) {
    try {
      await chrome.scripting.registerContentScripts([{
        'id': 'test',
        'js': ['/data/inject/test.js'],
        'world': 'MAIN',
        'matches': [pattern]
      }]);
      scopes.push(pattern);
    }
    catch (e) {
      console.error('[Invalid Pattern for Scope]', pattern, e);
    }
    await chrome.scripting.unregisterContentScripts({
      ids: ['test']
    }).catch(() => {});
  }
  if (scopes.length === 0) {
    scopes.push('*://*/*');
  }

  const settings = {
    'numbers': Math.max(1, document.getElementById('numbers').value),
    'timeout': Math.max(1, document.getElementById('timeout').value),
    'countdown': Math.max(0, document.getElementById('countdown').value),
    'badge': document.getElementById('badge').checked,
    'badge-color': document.getElementById('badge-color').value,
    'domain': document.getElementById('domain').checked,
    'simulate-allow': document.getElementById('simulate-allow').checked,
    'focus-popup': document.getElementById('focus-popup').checked,
    'faqs': document.getElementById('faqs').checked,
    'block-page-redirection': document.getElementById('block-page-redirection').checked,
    'block-page-redirection-same-origin': document.getElementById('block-page-redirection-same-origin').checked,
    'block-page-redirection-hostnames': prepare(document.getElementById('block-page-redirection-hostnames').value),
    'popup-hosts': prepare(document.getElementById('popup-hosts').value),
    'top-hosts': prepare(document.getElementById('top-hosts').value),
    'silent': prepare(document.getElementById('silent').value),
    'protocols': document.getElementById('protocols').value
      .split(/\s*,\s*/).filter(s => s && s.endsWith(':')),
    'default-action': document.getElementById('default-action').value,
    'whitelist-mode': document.getElementById('whitelist-mode').value,
    'immediate-action': document.getElementById('immediate-action').checked,
    'placement': document.getElementById('placement').value,
    'scope': scopes
  };

  let orules = '';
  try {
    settings.rules = JSON.parse(document.getElementById('rules').value || '{}');
  }
  catch (e) {
    orules = document.getElementById('rules').value;
    alert('Cannot parse rules: ' + e.message);
  }

  localStorage.setItem('user-styling', document.getElementById('user-styling').value || '');

  chrome.storage.local.set(settings, () => {
    const status = document.getElementById('status');
    status.textContent = chrome.i18n.getMessage('options_msg');
    restore();
    setTimeout(() => {
      status.textContent = '';
      if (orules) {
        document.getElementById('rules').value = orules;
      }
    }, 750);
  });
}

document.addEventListener('DOMContentLoaded', () => restore());
document.getElementById('save').addEventListener('click', save);

document.addEventListener('click', e => {
  if (e.target.href && e.target.href.indexOf('#') !== -1) {
    document.querySelector('details').open = true;
  }
});

document.getElementById('reset').addEventListener('click', () => restore(true));
document.getElementById('export').addEventListener('click', () => {
  chrome.storage.local.get(null, prefs => {
    const text = JSON.stringify(prefs, null, '\t');
    const blob = new Blob([text], {type: 'application/json'});
    const objectURL = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {
      href: objectURL,
      type: 'application/json',
      download: 'popup-blocker-preferences.json'
    }).dispatchEvent(new MouseEvent('click'));
    setTimeout(() => URL.revokeObjectURL(objectURL));
  });
});
document.getElementById('import').addEventListener('click', () => {
  const fileInput = document.createElement('input');
  fileInput.style.display = 'none';
  fileInput.type = 'file';
  fileInput.accept = '.json';
  fileInput.acceptCharset = 'utf-8';

  document.body.appendChild(fileInput);
  fileInput.initialValue = fileInput.value;
  fileInput.onchange = readFile;
  fileInput.click();

  function readFile() {
    if (fileInput.value !== fileInput.initialValue) {
      const file = fileInput.files[0];
      if (file.size > 100e6) {
        return console.warn('The file is too large!');
      }
      const fReader = new FileReader();
      fReader.onloadend = event => {
        fileInput.remove();
        const json = JSON.parse(event.target.result);
        chrome.storage.local.set(json, () => chrome.runtime.reload());
      };
      fReader.readAsText(file, 'utf-8');
    }
  }
});
// support
document.getElementById('support').addEventListener('click', () => chrome.tabs.create({
  url: chrome.runtime.getManifest().homepage_url + '?rd=donate'
}));
// review
document.getElementById('review').addEventListener('click', () => chrome.tabs.create({
  url: 'https://www.youtube.com/watch?v=Jp-RaiTHzCQ'
}));
// FAQs Page
document.getElementById('page').addEventListener('click', () => chrome.tabs.create({
  url: chrome.runtime.getManifest().homepage_url
}));

// links
for (const a of [...document.querySelectorAll('[data-href]')]) {
  if (a.hasAttribute('href') === false) {
    a.href = chrome.runtime.getManifest().homepage_url + '#' + a.dataset.href;
  }
}
