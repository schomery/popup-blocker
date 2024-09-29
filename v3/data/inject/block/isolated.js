/* global navigation */

/* Checks
  1.
  https://chrome.google.com/webstore/detail/aefkmifgmaafnojlojpnekbpbmjiiogg
  FF -> The page’s settings blocked the loading of a resource at inline (“script-src”)

  2.
  https://www.w3schools.com/jsref/tryit.asp?filename=tryjsref_win_open

  3. test on incognito and private mode

  4. https://webbrowsertools.com/popup-blocker/?fire_on_start

  5. test reverse mode

  6.
    https://codepen.io/pipr/pen/VwpVyZQ
    https://codepen.io/pipr/pen/LYWMpdR
    https://codepen.io/pipr/pen/XWMoPog
    https://codepen.io/pipr/pen/YzZdOdJ

  7.
    https://patrickhlauke.github.io/recaptcha/
*/

/* port is used to communicate between chrome and page scripts */
let port;
try {
  port = document.getElementById('ppop-port');
  port.remove();
}
catch (e) {
  port = document.createElement('span');
  port.id = 'ppop-port';
  document.documentElement.append(port);
}

/* preferences */
const prefs = window.prefs = new Proxy({}, {
  set(obj, key, value) {
    obj[key] = value;

    if (key === 'enabled') {
      port.dataset[key] = value === true;
      if (window === window.top) {
        chrome.runtime.sendMessage({
          'cmd': 'state',
          'active': value === true
        });
      }
    }
    return true;
  }
});

/* is enabled */
try { // SVG documents
  port.dataset.enabled = true;
}
catch (e) {}
chrome.storage.onChanged.addListener(ps => {
  if (ps.enabled) {
    prefs.enabled = ps.enabled.newValue;
  }
});

/* record fake window's executed commands */
const records = {};

/* page redirection; prevent the page redirection when popup opening is unsuccessful for 2 seconds */
const redirect = {
  prefs: {
    'block-page-redirection': false,
    'block-page-redirection-period': 2000,
    'block-page-redirection-hostnames': [],
    'block-page-redirection-same-origin': true
  },
  timeout: null,
  beforeunload(e) {
    if (redirect.href) {
      try {
        const {origin, hostname} = new URL(redirect.href);

        // do not block same origin
        if (redirect.prefs['block-page-redirection-same-origin'] && (
          origin.includes(location.hostname) ||
          location.origin.includes(hostname)
        )) {
          return true;
        }
        if (redirect.prefs['block-page-redirection-hostnames'].includes(hostname)) {
          return true;
        }
      }
      catch (e) {
        console.warn('block redirect error', e);
      }
    }

    e.returnValue = 'false';
  },
  block() {
    if (window.top === window) {
      if (redirect.prefs && redirect.prefs['block-page-redirection']) {
        addEventListener('beforeunload', redirect.beforeunload, true);
        clearTimeout(redirect.timeout);
        redirect.timeout = setTimeout(redirect.release, redirect.prefs['block-page-redirection-period']);
      }
    }
  },
  release() {
    removeEventListener('beforeunload', redirect.beforeunload, true);
    clearTimeout(redirect.timeout);
  }
};
// get notified on navigation
if (typeof navigation !== 'undefined' && window.top === window) {
  navigation.addEventListener('navigate', navigateEvent => {
    redirect.href = navigateEvent.destination.url;
  });
}
chrome.storage.local.get(redirect.prefs, prefs => Object.assign(redirect.prefs, prefs));

/* recording window.open */
const record = e => {
  e.stopPropagation();
  const request = e.detail;
  records[request.id].push(request);
};
port.addEventListener('record', record);

/* channel */
const policy = e => {
  e.stopPropagation();

  // make sure the request is from our script; see example 1
  if (e.target === port) {
    if (port.dataset.enabled !== 'false') {
      const request = e.detail;
      const {block, id, href, hostname} = blocker.policy(request);
      port.setAttribute('eid', id);
      port.setAttribute('block', block);

      if (block) {
        redirect.block();

        chrome.runtime.sendMessage({
          cmd: 'popup-request',
          type: request.type,
          href,
          hostname,
          id
        });
      }
    }
    // when a new iframe is loaded and the blocker is disabled but the preferences are not yet ported
    else {
      port.setAttribute('block', false);
    }
  }
};
port.addEventListener('policy', policy);

/* blocker */
const blocker = {};

