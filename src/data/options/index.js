'use strict';

function restore () {
  chrome.storage.local.get({
    'numbers': 5,
    'timeout': 30,
    'countdown': 5,
    'badge': true,
    'badge-color': '#6e6e6e',
    'domain': false,
    'target': true,
    'faqs': false,
    'block-page-redirection': false,
    'popup-hosts': ['google.com', 'bing.com', 't.co', 'twitter.com'],
    'top-hosts': ['yahoo.com', 'disqus.com', 'github.com', 'add0n.com', 'google.com'],
    'blacklist': [],
    'default-action': 'ignore',
    'immediate-action': false
  }, (obj) => {
    document.getElementById('numbers').value = obj.numbers;
    document.getElementById('timeout').value = obj.timeout;
    document.getElementById('countdown').value = obj.countdown;
    document.getElementById('badge').checked = obj.badge;
    document.getElementById('badge-color').value = obj['badge-color'];
    document.getElementById('domain').checked = obj.domain;
    document.getElementById('target').checked = obj.target;
    document.getElementById('faqs').checked = obj.faqs;
    document.getElementById('block-page-redirection').checked = obj['block-page-redirection'];
    document.getElementById('popup-hosts').value = obj['popup-hosts'].join(', ');
    document.getElementById('top-hosts').value = obj['top-hosts'].join(', ');
    document.getElementById('blacklist').value = obj.blacklist.join(', ');
    document.getElementById('default-action').value = obj['default-action'];
    document.getElementById('immediate-action').checked = obj['immediate-action'];
  });
}

function prepare (str) {
  return str.split(/\s*\,\s*/)
  .map(s => {
    return s.replace('http://', '')
      .replace('https://', '').split('/')[0].trim();
  })
  .filter((h, i, l) => h && l.indexOf(h) === i);
}

function save() {
  let numbers = document.getElementById('numbers').value;
  let timeout = document.getElementById('timeout').value;
  let countdown = document.getElementById('countdown').value;
  let badge = document.getElementById('badge').checked;
  let badgeColor = document.getElementById('badge-color').value;
  let domain = document.getElementById('domain').checked;
  let target = document.getElementById('target').checked;
  let faqs = document.getElementById('faqs').checked;
  let redirection = document.getElementById('block-page-redirection').checked;
  let hosts = document.getElementById('popup-hosts').value;
  let tops = document.getElementById('top-hosts').value;
  let blacklist = document.getElementById('blacklist').value;
  let defaultAction = document.getElementById('default-action').value;
  let immediateAction = document.getElementById('immediate-action').checked;
  chrome.storage.local.set({
    'numbers': Math.max(1, numbers),
    'timeout': Math.max(1, timeout),
    'countdown': Math.max(0, countdown),
    badge,
    'badge-color': badgeColor,
    domain,
    target,
    faqs,
    'block-page-redirection': redirection,
    'popup-hosts': prepare(hosts),
    'top-hosts': prepare(tops),
    'blacklist': prepare(blacklist),
    'default-action': defaultAction,
    'immediate-action': immediateAction
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

document.addEventListener('click', e => {
  if (e.target.href && e.target.href.indexOf('#') !== -1) {
    document.querySelector('details').open = true;
  }
});
