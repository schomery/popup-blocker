/* globals cloneInto */
'use strict';

var requests = {};
var commands = {};
var active = true;

window.cloneInto = typeof cloneInto === 'undefined' ? function(a) {
  return a;
} : cloneInto;

function post(name, value) {
  window.dispatchEvent(new CustomEvent(name, {
    detail: cloneInto(value, document.defaultView),
    bubbles: false,
    cancelable: false
  }));
}

var redirect = {
  id: null,
  active: false,
  callback: e => {
    e.returnValue = 'false';
  }
};

// prevent ad page redirection when popup displaying is unsuccessful for 2 seconds
window.addEventListener('ppp-blocker-redirect', e => {
  if (redirect.active && window.top === window) {
    window.addEventListener('beforeunload', redirect.callback);
    e.preventDefault();
    e.stopPropagation();

    window.clearTimeout(redirect.id);
    redirect.id = window.setTimeout(() => {
      window.removeEventListener('beforeunload', redirect.callback);
    }, 2000);
  }
});
window.addEventListener('ppp-blocker-create', e => {
  const request = e.detail;
  // prevent unprotected script from issuing any other commands
  if (!request || request.cmd !== 'popup-request') {
    return;
  }
  // passing over the minimal needed details
  chrome.runtime.sendMessage({
    cmd: 'popup-request',
    type: request.type,
    url: request.url,
    id: request.id,
    tag: request.tag
  });
  requests[request.id] = request;
  commands[request.id] = commands[request.id] || [];
});
window.addEventListener('ppp-blocker-append', e => {
  const request = e.detail;
  commands[request.id] = commands[request.id] || [];
  commands[request.id].push(request);
});

chrome.runtime.onMessage.addListener(request => {
  const id = request.id;

  // apply popup accept on the context where it is originally requested
  if (request.cmd === 'popup-accepted' && requests[id]) {
    post('ppp-blocker-exe', {
      arguments: requests[id].arguments,
      commands: commands[id]
    });
  }
  // releasing page-redirect
  else if (request.cmd === 'release-beforeunload' && window.top === window) {
    window.clearTimeout(redirect.id);
    window.removeEventListener('beforeunload', redirect.callback);
  }
  else if (request.cmd === 'allow-shadow') {
    post('ppp-blocker-configure-shadow', {value: true});
  }
  // clean up
  if (
    request.cmd === 'popup.accepted' ||
    request.cmd === 'open-tab' ||
    request.cmd === 'popup-redirect' ||
    request.cmd === 'popup-denied'
  ) {
    delete commands[id];
    delete requests[id];
  }
});

