/* global uncode */
'use strict';

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
      if (redirect.prefs['block-page-redirection']) {
        window.addEventListener('beforeunload', redirect.beforeunload, true);
        clearTimeout(redirect.timeout);
        redirect.timeout = setTimeout(redirect.release, redirect.prefs['block-page-redirection-period']);
      }
    }
  },
  release() {
    window.removeEventListener('beforeunload', redirect.beforeunload, true);
    clearTimeout(redirect.timeout);
  }
};
chrome.storage.local.get({
  'block-page-redirection': false,
  'block-page-redirection-period': 2000
}, prefs => redirect.prefs = prefs);


let script = document.createElement('script');
try {
  script.dataset.enabled = true;
}
catch (e) {
  script.dataset = {}; // XML documents
}

const prefs = window.prefs = new Proxy({}, {
  set(obj, key, value) {
    obj[key] = value;

    if (key === 'enabled') {
      script.dataset[key] = value === true;
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

if (typeof isFirefox !== 'undefined') {
  prefs.enabled = 'enabled' in window ? window.enabled : false;
  chrome.storage.onChanged.addListener(ps => {
    if (ps.enabled && ps.enabled.newValue === false) {
      prefs.enabled = false;
    }
    else if (ps.enabled) {
      prefs.enabled = 'enabled' in window ? window.enabled : true;
    }
  });
}
else { // Chrome
  // for top frame, the extension is always enabled unless get disabled by "window.enabled"
  if (window.top === window) {
    if (document.contentType === 'text/html') {
      prefs.enabled = 'enabled' in window ? window.enabled : true;
    }
    else {
      prefs.enabled = false;
    }
  }
  else {
    try {
      prefs.enabled = parent.prefs.enabled;
    }
    catch (e) { // this is a CORS frame on Chrome
      chrome.runtime.sendMessage({
        cmd: 'is-active'
      });
    }
  }
  chrome.storage.onChanged.addListener(ps => {
    if (ps.enabled) {
      prefs.enabled = ps.enabled.newValue;
    }
  });
}

/* recording window.open */
script.record = e => {
  e.stopPropagation();
  const {id, name, method, args} = e.detail;
  records[id].push({name, method, args});
};
script.addEventListener('record', script.record);
/* channel */
script.policy = e => {
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
};
script.addEventListener('policy', script.policy);

/* inject unprotected */
script.textContent = '(' + uncode.toString() + ')(3)';

// https://github.com/schomery/popup-blocker/issues/135
if (document.contentType === 'text/html') {
  document.documentElement.appendChild(script);
  if (script.dataset.injected === 'true') {
    script.remove();
  }
  else { // Firefox does not inject if there is CSP!
    const s = document.createElement('script');
    s.src = 'data:text/javascript;charset=utf-8;base64,' + btoa(`(${uncode.toString()})()`);
    Object.assign(s.dataset, script.dataset);
    s.addEventListener('policy', script.policy);
    s.addEventListener('record', script.record);
    s.onload = () => s.remove();
    document.documentElement.appendChild(s);
    script.remove();
    script = s;
    // console.warn('Popup Blocker (script)', 'Async injection due to CSP', location.href);
  }
}

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
