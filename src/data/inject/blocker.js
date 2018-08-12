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
  const properties = {}; // temporarily store window.open commands
  // pointers
  const pointers = {
    'epd': EventTarget.prototype.dispatchEvent,
    'mpp': MouseEvent.prototype.preventDefault,
    'dce': Document.prototype.createElement,
    'wop': window.open
  };
  // helper functions
  const policy = detail => {
    script.dispatchEvent(new CustomEvent('policy', {
      detail
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
    // console.log('installing the blocker');
    // addEventListener with capture; see method 8
    document.addEventListener('click', blocker.overwrite.click, true);
    window.open = blocker.overwrite.open;
    Document.prototype.createElement = blocker.overwrite.createElement;
    EventTarget.prototype.dispatchEvent = blocker.overwrite.dispatchEvent;
  };
  blocker.remove = () => {
    // console.log('removing the blocker');
    document.removeEventListener('click', blocker.overwrite.click);
    window.open = pointers.wop;
    Document.prototype.createElement = pointers.dce;
    EventTarget.prototype.dispatchEvent = pointers.epd;
  };

  blocker.overwrite = {};
  blocker.overwrite.click = e => {
    if (e.defaultPrevented || e.button !== 0 || (e.metaKey && e.isTrusted)) {
      return;
    }
    const {block} = policy({
      type: 'element.click',
      href: e.target.href // always send href since active element might be different from e.target; see method 12/4
    });
    if (block) {
      pointers.mpp.apply(e);
      return true;
    }
  };
  blocker.overwrite.open = function(href) {
    const {id, block} = policy({
      type: 'window.open',
      href,
      args: [...arguments]
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
      return pointers.wop.apply(window, arguments);
    }
  };
  blocker.overwrite.createElement = function(tagName = '') {
    const target = pointers.dce.apply(document, arguments);
    const tag = tagName.toString().toLowerCase();
    if (tag === 'a') {
      target.addEventListener('click', e => {
        const {block} = policy({
          type: 'dynamic.a.click',
          href: target.href,
          target: target.target
        });
        if (block) {
          pointers.mpp.apply(e);
          return true;
        }
      }, false);
      // prevent dispatching click event
      const dispatchEvent = target.dispatchEvent;
      target.dispatchEvent = function(e) {
        if (e.type === 'click') {
          const {block} = policy({
            type: 'dynamic.a.dispatch',
            href: target.href
          });
          if (block) {
            return false;
          }
        }
        return dispatchEvent.apply(this, arguments);
      };
    }
    else if (tag === 'form') {
      const submit = target.submit;
      target.submit = function() {
        const {block} = policy({
          type: 'dynamic.form.submit',
          href: target.action || target.href
        });
        if (block) {
          return false;
        }
        return submit.apply(this, arguments);
      };
    }
    return target;
  };
  blocker.overwrite.dispatchEvent = function(e) {
    if (e.type === 'click') {
      const {block} = policy({
        type: 'dispatchEvent.click',
        href: this.closest('a').href
      });
      if (block) {
        return false;
      }
    }
    return pointers.epd.apply(this, arguments);
  };
  blocker.install();
  // document.open can wipe all the listeners
  {
    let documentElement = document.documentElement;
    watch(document, 'write', () => {
      if (documentElement !== document.documentElement) {
        documentElement = document.documentElement;
        if (script.dataset.enabled !== 'false') {
          blocker.install();
        }
      }
    });
  }
  // configure
  new MutationObserver(() => {
    blocker[script.dataset.enabled === 'false' ? 'remove' : 'install']();
  }).observe(script, {
    attributes: true,
    attributeFilter: ['data-enabled']
  });
}`;
(document.head || document.documentElement).appendChild(script);
script.remove();

const blocker = {};

blocker.hasBase = a => [...document.querySelectorAll('base'), a]
  .filter(a => a)
  .reduce((p, c) => p || ['_tab', '_blank'].includes(c.target.toLowerCase()), false);

blocker.policy = request => {
  // this is useful when a new iframe is loaded when the blocker is disabled but the preferences are not yet ported
  if (prefs.enabled === false) {
    return {
      block: false
    };
  }
  //
  const target = document.activeElement;
  const {type} = request;
  let href = request.href;
  let hostname = '';
  let block = true;
  let sameContext = false;

  if (type === 'element.click') {
    const a = 'closest' in target ? (target.closest('[target]') || target.closest('a')) : null;

    if (!href && a) {
      href = a.href || a.action;
    }
    // we are blocking either if a is found or href is provided; see method 12/4
    block = Boolean(a) || href;
    // check base
    block = block && blocker.hasBase(a);
  }
  else if (type === 'dynamic.a.click') {
    block = block && blocker.hasBase({
      target: request.target
    });
  }
  else if (type === 'window.open') {
    // always run window open on the same context
    sameContext = true;
  }
  // fix relative href
  if (href && href.indexOf(':') === -1) {
    const a = document.createElement('a');
    a.setAttribute('href', href);
    href = a.href;
  }
  // create a unique id when "href" is not usable
  if (block && (!href || href.startsWith('about:'))) {
    target.dataset.ppbid = target.dataset.ppbid || Math.random();
  }

  if (block && href && href.startsWith('http')) {
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
});

// record
script.addEventListener('record', e => {
  const {id, name, method, args} = e.detail;
  records[id].push({name, method, args});
});

// popup-accepted
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
});
