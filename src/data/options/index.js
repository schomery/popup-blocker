'use strict';

function restore () {
  chrome.storage.local.get({
    numbers: 5,
    timeout: 30,
    badge: true,
    domain: false,
    target: true,
    'popup-hosts': ['google.com', 'bing.com', 't.co'],
    'top-hosts': ['yahoo.com', 'add0n.com']
  }, (obj) => {
    document.getElementById('numbers').value = obj.numbers;
    document.getElementById('timeout').value = obj.timeout;
    document.getElementById('badge').checked = obj.badge;
    document.getElementById('domain').checked = obj.domain;
    document.getElementById('target').checked = obj.target;
    document.getElementById('popup-hosts').value = obj['popup-hosts'].join(', ');
    document.getElementById('top-hosts').value = obj['top-hosts'].join(', ');
  });
}

function save() {
  var numbers = document.getElementById('numbers').value;
  var timeout = document.getElementById('timeout').value;
  var badge = document.getElementById('badge').checked;
  var domain = document.getElementById('domain').checked;
  var target = document.getElementById('target').checked;
  var hosts = document.getElementById('popup-hosts').value;
  var tops = document.getElementById('top-hosts').value;
  chrome.storage.local.set({
    numbers: Math.max(1, numbers),
    timeout: Math.max(1, timeout),
    badge,
    domain,
    target,
    'popup-hosts': hosts.split(',').map(s => s.trim()).filter((s, i, l) => s && l.indexOf(s) === i),
    'top-hosts': tops.split(',').map(s => s.trim()).filter((s, i, l) => s && l.indexOf(s) === i)
  }, () => {
    let status = document.getElementById('status');
    status.textContent = chrome.i18n.getMessage('options_msg');
    restore();
    setTimeout(() => status.textContent = '', 750);
  });
}

document.addEventListener('DOMContentLoaded', restore);
document.getElementById('save').addEventListener('click', save);

Array.from(document.querySelectorAll('[data-i18n]')).forEach(e => {
  e.textContent = chrome.i18n.getMessage(e.dataset.i18n);
});
