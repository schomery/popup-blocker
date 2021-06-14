/* this is the entire unprotected code */

const uncode = () => {
  const script = document.currentScript;
  script.dataset.injected = true;

  const post = (name, detail) => script.dispatchEvent(new CustomEvent(name, {
    detail
  }));
  /* ask the script to validate a request */
  const policy = (type, element, event, extra = {}) => {
    if (script.dataset.enabled === 'false') {
      return {
        block: false
      };
    }
    if (event) {
      extra.defaultPrevented = event.defaultPrevented;
      extra.metaKey = event.metaKey;
      extra.button = event.button || 0;
      extra.isTrusted = event.isTrusted;
    }
    post('policy', {
      type,
      href: element.action || element.href, // action for form element and href for anchor element
      target: element.target,
      ...extra
    });
    return {
      id: script.getAttribute('eid'),
      block: script.getAttribute('block') === 'true'
    };
  };
  /* simulate a window */
  const simulate = (name, root, id) => new Proxy({}, { // window.location.replace
    get(obj, key) {
      return typeof root[key] === 'function' ? function(...args) {
        post('record', {
          id,
          name,
          method: root[key].name || key, // window.focus
          args
        });
      } : simulate(key, root[key], id);
    }
  });
  const protected = new WeakMap(); // keep reference of all protected window objects
  // blocker
  const blocker = {
    install(w = window) {
      if (script.dataset.enabled !== 'false' && protected.has(w) === false) {
        const d = w.document;
        protected.set(w);
        // protect clicks
        d.addEventListener('click', blocker.onclick, true); // with capture; see method 8
        // protect window.open
        w.open = new Proxy(w.open, {
          apply(target, self, args) {
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
            return Reflect.apply(target, self, args);
          }
        });
      }
    },
    remove(w = window, d = document) {
      if (script.dataset.enabled === 'false' && protected.has(w)) {
        protected.delete(w);
        d.removeEventListener('click', blocker.onclick);
      }
    }
  };
  // overwrites
  const mpp = MouseEvent.prototype.preventDefault;
  blocker.onclick = e => {
    const a = e.target.closest('[target]') || e.target.closest('a');
    // if this is not a form or anchor element, ignore the click
    if (a && policy('element.click', a, e).block) {
      mpp.apply(e);
      return true;
    }
  };
  /* permanent overwrites */
  HTMLAnchorElement.prototype.click = new Proxy(HTMLAnchorElement.prototype.click, {
    apply(target, self, args) {
      const {block} = policy('dynamic.a.click', self);
      return block ? undefined : Reflect.apply(target, self, args);
    }
  });
  HTMLAnchorElement.prototype.dispatchEvent = new Proxy(HTMLAnchorElement.prototype.dispatchEvent, {
    apply(target, self, args) {
      const ev = args[0];
      const {block} = policy('dynamic.a.dispatch', self, ev);
      return block ? false : Reflect.apply(target, self, args);
    }
  });
  HTMLFormElement.prototype.submit = new Proxy(HTMLFormElement.prototype.submit, {
    apply(target, self, args) {
      const {block} = policy('dynamic.form.submit', self);
      return block ? false : Reflect.apply(target, self, args);
    }
  });
  HTMLFormElement.prototype.dispatchEvent = new Proxy(HTMLFormElement.prototype.dispatchEvent, {
    apply(target, self, args) {
      const {block} = policy('dynamic.form.dispatch', self);
      return block ? false : Reflect.apply(target, self, args);
    }
  });
  /* iframe mess */
  const frame = target => {
    const {src, tagName} = target;
    if (src && tagName === 'IFRAME') {
      const s = src.toLowerCase();
      if (s.startsWith('javascript:') || s.startsWith('data:')) {
        try {
          blocker.install(target.contentWindow);
        }
        catch (e) {}
      }
    }
  };
  HTMLElement.prototype.appendChild = new Proxy(HTMLElement.prototype.appendChild, {
    apply(target, self, args) {
      const r = Reflect.apply(target, self, args);
      frame(r);
      return r;
    }
  });
  HTMLElement.prototype.prepend = new Proxy(HTMLElement.prototype.prepend, {
    apply(target, self, args) {
      const r = Reflect.apply(target, self, args);
      (args || []).forEach(frame);
      return r;
    }
  });
  HTMLElement.prototype.append = new Proxy(HTMLElement.prototype.append, {
    apply(target, self, args) {
      const r = Reflect.apply(target, self, args);
      (args || []).forEach(frame);
      return r;
    }
  });

  document.addEventListener('load', ({target}) => frame(target), true);
  if (script.dataset.aggressive === 'true') {
    new MutationObserver(ms => {
      for (const m of ms) {
        for (const e of m.addedNodes) {
          frame(e);
        }
      }
    }).observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  // always install since we do not know the enabling status right now
  blocker.install();
  // document.open removes all the DOM listeners
  let dHTML = document.documentElement;
  document.write = new Proxy(document.write, {
    apply(target, self, args) {
      const r = Reflect.apply(target, self, args);
      if (dHTML !== document.documentElement) {
        dHTML = document.documentElement;
        self.addEventListener('click', blocker.onclick, true); // reinstall the click listener
      }
      return r;
    }
  });
  // receive configure
  new MutationObserver(() => {
    blocker[script.dataset.enabled === 'false' ? 'remove' : 'install']();
  }).observe(script, {
    attributes: true,
    attributeFilter: ['data-enabled']
  });
};
