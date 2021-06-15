/* this is the entire unprotected code */

/*
  aggressive: 1; basic protection
  aggressive: 2; basic protection + frame protection
  aggressive: 3; basic protection + frame protection + mutation protection
*/
const uncode = (aggressive = 3) => {
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

  /* blocker */
  const blocker = {};

  blocker.frame = target => {
    const {src, tagName} = target;
    if (src && (tagName === 'IFRAME' || tagName === 'FRAME')) {
      const s = src.toLowerCase();
      if (s.startsWith('javascript:') || s.startsWith('data:')) {
        console.log('frame protection', s);
        try {
          blocker.install(target.contentWindow);
        }
        catch (e) {}
      }
    }
  };

  blocker.onclick = e => {
    const a = e.target.closest('[target]') || e.target.closest('a');
    // if this is not a form or anchor element, ignore the click
    if (a && policy('element.click', a, e).block) {
      blocker.onclick.pointer.apply(e);
      return true;
    }
  };
  blocker.onclick.pointer = MouseEvent.prototype.preventDefault;

  blocker.install = (w = window) => {
    if (script.dataset.enabled === 'false' || protected.has(w)) {
      return;
    }
    const d = w.document;
    protected.set(w);

    /* overwrites */
    w.HTMLAnchorElement.prototype.click = new Proxy(w.HTMLAnchorElement.prototype.click, {
      apply(target, self, args) {
        const {block} = policy('dynamic.a.click', self);
        return block ? undefined : Reflect.apply(target, self, args);
      }
    });
    w.HTMLAnchorElement.prototype.dispatchEvent = new Proxy(w.HTMLAnchorElement.prototype.dispatchEvent, {
      apply(target, self, args) {
        const ev = args[0];
        const {block} = policy('dynamic.a.dispatch', self, ev);
        return block ? false : Reflect.apply(target, self, args);
      }
    });
    w.HTMLFormElement.prototype.submit = new Proxy(w.HTMLFormElement.prototype.submit, {
      apply(target, self, args) {
        const {block} = policy('dynamic.form.submit', self);
        return block ? false : Reflect.apply(target, self, args);
      }
    });
    w.HTMLFormElement.prototype.dispatchEvent = new Proxy(w.HTMLFormElement.prototype.dispatchEvent, {
      apply(target, self, args) {
        const {block} = policy('dynamic.form.dispatch', self);
        return block ? false : Reflect.apply(target, self, args);
      }
    });

    /* iframe mess */
    if (aggressive > 1) {
      const prx = {
        apply(target, self, args) {
          const r = Reflect.apply(target, self, args);
          for (const e of [r, ...args]) {
            if (e && e.nodeType === 1) {
              blocker.frame(e);
            }
          }
          return r;
        }
      };
      w.HTMLElement.prototype.prepend = new Proxy(w.HTMLElement.prototype.prepend, prx);
      w.HTMLElement.prototype.append = new Proxy(w.HTMLElement.prototype.append, prx);
      w.HTMLElement.prototype.after = new Proxy(w.HTMLElement.prototype.after, prx);
      w.HTMLElement.prototype.before = new Proxy(w.HTMLElement.prototype.before, prx);
      w.HTMLElement.prototype.appendChild = new Proxy(w.HTMLElement.prototype.appendChild, prx);
      w.HTMLElement.prototype.insertBefore = new Proxy(w.HTMLElement.prototype.insertBefore, prx);
      w.HTMLElement.prototype.insertAdjacentElement = new Proxy(w.HTMLElement.prototype.insertAdjacentElement, prx);
      w.HTMLElement.prototype.replaceChild = new Proxy(w.HTMLElement.prototype.replaceChild, prx);
    }

    /* iframe creation with innerHTML */
    if (aggressive > 2) {
      new MutationObserver(ms => {
        for (const m of ms) {
          for (const e of m.addedNodes) {
            blocker.frame(e);
            if (e.childElementCount) {
              [...e.querySelectorAll('iframe')].forEach(blocker.frame);
            }
          }
        }
      }).observe(d, {childList: true, subtree: true});
    }

    /* click */
    d.addEventListener('click', blocker.onclick, true); // with capture;

    /* window.open */
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

    /* DOM replacement (document.open removes all the DOM listeners) */
    let dHTML = d.documentElement;
    d.write = new Proxy(d.write, {
      apply(target, self, args) {
        const r = Reflect.apply(target, self, args);
        if (dHTML !== self.documentElement) {
          dHTML = self.documentElement;
          protected.delete(self.defaultView);
          blocker.install(self.defaultView);
        }
        return r;
      }
    });
  };
  blocker.remove = (w = window, d = document) => {
    if (script.dataset.enabled === 'false' && protected.has(w)) {
      protected.delete(w);
      d.removeEventListener('click', blocker.onclick);
    }
  };

  // always install since we do not know the enabling status right now
  blocker.install();

  // receive configure
  new MutationObserver(() => {
    blocker[script.dataset.enabled === 'false' ? 'remove' : 'install']();
  }).observe(script, {
    attributes: true,
    attributeFilter: ['data-enabled']
  });
};
