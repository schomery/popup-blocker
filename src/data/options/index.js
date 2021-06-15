/* globals config  */
'use strict';

const isFirefox = /Firefox/.test(navigator.userAgent) || typeof InstallTrigger !== 'undefined';

// localization
[...document.querySelectorAll('[data-i18n]')].forEach(e => {
  e.textContent = chrome.i18n.getMessage(e.dataset.i18n);
});

async function restore(defaults = false) {
  const prefs = defaults ? config : await config.get([
    'numbers', 'timeout', 'countdown', 'badge', 'badge-color', 'domain', 'wot',
    'simulate-allow', 'faqs', 'block-page-redirection', 'popup-hosts',
    'top-hosts', 'blacklist', 'protocols', 'silent', 'default-action',
    'whitelist-mode', 'immediate-action'
  ]);
  document.getElementById('numbers').value = prefs.numbers;
  document.getElementById('timeout').value = prefs.timeout;
  document.getElementById('countdown').value = prefs.countdown;
  document.getElementById('badge').checked = prefs.badge;
  document.getElementById('badge-color').value = prefs['badge-color'];
  document.getElementById('domain').checked = prefs.domain;
  document.getElementById('wot').checked = prefs.wot;
  document.getElementById('simulate-allow').checked = prefs['simulate-allow'];
  document.getElementById('faqs').checked = prefs.faqs;
  document.getElementById('block-page-redirection').checked = prefs['block-page-redirection'];
  document.getElementById('popup-hosts').value = prefs['popup-hosts'].join(', ');
  document.getElementById('top-hosts').value = prefs['top-hosts'].join(', ');
  document.getElementById('blacklist').value = isFirefox ? prefs.blacklist.join(', ') : '';
  document.getElementById('protocols').value = prefs.protocols.join(', ');
  document.getElementById('silent').value = prefs.silent.join(', ');
  document.getElementById('default-action').value = prefs['default-action'];
  document.getElementById('whitelist-mode').value = prefs['whitelist-mode'];
  document.getElementById('immediate-action').checked = prefs['immediate-action'];
}

const prepare = str => str.split(/\s*,\s*/)
  .map(s => s.replace('http://', '').replace('https://', '').split('/')[0].trim())
  .filter((h, i, l) => h && l.indexOf(h) === i);

function save() {
  chrome.storage.local.set({
    'numbers': Math.max(1, document.getElementById('numbers').value),
    'timeout': Math.max(1, document.getElementById('timeout').value),
    'countdown': Math.max(0, document.getElementById('countdown').value),
    'badge': document.getElementById('badge').checked,
    'badge-color': document.getElementById('badge-color').value,
    'domain': document.getElementById('domain').checked,
    'wot': document.getElementById('wot').checked,
    'simulate-allow': document.getElementById('simulate-allow').checked,
    'faqs': document.getElementById('faqs').checked,
    'block-page-redirection': document.getElementById('block-page-redirection').checked,
    'popup-hosts': prepare(document.getElementById('popup-hosts').value),
    'top-hosts': prepare(document.getElementById('top-hosts').value),
    'blacklist': prepare(document.getElementById('blacklist').value),
    'silent': prepare(document.getElementById('silent').value),
    'protocols': document.getElementById('protocols').value
      .split(/\s*,\s*/).filter(s => s && s.endsWith(':')),
    'default-action': document.getElementById('default-action').value,
    'whitelist-mode': document.getElementById('whitelist-mode').value,
    'immediate-action': document.getElementById('immediate-action').checked
  }, () => {
    const status = document.getElementById('status');
    status.textContent = chrome.i18n.getMessage('options_msg');
    restore();
    setTimeout(() => status.textContent = '', 750);
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


if (isFirefox === false) {
  document.getElementById('blacklist').setAttribute('placeholder', chrome.i18n.getMessage('options_item38'));
  document.getElementById('blacklist').disabled = true;
}
