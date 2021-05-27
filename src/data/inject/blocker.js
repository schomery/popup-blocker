/* global uncode */
'use strict';

// record fake window's executed commands
const records = {};

/* page redirection; prevent the page redirection when popup opening is unsuccessful for 2 seconds */
const redirect = {
  timeout: null,
  beforeunload(e) {
    e.returnValue = 'false';
  },
  block() {
    if (window.top === window) {
      chrome.storage.local.get({
        'block-page-redirection': false,
        'block-page-redirection-period': 2000
      }, prefs => {
        if (prefs['block-page-redirection']) {
          window.addEventListener('beforeunload', redirect.beforeunload);
          clearTimeout(redirect.timeout);
          redirect.timeout = setTimeout(redirect.release, prefs['block-page-redirection-period']);
        }
      });
    }
  },
  release() {
    window.removeEventListener('beforeunload', redirect.beforeunload);
    clearTimeout(redirect.timeout);
  }
};

const script = document.createElement('script');
try {
  script.dataset.enabled = true;
}
catch (e) {
  script.dataset = script.dataset = {}; // XML documents
}

const prefs = window.prefs = new Proxy({}, {
  set(obj, key, value) {
    obj[key] = value;
    if (key === 'shadow' || key === 'aggressive') {
      script.dataset[key] = value;
    }
    if (key === 'enabled') {
      script.dataset[key] = value === true;
      if (window === window.top) {
        console.log('- >', window.enabled);
        chrome.runtime.sendMessage({
          'cmd': 'state',
          'active': value === true
        });
      }
    }
    return true;
  }
});
if ('enabled' in window) {
  prefs.enabled = window.enabled;
}
else {
  try {
    prefs.enabled = parent.enabled;
  }
  catch (e) { // this is a CORS frame on Chrome
    chrome.runtime.sendMessage({
      cmd: 'is-active'
    });
  }
}
chrome.storage.onChanged.addListener(ps => {
  if (ps.enabled && ps.enabled.newValue === false) {
    prefs.enabled = false;
  }
  else if (ps.enabled) {
    prefs.enabled = 'enabled' in window ? window.enabled : true;
  }
});
console.log('bb', location.href, prefs.enabled, window.enabled);

/* recording window.open */
script.addEventListener('record', e => {
  e.stopPropagation();
  const {id, name, method, args} = e.detail;
  records[id].push({name, method, args});
});
/* channel */
script.addEventListener('policy', e => {
  e.stopPropagation();
  // make sure the request is from our script; see example 1
  if (e.target === script) {
    if (script.dataset.enabled !== 'false') {
      const request = e.detail;
      const {block, id, href, hostname} = blocker.policy(request);
      script.setAttribute('eid', id);
      script.setAttribute('block', block);

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
      script.setAttribute('block', false);
    }
  }
});

/* inject unprotected */
script.textContent = `(${uncode.toString()})()`;
document.documentElement.appendChild(script);
script.remove();

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
    records[id] = [{
      name: 'self',
      method: 'open',
      args: request.args
    }];
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
  'popup-hosts': ['google.com', 'bing.com', 't.co', 'twitter.com', 'disqus.com']
};
chrome.storage.local.get(blocker.policy.configs, ps => Object.assign(blocker.policy.configs, ps));
chrome.storage.onChanged.addListener(ps => {
  Object.keys(ps).filter(k => k in blocker.policy.configs).forEach(k => blocker.policy.configs[k] = ps[k].newValue);
  console.log(blocker.policy.configs, ps);
});

/* messaging */
chrome.runtime.onMessage.addListener((request, sender, response) => {
  // apply popup-accept on the context where it is originally requested
  if (request.cmd === 'popup-accepted') {
    script.dataset.enabled = false;
    const s = document.createElement('script');
    if (records[request.id]) {
      s.dataset.commands = JSON.stringify(records[request.id]);
      delete records[request.id];
      s.textContent = `{
        const [{method, args}, ...commands] = JSON.parse(document.currentScript.dataset.commands);
        const loaded = [window[method].apply(window, args)];
        commands.forEach(({name, method, args}) => {
          const o = loaded.map(o => o[name]).filter(o => o).shift();
          if (loaded.indexOf(o) === -1) {
            loaded.push(o);
          }
          o[method].apply(o, args);
        });
      }`;
    }
    else {
      s.textContent = `{
        const a = document.createElement('a');
        a.target = '_blank';
        a.href = '${request.url}';
        a.click();
      }`;
    }
    document.body.appendChild(s);
    s.remove();
    script.dataset.enabled = prefs.enabled;
  }
  else if (request.cmd === 'use-shadow') {
    script.dataset.shadow = true;
  }
  else if (request.cmd === 'release-beforeunload') {
    redirect.release();
    response(true); // Edge thing!
  }
});
