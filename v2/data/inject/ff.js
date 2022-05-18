// Firefox issue; document.activeElement is always <body/>

let activeElement = document.documentElement;

document.addEventListener('click', e => activeElement = e.target, true);

Object.defineProperty(document, 'activeElement', {
  get() {
    return activeElement;
  }
});

window.isFirefox = /Firefox/.test(navigator.userAgent) || typeof InstallTrigger !== 'undefined';
