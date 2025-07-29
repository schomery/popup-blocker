'use strict';

const config = {
  'enabled': true,
  'numbers': 5,
  'timeout': 30,
  'countdown': 5,
  'default-action': 'ignore',
  'immediate-action': false,
  'simulate-allow': true,
  'focus-popup': false,
  'aggressive': false,
  'wot': false,
  'domain': false, // allow popups from the same domain
  'badge': true,
  'badge-color': '#6e6e6e',
  'whitelist-mode': 'popup-hosts',
  'placement': 'tr',
  // the following hostnames can issue popup on every website
  'popup-hosts': [
    'google.com', 'bing.com', 't.co', 'twitter.com', 'disqus.com', 'login.yahoo.com',
    'mail.google.com', 'doubleclick.net'
  ],
  // popup blocker is disabled in the following hostname tabs
  'top-hosts': ['github.com', 'twitter.com', 'webextension.org', 'google.com', 'paypal.com'],
  // these protocols are accepted
  'protocols': ['magnet:'],
  'silent': [],
  'rules': {},
  'issue': true,
  'block-page-redirection': false,
  'block-page-redirection-hostnames': [],
  'block-page-redirection-same-origin': true,
  'target': true,
  'version': null,
  'faqs': true,
  'last-update': 0,
  'scope': ['*://*/*'],
  'width': 420 // popup width in px
};

config.get = keys => {
  const ps = keys.length ? {} : null;
  for (const key of keys) {
    ps[key] = config[key];
  }
  return chrome.storage.local.get(ps);
};
config.update = prefs => {
  chrome.storage.local.get(prefs).then(ps => Object.assign(prefs, ps));
};
config.set = prefs => chrome.storage.local.set(prefs);
config.changed = c => chrome.storage.onChanged.addListener(c);
