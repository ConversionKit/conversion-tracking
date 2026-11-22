/*! Pipedrive Web Forms conversion detection - ConversionKit
 *  https://github.com/ConversionKit/conversion-tracking | https://converly.io
 *  Detects: form submission. Pushes dataLayer event: pipedrive_form_submitted
 *  Keep this notice when sharing or installing this snippet. */
(function () {
  'use strict';

  if (typeof window === 'undefined' || window.__converlyRecipePipedriveForms) return;
  if (window.top !== window || window.location.protocol !== 'https:') return;
  window.__converlyRecipePipedriveForms = true;

  var ORIGIN = 'https://webforms.pipedrive.com';
  var records = [];
  var observer;

  function own(value, key) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    var descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : undefined;
  }

  function identifier(value, limit) {
    return typeof value === 'string' && value.length > 0 && value.length <= limit &&
      !/[\s\x00-\x1f\x7f/?#%\\]/.test(value);
  }

  function formUrl(src) {
    if (typeof src !== 'string' || src.length > 2048 || !/^https:\/\//.test(src)) return null;
    try {
      var url = new URL(src);
      if (url.origin !== ORIGIN || url.username || url.password || url.hash) return null;
      var match = /^\/f\/([^/]+)$/.exec(url.pathname);
      if (!match || !identifier(match[1], 256)) return null;
      return { url: url, hash: match[1] };
    } catch (e) { return null; }
  }

  function frameIdentity(frame) {
    if (!frame || frame.tagName !== 'IFRAME' || !document.documentElement.contains(frame)) return null;
    var container = frame.parentElement;
    while (container && !container.hasAttribute('data-pd-webforms')) container = container.parentElement;
    if (!container || !container.classList.contains('pipedriveWebForms')) return null;
    var src = frame.getAttribute('src');
    var frameUrl = formUrl(src);
    var owner = formUrl(container.getAttribute('data-pd-webforms'));
    if (!frameUrl || !owner || frameUrl.hash !== owner.hash) return null;
    if (frameUrl.url.searchParams.getAll('embeded').length !== 1 || frameUrl.url.searchParams.get('embeded') !== '1' ||
        frameUrl.url.searchParams.getAll('uuid').length !== 1) return null;
    var uuid = frameUrl.url.searchParams.get('uuid');
    if (!identifier(uuid, 128)) return null;
    return { frame: frame, container: container, src: src, hash: frameUrl.hash, uuid: uuid };
  }

  function track(frame) {
    for (var i = 0; i < records.length; i++) if (records[i].frame === frame) return;
    var record = frameIdentity(frame);
    if (record) { record.consumed = false; records.push(record); }
  }

  function scan() {
    var frames = document.querySelectorAll('iframe');
    for (var i = 0; i < frames.length; i++) track(frames[i]);
  }

  function current(record) {
    var identity = frameIdentity(record.frame);
    return identity && identity.container === record.container && identity.src === record.src &&
      identity.hash === record.hash && identity.uuid === record.uuid;
  }

  function boundSource(source) {
    scan();
    for (var i = 0; i < records.length; i++) {
      var record = records[i];
      try {
        if (record.frame.contentWindow === source && current(record)) return record;
      } catch (e) { /* inaccessible or removed frame */ }
    }
    return null;
  }

  function isTrustedOrigin(event) {
    return !!(event && event.source && event.source !== window && event.origin === ORIGIN);
  }

  function validRedirect(value) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 2048 ||
        !/^https:\/\//.test(value) || /[\s\x00-\x1f\x7f\\]/.test(value)) return false;
    try {
      var url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && url.origin === window.location.origin;
    } catch (e) { return false; }
  }

  function handleMessage(event) {
    if (!isTrustedOrigin(event)) return;
    var message = event.data;
    if (own(message, 'type') !== 6) return;
    var record;
    var payload = own(message, 'payload');
    var uuid = own(payload, 'uuid');
    if (own(payload, 'source') !== 'pipedriveWebForms' || !identifier(uuid, 128) ||
        !validRedirect(own(payload, 'url'))) return;
    record = boundSource(event.source);
    if (!record || record.consumed || uuid !== record.uuid) return;
    record.consumed = true;
    if (!current(record)) return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: 'pipedrive_form_submitted',
      form_id: record.hash
    });
  }

  scan();
  if (typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(scan);
    observer.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['src', 'data-pd-webforms', 'class']
    });
  }
  window.addEventListener('message', handleMessage, false);

})();
