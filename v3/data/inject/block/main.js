/* this is the entire unprotected code */
{
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

  const post = (name, detail) => port.dispatchEvent(new CustomEvent(name, {
    detail
  }));

  /*
    aggressive: 1; basic protection
    aggressive: 2; basic protection + frame protection
    aggressive: 3; basic protection + frame protection + mutation protection
  */
  const uncode = (aggressive = 3) => {
    /* validate a request */
    const policy = (type, element, event, extra = {}) => {
      if (port.dataset.enabled === 'false') {
        return {
          block: false
        };
      }
      if (event) {
        extra.defaultPrevented = event.defaultPrevented;
        extra.metaKey = event.metaKey || event.ctrlKey;
        extra.button = event.button || 0;
        extra.isTrusted = event.isTrusted;
      }
      post('policy', {
        type,
        href: element.action || element.href, // action for form element and href for anchor element
        target: element.target,
        download: element.download,
        tag: element.tagName,
        ...extra
      });
      return {
        id: port.getAttribute('eid'),
        block: port.getAttribute('block') === 'true'
      };
    };
    /* simulate a window */
    const simulate = (id, root = {}, tree = []) => new Proxy(root, { // window.location.replace
      get(obj, key) {
        return typeof root[key] === 'function' ? function(...args) {
          post('record', {
            id,
            tree,
            action: {
              method: key,
              args
            }
          });
        } : simulate(id, root[key], [...tree, key]);
      },
      set(obj, key, value) {
        if (value) {
          post('record', {
            id,
            tree,
            action: {
              value,
              prop: key
            }
          });
        }
        return true;
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
      if (port.dataset.enabled === 'false' || protected.has(w)) {
        return;
      }
      const d = w.document;
      protected.set(w);

      /* overwrites */
      const {HTMLAnchorElement, HTMLFormElement} = w;
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
      if (aggressive > 2) {
        const {HTMLIFrameElement, HTMLFrameElement} = w;

        const wf = Object.getOwnPropertyDescriptor(HTMLFrameElement.prototype, 'contentWindow');
        Object.defineProperty(HTMLFrameElement.prototype, 'contentWindow', {
          configurable: true,
          enumerable: true,
          get: function() {
            const w = wf.get.call(this);
            try {
              blocker.install(w);
            }
            catch (e) {}
            Object.defineProperty(this, 'contentWindow', {
              configurable: true,
              enumerable: true,
              value: w
            });
            return w;
          }
        });
        const wif = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
        Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
          configurable: true,
          enumerable: true,
          get: function() {
            const w = wif.get.call(this);
            try {
              blocker.install(w);
            }
            catch (e) {}
            Object.defineProperty(this, 'contentWindow', {
              configurable: true,
              enumerable: true,
              value: w
            });
            return w;
          }
        });
        const cf = Object.getOwnPropertyDescriptor(HTMLFrameElement.prototype, 'contentDocument');
        Object.defineProperty(HTMLFrameElement.prototype, 'contentDocument', {
          configurable: true,
          enumerable: true,
          get: function() {
            const d = cf.get.call(this);
            try {
              blocker.install(d.defaultView);
            }
            catch (e) {}
            Object.defineProperty(this, 'contentDocument', {
              configurable: true,
              enumerable: true,
              value: d
            });
            return d;
          }
        });
        const cif = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentDocument');
        Object.defineProperty(HTMLIFrameElement.prototype, 'contentDocument', {
          configurable: true,
          enumerable: true,
          get: function() {
            const d = cif.get.call(this);
            try {
              blocker.install(d.defaultView);
            }
            catch (e) {}
            Object.defineProperty(this, 'contentDocument', {
              configurable: true,
              enumerable: true,
              value: d
            });
            return d;
          }
        });
      }

      /* iframe creation with innerHTML */
      if (aggressive > 2) {
        new MutationObserver(ms => {
          for (const m of ms) {
            for (const e of m.addedNodes) {
              blocker.frame(e);
              if (e.childElementCount) {
                [...e.querySelectorAll('frame,iframe')].forEach(blocker.frame);
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
          // do not block if window is opened inside a frame
          const name = args[1];
          if (name && typeof name === 'string' && frames[name]) {
            return Reflect.apply(target, self, args);
          }

          const {id, block} = policy('window.open', {
            href: args.length ? args[0] : ''
          }, null, {
            args
          });
          if (block) { // return a window or a window-liked object
            if (port.dataset.shadow === 'true') {
              const iframe = document.createElement('iframe');
              iframe.style.display = 'none';
              document.body.appendChild(iframe);
              return iframe.contentWindow;
            }
            else {
              return simulate(id, window);
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
            self.addEventListener('click', blocker.onclick, true);
          }
          return r;
        }
      });
    };
    blocker.remove = (w = window, d = document) => {
      if (port.dataset.enabled === 'false' && protected.has(w)) {
        protected.delete(w);
        d.removeEventListener('click', blocker.onclick);
      }
    };

    // always install since we do not know the enabling status right now
    blocker.install();

    // receive configure
    new MutationObserver(() => {
      blocker[port.dataset.enabled === 'false' ? 'remove' : 'install']();
    }).observe(port, {
      attributes: true,
      attributeFilter: ['data-enabled']
    });
  };

  if (port.dataset) { // SVG documents
    uncode(3);
  }
}