var script = document.createElement('script');
script.textContent = `
{
  let activeElement = null;
  let documentElement = document.documentElement;

  const records = [];

  const config = {
    _isEnabled: true,
    get isEnabled () {
      return config._isEnabled;
    },
    set isEnabled (v) {
      if (v !== config._isEnabled) {
        console.log('reset')
        records.forEach(o => {
          o.parent[o.name] = v ? o.value : o.original;
        });
      }
      config._isEnabled = v;
    },
    isDomain: false,
    whitelist: [],
    sendToTop: false,
    shadow: false
  };
  const pointers = {
    'epd': EventTarget.prototype.dispatchEvent,
    'mpp': MouseEvent.prototype.preventDefault,
    'mps': MouseEvent.prototype.stopPropagation,
    'mpi': MouseEvent.prototype.stopImmediatePropagation,
    'dwr': document.write,
    'dce': document.createElement,
    'wop': window.open, // pointers -> window
  };

  // protection
  // test with Firefox on https://www.webcomponents.org/element/WEBDMG/Gathr-Events
  const protect = (parent, name, value) => {
    records.push({parent, name, original: parent[name], value});
    parent[name] = value;
  };
  // invisible
  const invisible = (parent, name, callback) => {
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
  // communication channel
  const post = (name, detail) => pointers.epd.call(config.sendToTop ? window.parent : window, new CustomEvent(name, {
    detail,
    bubbles: false,
    cancelable: false
  }));
  protect(window, 'dispatchEvent', function(e) {
    return e.type.startsWith('ppp-blocker-') ? false : pointers.epd.apply(this, arguments);
  });
  // is this a valid URL
  const permit = (url = '') => {
    // white-list section
    let h;
    try {
      h = (new URL(url)).hostname;
    }
    catch (e) {}
    for (let i = 0; i < config.whitelist.length && h; i++) {
      const hostname = config.whitelist[i];
      if (h.endsWith(hostname) || hostname.endsWith(h)) {
        return true;
      }
    }
    // isDomain section
    if (config.isDomain) {
      let hostname;
      try { // if they are not in the same origin
        hostname = window.top.location.hostname;
      }
      catch (e) {}
      return h && hostname && (h.endsWith(hostname) || hostname.endsWith(h));
    }
    return false;
  };
  /* protection #1; window.open */
  protect(window, 'open', function(url = '') {
    if (!config.isEnabled || permit(url)) {
      return pointers.wop.apply(window, arguments);
    }
    const id = Math.random();
    post('ppp-blocker-redirect');
    window.setTimeout(() => { // in Firefox sometimes returned document.activeElement is document.body
      // handling about:blank cases
      const selected = document.activeElement === document.body && activeElement ? activeElement : document.activeElement;
      // convert relative URL to absolute URL
      if (url && url.indexOf(':') === -1) {
        const a = pointers.dce.call(document, 'a');
        a.href = url;
        url = a.cloneNode(false).href;
      }
      if (!url || url.startsWith('about:')) {
        selected.dataset.popupblocker = selected.dataset.popupblocker || id;
      }
      //
      post('ppp-blocker-create', {
        cmd: 'popup-request',
        type: 'window.open',
        url,
        id,
        arguments: [...arguments],
        tag: selected.dataset.popupblocker
      });
    }, 100);

    let win = {};
    win.document = {};
    win.location = {};
    if (config.shadow) {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      return iframe.contentWindow;
    }
    win.moveTo = win.resizeTo = function() {};
    (function(callback) {
      win.document.open = callback.bind(this, 'open');
      win.document.write = callback.bind(this, 'write');
      win.document.close = callback.bind(this, 'close');
      win.focus = callback.bind(this, 'focus');
      win.close = callback.bind(this, 'close');
      Object.defineProperty(win.location, 'href', {
        set (v) {
          callback('window.location.href', v);
        }
      });
    })(function(name) {
      post('ppp-blocker-append', {
        name,
        arguments: [...arguments].slice(1),
        id
      });
      return this;
    });
    return win;
  });
  /* protection #2; link[target=_blank] or form[target=_blank] */
  const onclick = (e, target, type = 'target._blank') => {
    if (config.shadow) {
      [...document.elementsFromPoint(e.clientX, e.clientY)]
        .filter(e => e.tagName === 'INPUT').forEach(e => e.focus());
    }
    activeElement = target = target || e.target;
    if (config.isEnabled) {
      const a = 'closest' in target ? (target.closest('[target]') || target.closest('a')) : null; // click after document.open
      if (!a) {
        return;
      }
      if (e.defaultPrevented) {
        return;
      }
      const base = [...document.querySelectorAll('base'), a]
        .filter(a => a)
        .reduce((p, c) => p || ['_tab', '_blank'].includes(c.target.toLowerCase()), false);
      const url = a.href || a.action;
      // if element is not attached, a.click() opens a new tab
      if ((base || !e.target) && (
        e.button === 0 && !(e.metaKey && e.isTrusted) || (e.button === 1 && !e.isTrusted)
      ) && !permit(url)) {
        post('ppp-blocker-redirect');
        post('ppp-blocker-create', {
          cmd: 'popup-request',
          type,
          url,
          arguments: [a.href || a.action],
          id: Math.random()
        });
        pointers.mpp.apply(e);
        return true;
      }
    }
  };
  /* protection #3; dynamic "a" creation; click is not propagation */
  protect(document, 'createElement', function(tagName = '') {
    const target = pointers.dce.apply(document, arguments);
    if (tagName.toLowerCase() === 'a') {
      target.addEventListener('click', e => onclick(e, target, 'a.createElement'), false);
      // prevent dispatching click event
      const dispatchEvent = target.dispatchEvent;
      protect(target, 'dispatchEvent', function(e) {
        if (e.type === 'click' && onclick(e, target, 'a.dynamic.dispatchEvent')) {
          return false;
        }
        return dispatchEvent.apply(this, arguments);
      });
    }
    else if (tagName.toLowerCase() === 'form') {
      const submit = target.submit;
      protect(target, 'submit', function() {
        if (onclick(typeof event === 'undefined' ? { // firefox does not support global events
          target,
          button: 0
        } : event, target, 'form.submit')) {
          return false;
        }
        return submit.apply(this, arguments);
      });
    }
    return target;
  });
  /* protection #4; when stopPropagation or stopImmediatePropagation is emitted,
   * our listener will not be called anymore */
  protect(MouseEvent.prototype, 'stopPropagation', function() {
    if (this.type === 'click') {
      onclick(this, null, 'event.stopPropagation');
    }
    return pointers.mps.apply(this, arguments);
  }, true);
  protect(MouseEvent.prototype, 'stopImmediatePropagation', function() {
    if (this.type === 'click') {
      onclick(this, null, 'event.stopImmediatePropagation');
    }
    return pointers.mpi.apply(this, arguments);
  }, true);
  /* protection #5; document.write; when document.open is called, old listeners are wiped out */
  // https://github.com/schomery/popup-blocker/issues/43
  invisible(document, 'write', function() {
    if (document.documentElement !== documentElement) {
      // we need to register event listener one more time on new document creation
      document.addEventListener('click', onclick);
      documentElement = document.documentElement;
      config.sendToTop = true;
    }
  });
  /* protection #6; EventTarget.prototype.dispatchEvent; directly dispatching "click" event over a "a" element */
  protect(EventTarget.prototype, 'dispatchEvent', function(e) {
    if (e.type === 'click' && onclick(e, this, 'event.dispatchEvent')) {
      return false;
    }
    return pointers.epd.apply(this, arguments);
  }, true);
  // install listener
  document.addEventListener('click', onclick);
  // configurations
  window.addEventListener('ppp-blocker-configure-enabled', e => {
    config.isEnabled = e.detail.value;
    document[config.isEnabled ? 'addEventListener' : 'removeEventListener']('click', onclick);
  });
  window.addEventListener('ppp-blocker-configure-target', e => {
    if (!e.detail.value) {
      document.removeEventListener('click', onclick);
    }
  });
  window.addEventListener('ppp-blocker-configure-domain', e => config.isDomain = e.detail.value);
  window.addEventListener('ppp-blocker-configure-whitelist', e => config.whitelist = e.detail.value);
  window.addEventListener('ppp-blocker-configure-shadow', e => config.shadow = e.detail.value);
  // execute
  window.addEventListener('ppp-blocker-exe', e => {
    const request = e.detail;
    const win = pointers.wop.apply(window, request.arguments);
    request.commands.forEach(obj => {
      if (obj.name === 'focus') {
        win.focus();
      }
      else if (obj.name === 'window.location.href') {
        win.location.href = obj.arguments[0];
      }
      else {
        win.document[obj.name].apply(win.document, obj.arguments);
      }
    });
  });
}
`;
document.documentElement.appendChild(script);
document.documentElement.removeChild(script);