blocker.hasBase = a => {
  // https://github.com/schomery/popup-blocker/issues/86
  // only check the closest base
  const base = [a, ...document.querySelectorAll('base')]
    .map(e => e && e.target ? e.target : '')
    .filter(b => b).shift();

  if (!base || base.toLowerCase() === '_self' || base.toLowerCase() === '_top') {
    return false;
  }
  // the linked page opens in a named frame
  if (typeof window[base] === 'object') {
    return false;
  }
  try { // might be cross-origin
    if (typeof parent[base] === 'object') {
      return false;
    }
  }
  catch (e) {}
  if (typeof isFirefox !== 'undefined') {
    try {
      if (document.querySelector(`[name="${base}"]`)) {
        return false;
      }
    }
    catch (e) {}
    try {
      if (parent.document.querySelector(`[name="${base}"]`)) {
        return false;
      }
    }
    catch (e) {}
  }
  return true;
};

blocker.policy = request => {
  const target = document.activeElement || document.documentElement;
  const {type} = request;
  let href = request.href;
  let hostname = '';
  let block = true;
  let sameContext = false;

  if (type === 'element.click') {
    const a = 'closest' in target ? (target.closest('[target]') || target.closest('a')) : null;
    href = href || (a ? a.href || a.action : '');

    // we are blocking either if a is found or href is provided; see method 12/4
    block = Boolean(a) || href;
  }
  // always run window open on the same context
  if (type === 'window.open') {
    sameContext = true;
  }
  else {
    block = block && blocker.hasBase({
      target: request.target
    });
  }
  // block if
  if (request.metaKey && request.isTrusted === false) { // see method 12/5
    block = true;
  }
  if ('button' in request && request.button !== 0 && request.isTrusted === false) { // see method 12/2
    block = true;
  }
  // do not block if
  if (request.defaultPrevented || (request.metaKey && request.isTrusted)) {
    block = false;
  }
  // do not block A[download]
  if (request.tag === 'A' && request.download) {
    block = false;
  }
  // fixing
  if (block) {
    // fix relative href
    if (href && href.indexOf(':') === -1) {
      const a = document.createElement('a');
      a.setAttribute('href', href);
      href = a.href;
    }
    // create a unique id when "href" is not usable
    if (!href || href.startsWith('about:')) {
      target.dataset.ppbid = target.dataset.ppbid || Math.random();
    }
    if (href) {
      try {
        const configs = blocker.policy.configs;

        const loc = new URL(href);
        hostname = loc.hostname;
        // allow popups from the same hostname
        if (configs.domain) {
          try { // if they are not in the same origin
            const h = window.top.location.hostname;
            if (h && hostname && (h.endsWith('.' + hostname) || hostname.endsWith('.' + h) || hostname === h)) {
              block = false;
            }
          }
          catch (e) {}
        }
        // protocol matching
        if (loc.protocol && configs.protocols.indexOf(loc.protocol) !== -1) {
          block = false;
        }
        // white-list matching
        if (hostname) {
          for (const h of configs['popup-hosts']) {
            if (h.endsWith('.' + hostname) || hostname.endsWith('.' + h) || hostname === h) {
              block = false;
            }
          }
        }
      }
      catch (e) {}
    }
  }

  const id = target.dataset.ppbid || Math.random();
  if (sameContext) {
    records[id] = [];
    records[id].args = request.args;
  }
  return {
    id,
    href,
    hostname,
    sameContext,
    block
  };
};
blocker.policy.configs = {
  'domain': false,
  'protocols': ['magnet:'],
  'popup-hosts': ['google.com', 'bing.com', 't.co', 'twitter.com', 'disqus.com', 'login.yahoo.com', 'mail.google.com']
};
chrome.storage.local.get(blocker.policy.configs, ps => Object.assign(blocker.policy.configs, ps));
chrome.storage.onChanged.addListener(ps => {
  Object.keys(ps).filter(k => k in blocker.policy.configs).forEach(k => blocker.policy.configs[k] = ps[k].newValue);
});

/* messaging */
chrome.runtime.onMessage.addListener((request, sender, response) => {
  // apply popup-accept on the context where it is originally requested
  if (request.cmd === 'popup-accepted') {
    port.dataset.enabled = false;

    chrome.runtime.sendMessage({
      cmd: 'run-records',
      url: request.url,
      records: records[request.id],
      args: records[request.id]?.args || []
    }, () => {
      delete records[request.id];
      port.dataset.enabled = prefs.enabled;
    });
  }
  else if (request.cmd === 'use-shadow') {
    port.dataset.shadow = true;
  }
  else if (request.cmd === 'release-beforeunload') {
    redirect.release();
    response(true); // Edge thing!
  }
});
