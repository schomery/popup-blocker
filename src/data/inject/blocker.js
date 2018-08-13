'use strict';

// Firefox issue; document.activeElement is always <body/>
if (/Firefox/.test(navigator.userAgent)) {
  let activeElement = document.documentElement;
  document.addEventListener('click', e => activeElement = e.target, true);

  Object.defineProperty(document, 'activeElement', {
    get() {
      return activeElement;
    }
  });
}

const script = document.createElement('script');
// record fake window's executed commands
const records = {};

const _prefs = { // Firefox issue
  'enabled': true,
  'shadow': false,
  'domain': false,
  'protocols': ['magnet:'],
  'popup-hosts': ['google.com', 'bing.com', 't.co', 'twitter.com', 'disqus.com'],
  'block-page-redirection': false
};
const prefs = new Proxy(_prefs, {
  set(obj, key, value) {
    obj[key] = value;
    // allow the unprotected code to get relevant preferences
    if (key === 'enabled' || key === 'shadow') {
      script.dataset[key] = value;
    }
    return true;
  }
});

// try to get the preferences from the parent element; otherwise get them from chrome.storage
{
  let loaded = false;
  if (window.parent !== window) {
    try {
      Object.assign(prefs, window.parent.prefs);
      loaded = true;
    }
    catch (e) {}
  }
  if (loaded === false) {
    chrome.storage.local.get(_prefs, ps => {
      Object.assign(prefs, ps);
      if (prefs.enabled) {
        chrome.runtime.sendMessage({
          cmd: 'exception',
          href: location.href,
          hostname: location.hostname
        }, response => {
          if (response && response.enabled === false) {
            prefs.enabled = false;
          }
        });
      }
    });
  }
}

// listen for enabled preference changes
chrome.storage.onChanged.addListener(ps => {
  Object.keys(ps).filter(key => key in _prefs).forEach(key => prefs[key] = ps[key].newValue);
});

script.textContent = `{
  // definitions
  const script = document.currentScript;
  const blocker = {};
  // pointers
  const pointers = {
    'mpp': MouseEvent.prototype.preventDefault,
    'hpc': HTMLAnchorElement.prototype.click,
    'hpd': HTMLAnchorElement.prototype.dispatchEvent,
    'hps': HTMLFormElement.prototype.submit,
    'wop': window.open
  };
  // helper functions
  const policy = (type, e, extra = {}) => {
    script.dispatchEvent(new CustomEvent('policy', {
      detail: Object.assign({
        type,
        href: e.action || e.href, // action for form element and href for anchor element
        target: e.target
      }, extra)
    }));
    return {
      id: script.getAttribute('eid'),
      block: script.getAttribute('block') === 'true'
    };
  };
  const watch = (parent, name, callback) => {
    let original = parent[name];
    Object.defineProperty(parent, name, {
      configurable: true,
      get() {
        callback();
        return original;
      },
      set(v) {
        original = v;
      }
    });
  };
  const simulate = (name, root, id) => new Proxy({}, { // window.location.replace
    get(obj, key) {
      return typeof root[key] === 'function' ? function(...args) {
        script.dispatchEvent(new CustomEvent('record', {
          detail: {
            id,
            name,
            method: root[key].name || key, // window.focus
            args
          }
        }));
      } : simulate(key, root[key], id);
    }
  });
  // popup blocker
  blocker.install = () => {
    document.addEventListener('click', blocker.overwrite.click, true); // with capture; see method 8
    window.open = blocker.overwrite.open;
    HTMLAnchorElement.prototype.click = blocker.overwrite.a.click;
    HTMLAnchorElement.prototype.dispatchEvent = blocker.overwrite.a.dispatchEvent;
    HTMLFormElement.prototype.submit = blocker.overwrite.form.submit;
  };
  blocker.remove = () => {
    document.removeEventListener('click', blocker.overwrite.click);
    window.open = pointers.wop;
    HTMLAnchorElement.prototype.click = pointers.hpc;
    HTMLAnchorElement.prototype.dispatchEvent = pointers.hpd;
    HTMLFormElement.prototype.submit = pointers.hps;
  };

  blocker.overwrite = {};
  blocker.overwrite.click = e => {
    //
    if (e.defaultPrevented || e.button !== 0 || (e.metaKey && e.isTrusted)) {
      return;
    }
    // if this is not a form or anchor element, ignore the click
    if (e.target.closest('[target]') === null && e.target.closest('a') === null) {
      return;
    }
    const {block} = policy('element.click', e.target);
    if (block) {
      pointers.mpp.apply(e);
      return true;
    }
  };
  blocker.overwrite.a = {};
  blocker.overwrite.a.click = function(...args) {
    const {block} = policy('dynamic.a.click', this);
    if (!block) {
      pointers.hpc.apply(this, args);
    }
  };
  blocker.overwrite.a.dispatchEvent = function(...args) {
    const {block} = policy('dynamic.a.dispatch', this);
    return block ? false : pointers.hpd.apply(this, args);
  };
  blocker.overwrite.form = {};
  blocker.overwrite.form.submit = function(...args) {
    const {block} = policy('dynamic.form.submit', this);
    return block ? false : pointers.hps.apply(this, args);
  };
  blocker.overwrite.open = function(...args) {
    const {id, block} = policy('window.open', {
      href: args.length ? args[0] : ''
    }, {
      args
    });
    if (block) { // return a window or a window-liked object
      if (script.dataset.shadow === 'true') {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
        return iframe.contentWindow;
      }
      else {
        return simulate('self', window, id);
      }
    }
    else {
      return pointers.wop.apply(window, args);
    }
  };
  // we always install our blocker
  blocker.install();
  // document.open can wipe all the listeners
  let documentElement = document.documentElement;
  watch(document, 'write', () => {
    if (documentElement !== document.documentElement) {
      documentElement = document.documentElement;
      if (script.dataset.enabled !== 'false') {
        blocker.install();
      }
    }
  });
  // configure
  new MutationObserver(() => blocker[script.dataset.enabled === 'false' ? 'remove' : 'install']()).observe(script, {
    attributes: true,
    attributeFilter: ['data-enabled']
  });
}`;
(document.head || document.documentElement).appendChild(script);
script.remove();