chrome.storage.local.get({
  'enabled': true,
  'target': true,
  'domain': false,
  'popup-hosts': ['google.com', 'bing.com', 't.co', 'twitter.com'],
  'block-page-redirection': false
}, prefs => {
  post('ppp-blocker-configure-enabled', {value: prefs.enabled});
  post('ppp-blocker-configure-target', {value: prefs.target});
  post('ppp-blocker-configure-domain', {value: prefs.domain});
  post('ppp-blocker-configure-whitelist', {value: prefs['popup-hosts']});
  redirect.active = prefs['block-page-redirection'];
});

chrome.storage.onChanged.addListener(obj => {
  if (obj.enabled && active) {
    post('ppp-blocker-configure-enabled', {value: obj.enabled.newValue});
  }
  if (obj.target) {
    post('ppp-blocker-configure-target', {value: obj.target.newValue});
  }
  if (obj.domain) {
    post('ppp-blocker-configure-domain', {value: obj.domain.newValue});
  }
  if (obj['popup-hosts']) {
    post('ppp-blocker-configure-whitelist', {value: obj['popup-hosts'].newValue});
  }
  if (obj['block-page-redirection']) {
    redirect.active = obj['block-page-redirection'].newValue;
  }
});
// is top domain white-listed.
chrome.runtime.sendMessage({
  cmd: 'validate'
}, response => {
  if (response && response.valid) {
    active = false;
    post('ppp-blocker-configure-enabled', {value: false});
  }
});
