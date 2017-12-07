'use strict';

function restore() {
  chrome.storage.local.get({
    'numbers': 5,
    'timeout': 30,
    'countdown': 5,
    'badge': true,
    'badge-color': '#6e6e6e',
    'domain': false,
    'target': true,
    'wot': true,
    'simulate-allow': true,
    'faqs': false,
    'block-page-redirection': false,
    'popup-hosts': ['google.com', 'bing.com', 't.co', 'twitter.com'],
    'top-hosts': ['yahoo.com', 'disqus.com', 'github.com', 'add0n.com', 'google.com'],
    'blacklist': [],
    'protocols': ['magnet:'],
    'default-action': 'ignore',
    'immediate-action': false
  }, prefs => {
    document.getElementById('numbers').value = prefs.numbers;
    document.getElementById('timeout').value = prefs.timeout;
    document.getElementById('countdown').value = prefs.countdown;
    document.getElementById('badge').checked = prefs.badge;
    document.getElementById('badge-color').value = prefs['badge-color'];
    document.getElementById('domain').checked = prefs.domain;
    document.getElementById('target').checked = prefs.target;
    document.getElementById('wot').checked = prefs.wot;
    document.getElementById('simulate-allow').checked = prefs['simulate-allow'];
    document.getElementById('faqs').checked = prefs.faqs;
    document.getElementById('block-page-redirection').checked = prefs['block-page-redirection'];
    document.getElementById('popup-hosts').value = prefs['popup-hosts'].join(', ');
    document.getElementById('top-hosts').value = prefs['top-hosts'].join(', ');
    document.getElementById('blacklist').value = prefs.blacklist.join(', ');
    document.getElementById('protocols').value = prefs.protocols.join(', ');
    document.getElementById('default-action').value = prefs['default-action'];
    document.getElementById('immediate-action').checked = prefs['immediate-action'];
  });
}

function prepare(str) {
  return str.split(/\s*,\s*/)
  .map(s => s.replace('http://', '')
  .replace('https://', '').split('/')[0].trim())
  .filter((h, i, l) => h && l.indexOf(h) === i);
}

function save() {
  const numbers = document.getElementById('numbers').value;
  const timeout = document.getElementById('timeout').value;
  const countdown = document.getElementById('countdown').value;
  const badge = document.getElementById('badge').checked;
  const badgeColor = document.getElementById('badge-color').value;
  const domain = document.getElementById('domain').checked;
  const target = document.getElementById('target').checked;
  const wot = document.getElementById('wot').checked;
  const faqs = document.getElementById('faqs').checked;
  const redirection = document.getElementById('block-page-redirection').checked;
  const hosts = document.getElementById('popup-hosts').value;
  const tops = document.getElementById('top-hosts').value;
  const blacklist = document.getElementById('blacklist').value;
  const protocols = document.getElementById('protocols').value;
  const defaultAction = document.getElementById('default-action').value;
  const immediateAction = document.getElementById('immediate-action').checked;
  chrome.storage.local.set({
    'numbers': Math.max(1, numbers),
    'timeout': Math.max(1, timeout),
    'countdown': Math.max(0, countdown),
    badge,
    'badge-color': badgeColor,
    domain,
    target,
    wot,
    'simulate-allow': document.getElementById('simulate-allow').checked,
    faqs,
    'block-page-redirection': redirection,
    'popup-hosts': prepare(hosts),
    'top-hosts': prepare(tops),
    'blacklist': prepare(blacklist),
    'protocols': protocols.split(/\s*,\s*/).filter(s => s && s.endsWith(':')),
    'default-action': defaultAction,
    'immediate-action': immediateAction
  }, () => {
    const status = document.getElementById('status');
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