const blocker = {};

blocker.hasBase = a => {
  // only check the closest base
  const base = [a, ...document.querySelectorAll('base')]
    .map(e => e && e.target ? e.target.toLowerCase() : '')
    .filter(b => b).shift();
  return ['_tab', '_blank', '_parent'].indexOf(base) !== -1;
};

blocker.policy = request => {
  const target = document.activeElement;
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

    if (href && href.startsWith('http')) {
      const loc = new URL(href);
      hostname = loc.hostname;
      // allow popups from the same hostname
      if (prefs.domain) {
        try { // if they are not in the same origin
          const h = window.top.location.hostname;
          if (h && hostname && (h.endsWith(hostname) || hostname.endsWith(h))) {
            block = false;
          }
        }
        catch (e) {}
      }
      // protocol matching
      if (loc.protocol && prefs.protocols.indexOf(loc.protocol) !== -1) {
        block = false;
      }
      // white-list matching
      for (const h of prefs['popup-hosts']) {
        if (h.endsWith(hostname) || hostname.endsWith(h)) {
          block = false;
        }
      }
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

// page redirection; prevent the page redirection when popup opening is unsuccessful for 2 seconds
var redirect = {
  timeout: null,
  beforeunload: e => {
    e.returnValue = 'false';
  },
  block: () => {
    if (prefs['block-page-redirection'] && window.top === window) {
      window.addEventListener('beforeunload', redirect.beforeunload);
      window.clearTimeout(redirect.timeout);
      redirect.timeout = window.setTimeout(() => {
        window.removeEventListener('beforeunload', redirect.beforeunload);
      }, 2000);
    }
  }
};
// channel
script.addEventListener('policy', e => {
  // make sure the request is from our script; see example 1
  if (e.target === script) {
    if (prefs.enabled) {
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

// record
script.addEventListener('record', e => {
  const {id, name, method, args} = e.detail;
  records[id].push({name, method, args});
});

// perform popup accepted command on the same context
chrome.runtime.onMessage.addListener(request => {
  // apply popup-accept on the context where it is originally requested
  if (request.cmd === 'popup-accepted') {
    prefs.enabled = false;
    const script = document.createElement('script');
    if (records[request.id]) {
      script.dataset.commands = JSON.stringify(records[request.id]);
      delete records[request.id];
      script.textContent = `{
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
      script.textContent = `{
        const a = document.createElement('a');
        a.target = '_blank';
        a.href = '${request.url}';
        a.click();
      }`;
    }
    document.body.appendChild(script);
    script.remove();
    prefs.enabled = true;
  }
  else if (request.cmd === 'use-shadow') {
    prefs.shadow = true;
  }
});
