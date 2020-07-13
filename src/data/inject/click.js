const script = document.createElement('script');

script.textContent = `{
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

  // definitions
  const script = document.currentScript;
  const blocker = {};
  // pointers
  const pointers = {
    'mpp': MouseEvent.prototype.preventDefault,
    'hac': HTMLAnchorElement.prototype.click,
    'had': HTMLAnchorElement.prototype.dispatchEvent,
    'hfs': HTMLFormElement.prototype.submit,
    'hfd': HTMLFormElement.prototype.dispatchEvent,
    'wop': window.open
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
    HTMLFormElement.prototype.dispatchEvent = blocker.overwrite.form.dispatchEvent;
  };
  blocker.remove = () => {
    document.removeEventListener('click', blocker.overwrite.click);
    window.open = pointers.wop;
    HTMLAnchorElement.prototype.click = pointers.hac;
    HTMLAnchorElement.prototype.dispatchEvent = pointers.had;
    HTMLFormElement.prototype.submit = pointers.hfs;
    HTMLFormElement.prototype.dispatchEvent = pointers.hfd;
  };
  // overwrites
  blocker.overwrite = {
    /* click */
    click(e) {
      const a = e.target.closest('[target]') || e.target.closest('a');
      // if this is not a form or anchor element, ignore the click
      if (a && policy('element.click', a, e).block) {
        pointers.mpp.apply(e);
        return true;
      }
    },
    /* open */
    open(...args) {
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
    },
    /* a */
    a: {
      click(...args) {
        const {block} = policy('dynamic.a.click', this);
        if (!block) {
          pointers.hac.apply(this, args);
        }
      },
      dispatchEvent(...args) {
        const e = args[0];
        const {block} = policy('dynamic.a.dispatch', this, e);
        return block ? false : pointers.had.apply(this, args);
      }
    },
    /* form */
    form: {
      submit(...args) {
        const {block} = policy('dynamic.form.submit', this);
        return block ? false : pointers.hfs.apply(this, args);
      },
      dispatchEvent(...args) {
        const {block} = policy('dynamic.form.dispatch', this);
        return block ? false : pointers.hfd.apply(this, args);
      }
    }
  };
  // always install the blocker
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
