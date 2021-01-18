'use strict';

if (document.contentType === 'text/html') {
  const isFirefox = /Firefox/.test(navigator.userAgent);
  // Firefox issue; document.activeElement is always <body/>
  if (isFirefox) {
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
  // should I display popups
  let silent = false;
  window.silent = silent;
  // access to the parent frame
  let access = false;

  // default preferences
  const _prefs = {
    'enabled': true,
    'shadow': false,
    'domain': false,
    'protocols': ['magnet:'],
    'popup-hosts': ['google.com', 'bing.com', 't.co', 'twitter.com', 'disqus.com'],
    'block-page-redirection': false
  };
  const verify = () => access === false && chrome.runtime.sendMessage({
    cmd: 'exception',
    href: location.href,
    hostname: location.hostname
  }, response => {
    silent = response.silent;
    _prefs.enabled = response.enabled;
    script.dataset.enabled = response.enabled;
    script.dataset.state = response.state; // global state
  });

  const prefs = new Proxy(_prefs, {
    set(obj, key, value) {
      obj[key] = value;
      // allow the unprotected code to get relevant preferences
      if (key === 'shadow') {
        script.dataset.shadow = value;
      }
      // double check the prefs.enabled with the bg page for top and cross-origin frames
      if (key === 'enabled') {
        script.dataset.enabled = value;
        verify();
      }
      return true;
    }
  });
  window.prefs = prefs;

  // try to get the preferences from the top element; otherwise get them from chrome.storage
  if (window.parent !== window) {
    try {
      if (window.parent.prefs !== undefined) { // Firefox issue
        access = true;
        Object.assign(prefs, window.parent.prefs);
        silent = window.parent.silent;
      }
    }
    catch (e) {}
  }
  if (access === false) {
    chrome.storage.local.get(_prefs, ps => {
      Object.assign(prefs, ps);
    });
  }

  // listen for enabled preference changes
  chrome.storage.onChanged.addListener(ps => {
    Object.keys(ps).filter(key => key in _prefs).forEach(key => prefs[key] = ps[key].newValue);
  });

  // state
  script.addEventListener('state', e => {
    e.stopPropagation();
    if (window.top === window) {
      console.log(e.detail);
      chrome.runtime.sendMessage({
        'cmd': 'state',
        'active': e.detail === 'install'
      });
    }
  });

  script.dataset.enabled = prefs.enabled;
  script.textContent = `{
    const script = document.currentScript;
    // pointers
    const pointers = {
      'mpp': MouseEvent.prototype.preventDefault,
      'hac': HTMLAnchorElement.prototype.click,
      'had': HTMLAnchorElement.prototype.dispatchEvent,
      'hfs': HTMLFormElement.prototype.submit,
      'hfd': HTMLFormElement.prototype.dispatchEvent,
      'wop': window.open,
      'hps': Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src'),
      'hpd': Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentDocument'),
      'hpw': Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow')
    };

    // helper functions
    const policy = (type, element, event, extra = {}) => {
      if (event) {
        extra.defaultPrevented = event.defaultPrevented;
        extra.metaKey = event.metaKey;
        extra.button = event.button || 0;
        extra.isTrusted = event.isTrusted;
      }
      script.dispatchEvent(new CustomEvent('policy', {
        detail: Object.assign({
          type,
          href: element.action || element.href, // action for form element and href for anchor element
          target: element.target
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
    // blocker
    let currentState = false;
    const blocker = {
      install(w = window, d = document, forced = false) {
        if (script.dataset.enabled !== 'false' && (w.open !== blocker.overwrite.open || forced)) {
          currentState = true;
          d.addEventListener('click', blocker.overwrite.click, true); // with capture; see method 8
          w.open = blocker.overwrite.open;
          const {HTMLAnchorElement, HTMLFormElement, HTMLIFrameElement} = w;
          HTMLAnchorElement.prototype.click = blocker.overwrite.a.click;
          HTMLAnchorElement.prototype.dispatchEvent = blocker.overwrite.a.dispatchEvent;
          HTMLFormElement.prototype.submit = blocker.overwrite.form.submit;
          HTMLFormElement.prototype.dispatchEvent = blocker.overwrite.form.dispatchEvent;

          // TO-DO; remove when "match_data_urls" is supported
          Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
            set(v) {
              const src = v.toLowerCase();
              if (src.startsWith('javascript:') || src.startsWith('data:')) {
                // before contentDocument or contentWindow is accessed, install the installer script
                const inject = () => {
                  const w = pointers.hpw.get.call(this);
                  const d = pointers.hpd.get.call(this);
                  if (w && d) {
                    blocker.install(w, d);
                    Object.defineProperty(this, 'contentDocument', pointers.hpd);
                    Object.defineProperty(this, 'contentWindow', pointers.hpw);
                  }
                };
                Object.defineProperty(HTMLIFrameElement.prototype, 'contentDocument', {
                  get() {
                    inject();
                    return pointers.hpd.get.call(this);
                  }
                });
                Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
                  get() {
                    inject();
                    return pointers.hpw.get.call(this);
                  }
                });
              }
              pointers.hps.set.call(this, v);
            }
          });
          script.dispatchEvent(new CustomEvent('state', {
            detail: 'install'
          }));
        }
      },
      remove() {
        if (script.dataset.enabled === 'false' && currentState === true) {
          currentState = false;
          document.removeEventListener('click', blocker.overwrite.click);
          window.open = pointers.wop;
          HTMLAnchorElement.prototype.click = pointers.hac;
          HTMLAnchorElement.prototype.dispatchEvent = pointers.had;
          HTMLFormElement.prototype.submit = pointers.hfs;
          HTMLFormElement.prototype.dispatchEvent = pointers.hfd;
          Object.defineProperty(HTMLIFrameElement.prototype, 'contentDocument', pointers.hpd);
          Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', pointers.hpw);
          Object.defineProperty(HTMLIFrameElement.prototype, 'src', pointers.hps);

          script.dispatchEvent(new CustomEvent('state', {
            detail: 'remove'
          }));
        }
        else if (script.dataset.state !== script.dataset.enabled) {
          script.dispatchEvent(new CustomEvent('state', {
            detail: 'remove'
          }));
        }
      }
    };
    // overwrites
    blocker.overwrite = {};
    blocker.overwrite.click = e => {
      const a = e.target.closest('[target]') || e.target.closest('a');
      // if this is not a form or anchor element, ignore the click
      if (a && policy('element.click', a, e).block) {
        pointers.mpp.apply(e);
        return true;
      }
    };
    blocker.overwrite.a = {};
    blocker.overwrite.a.click = function(...args) {
      const {block} = policy('dynamic.a.click', this);
      if (!block) {
        pointers.hac.apply(this, args);
      }
    };
    blocker.overwrite.a.dispatchEvent = function(...args) {
      const e = args[0];
      const {block} = policy('dynamic.a.dispatch', this, e);
      return block ? false : pointers.had.apply(this, args);
    };
    blocker.overwrite.form = {};
    blocker.overwrite.form.submit = function(...args) {
      const {block} = policy('dynamic.form.submit', this);
      return block ? false : pointers.hfs.apply(this, args);
    };
    blocker.overwrite.form.dispatchEvent = function(...args) {
      const {block} = policy('dynamic.form.dispatch', this);
      return block ? false : pointers.hfd.apply(this, args);
    };
    blocker.overwrite.open = function(...args) {
      const {id, block} = policy('window.open', {
        href: args.length ? args[0] : ''
      }, null, {
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
    // always install since we do not know the enabling status right now
    blocker.install();
    // TO-DO; remove when "match_data_urls" is supported
    document.addEventListener('load', e => {
      const {src, tagName} = e.target;
      if (src && tagName === 'IFRAME') {
        const v = src.toLowerCase();
        if (v.startsWith('javascript:') || v.startsWith('data:')) {
          try {
            blocker.install(e.target.contentWindow, e.target.contentDocument);
          }
          catch (e) {}
        }
      }
    }, true);
    // document.open removes all the DOM listeners
    let documentElement = document.documentElement;
    watch(document, 'write', () => {
      if (documentElement !== document.documentElement) {
        documentElement = document.documentElement;
        blocker.install(window, document, true);
      }
    });
    // receive configure
    new MutationObserver(ms => {
      const m = ms.filter(m => m.attributeName === 'data-enabled').shift();
      if (m) {
        blocker[script.dataset.enabled === 'false' ? 'remove' : 'install']();
      }
    }).observe(script, {
      attributes: true,
      attributeFilter: ['data-enabled']
    });
  }`;
  (document.head || document.documentElement).appendChild(script);
  script.remove();

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
    if (isFirefox) {
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
          const loc = new URL(href);
          hostname = loc.hostname;
          // allow popups from the same hostname
          if (prefs.domain) {
            try { // if they are not in the same origin
              const h = window.top.location.hostname;
              if (h && hostname && (h.endsWith('.' + hostname) || hostname.endsWith('.' + h) || hostname === h)) {
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
          if (hostname) {
            for (const h of prefs['popup-hosts']) {
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

  // page redirection; prevent the page redirection when popup opening is unsuccessful for 2 seconds
  const redirect = {
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
    },
    release: () => {
      window.removeEventListener('beforeunload', redirect.beforeunload);
      window.clearTimeout(redirect.timeout);
    }
  };
  // channel
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
            id,
            silent
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
    e.stopPropagation();
    const {id, name, method, args} = e.detail;
    records[id].push({name, method, args});
  });

  // perform popup accepted command on the same context
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
      prefs.shadow = true;
    }
    else if (request.cmd === 'release-beforeunload') {
      redirect.release();
      response(true); // Edge thing!
    }
  });
}
