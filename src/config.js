'use strict';

var config = {
  'enabled': true,
  'numbers': 5,
  'timeout': 30,
  'countdown': 5,
  'default-action': 'ignore',
  'immediate-action': false,
  'simulate-allow': true,
  'wot': false,
  'domain': false, // allow popups from the same domain
  'badge': true,
  'badge-color': '#6e6e6e',
  'whitelist-mode': 'popup-hosts',
  // the following hostnames can issue popup on every website
  'popup-hosts': ['google.com', 'bing.com', 't.co', 'twitter.com', 'disqus.com'],
  // popup blocker is disabled in the following hostname tabs
  'top-hosts': ['disqus.com', 'github.com', 'twitter.com', 'add0n.com', 'google.com', 'www.paypal.com'],
  // these protocols are accepted
  'protocols': ['magnet:'],
  'blacklist': [],
  'silent': [],
  'block-page-redirection': false,
  'target': true,
  'version': null,
  'faqs': true,
  'last-update': 0
};

config.get = arr => new Promise(resolve => {
  const ps = arr.reduce((p, c) => {
    p[c] = config[c];
    return p;
  }, {});
  chrome.storage.local.get(ps, resolve);
});
