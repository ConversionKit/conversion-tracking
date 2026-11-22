/*! Freshsales Forms conversion detection - ConversionKit
 *  https://github.com/ConversionKit/conversion-tracking | https://converly.io
 *  Detects: form submission. Pushes dataLayer event: freshsales_form_submitted
 *  Keep this notice when sharing or installing this snippet. */
/* Freshsales Form Listener by Converly. Sends only the event and public form key. */
(function() {
  'use strict';

  if (window.__converlyRecipeFreshsales) return;
  var controller = { state: 'waiting' };
  window.__converlyRecipeFreshsales = controller;
  var supportsWindowEvent = 'event' in window;
  var PATH = '/crm/sales/smart_form/create_entity';
  var QUERY = '?file_attachments_present=false';
  var requests = new WeakMap(), dispatches = new WeakMap();
  var pending = [], observer = null;
  var previousOpen, previousSend, wrappedOpen, wrappedSend, prototype;
  var installationFailed = false;
  var installed = false, suspended = false, stopped = false, warned = false;

  function warn() {}
  function allowed() { return true; }
  function accountUrl(value) {
    if (typeof value !== 'string' || !/^https:\/\//.test(value) ||
        /[\\\s#]/.test(value)) return null;
    try {
      var url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.port ||
          !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.myfreshworks\.com$/.test(url.hostname)) return null;

      if (value !== url.origin + url.pathname + url.search) return null;
      return url;
    } catch (e) { return null; }
  }
  function requestUrl(value) {
    var url = accountUrl(value);
    return url && url.pathname === PATH && url.search === QUERY ? url.href : null;
  }
  function identity(form) {
    if (window.top !== window || window.location.protocol !== 'https:' || !form ||
        form.tagName !== 'FORM' || form.ownerDocument !== document ||
        !document.documentElement.contains(form) ||
        (form.getAttribute('method') || '').toUpperCase() !== 'POST') return null;
    var action = accountUrl(form.getAttribute('action'));
    if (!action || action.pathname !== PATH || action.search) return null;
    var wrapper = form.closest('.fs-webform-container');
    if (!wrapper || wrapper.querySelectorAll('form').length !== 1) return null;
    var match = /^fs-webform-container_([a-f0-9]{64})_([0-9]{1,4})$/.exec(wrapper.id);
    if (!match || !wrapper.classList.contains('fs_' + match[1])) return null;

    var script = null, scripts = document.querySelectorAll('script[src]');
    var instance = match[1] + '_' + match[2];
    for (var i = 0; i < scripts.length; i++) {
      if (scripts[i].id !== instance) continue;
      if (script) return null;
      script = scripts[i];
    }
    if (!script || !wrapper.parentElement || script.parentElement !== wrapper.parentElement.parentElement) return null;
    var source = accountUrl(script.getAttribute('src'));
    if (!source || source.origin !== action.origin || source.search ||
        source.pathname !== '/crm/sales/web_forms/' + match[1] + '/form.js') return null;
    var wrappers = document.querySelectorAll('.fs-webform-container');
    for (var w = 0; w < wrappers.length; w++) {
      if (wrappers[w] !== wrapper && wrappers[w].id === wrapper.id) return null;
    }

    if (form.querySelector('input[type="file"], [name*="captcha"], .g-recaptcha, .h-captcha')) return null;
    return { id: match[1], instance: instance, wrapper: wrapper, script: script, endpoint: action.origin + PATH + QUERY };
  }

  function snapshot() { return []; }
  function release() { return {}; }

  function recordFor(form) {
    for (var i = 0; i < pending.length; i++) if (pending[i].form === form) return pending[i];
    return null;
  }
  function discard(record) {
    if (!record || record.dead) return;
    record.dead = true;
    var i = pending.indexOf(record);
    if (i !== -1) pending.splice(i, 1);
    clearTimeout(record.timer);
    if (record.xhr && record.listeners) {
      for (var l = 0; l < record.listeners.length; l++) {
        try { record.xhr.removeEventListener(record.listeners[l][0], record.listeners[l][1]); } catch (e) {  }
      }
    }
    record.fields = null; record.form = null; record.key = null; record.xhr = null; record.listeners = null;
  }
  function clear() {
    while (pending.length) discard(pending[0]);
  }
  function current(record) {
    var key = identity(record.form);
    return key && key.id === record.key.id && key.instance === record.key.instance &&
      key.wrapper === record.key.wrapper && key.script === record.key.script && key.endpoint === record.key.endpoint;
  }
  function arm(event) {
    if (!event || event.type !== 'submit' || event.isTrusted !== true) return null;
    if (dispatches.has(event)) return dispatches.get(event);

    dispatches.set(event, null);
    if (!installed || suspended || stopped || !allowed()) { clear(); return null; }
    var form = event.target, key = identity(form);

    if (!key || recordFor(form) || form.hasAttribute('data-converly-recipe-processing')) return null;
    var record = { form: form, key: key, fields: snapshot(form), pageUrl: window.location.pathname,
      bound: false, dead: false, listeners: [] };
    if (!record.fields || !allowed()) { clear(); return null; }
    pending.push(record); dispatches.set(event, record);

    record.timer = setTimeout(function() { if (!record.bound) discard(record); }, 0);
    return record;
  }
  function handleSubmit(event) {
    if (!event || event.type !== 'submit' || event.isTrusted !== true || stopped || suspended) return;
    try {
      if (!installed) checkInstall();
      arm(event);
    } catch (e) { clear(); warn(); }
  }
  function success(xhr) {
    var type = xhr.responseType, value;
    if (type === '' || type === 'text') {
      var text = xhr.responseText;
      if (typeof text !== 'string' || !text || text.length > 65536) return false;
      value = JSON.parse(text);
    } else if (type === 'json') value = xhr.response;
    else return false;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return false;
    var descriptor = Object.getOwnPropertyDescriptor(value, 'status');
    return !!(descriptor && descriptor.value === 'ok');
  }
  function complete(xhr, generation, record) {
    if (record.dead || requests.get(xhr) !== generation) return;
    try {
      if (!allowed() || suspended || stopped || Date.now() >= record.expires ||
          (!record.bound && !current(record))) { discard(record); return; }
      if (xhr.readyState !== 4) return;
      if (xhr.status !== 200 ||
          requestUrl(xhr.responseURL) !== record.key.endpoint || !success(xhr)) {
        discard(record); return;
      }
      var form = record.form, payload = release(record);
      payload.trigger = 'freshsales';
      payload.pageUrl = record.pageUrl;
      payload.submissionContext = { form_id: record.key.id };
      discard(record);
      if (!allowed()) return;
      form.setAttribute('data-converly-recipe-processing', 'true');
      try {
        var push = { event: 'freshsales_form_submitted', form_id: payload.submissionContext.form_id };
        (window.dataLayer = window.dataLayer || []).push(push);
      }
      finally { form.removeAttribute('data-converly-recipe-processing'); }
    } catch (e) { discard(record); warn(); }
  }
  function prepare(xhr) {
    var generation = requests.get(xhr);
    if (!generation || !generation.eligible || generation.sent || suspended || stopped) return;
    generation.sent = true;
    if (!allowed()) { clear(); return; }

    var record = supportsWindowEvent ? arm(window.event) : null;
    if (!record || record.dead || record.bound) return;
    if (!current(record) || generation.url !== record.key.endpoint) { discard(record); return; }
    record.bound = true; record.xhr = xhr; record.expires = Date.now() + 180000;
    record.binding = 'event';
    generation.record = record;
    clearTimeout(record.timer);
    record.timer = setTimeout(function() { discard(record); }, 180000);
    var finished = function() { complete(xhr, generation, record); };
    var failed = function() { discard(record); };
    record.listeners = [['readystatechange', finished], ['load', finished],
      ['abort', failed], ['error', failed], ['timeout', failed], ['loadend', failed]];
    for (var i = 0; i < record.listeners.length; i++) xhr.addEventListener(record.listeners[i][0], record.listeners[i][1]);
  }
  function restore() {
    try { if (prototype.open === wrappedOpen) prototype.open = previousOpen; } catch (e) {  }
    try { if (prototype.send === wrappedSend) prototype.send = previousSend; } catch (e) {  }
  }
  function install() {
    prototype = window.XMLHttpRequest.prototype;
    previousOpen = prototype.open; previousSend = prototype.send;
    wrappedOpen = function() {
      var generation = null;
      try {
        var old = requests.get(this);
        if (old) discard(old.record);
        requests.delete(this);
        if (installed && !suspended && !stopped) {
          generation = { eligible: typeof arguments[0] === 'string' && arguments[0].toUpperCase() === 'POST' &&
            !!requestUrl(arguments[1]) && (arguments.length < 3 || arguments[2] === undefined || !!arguments[2]),
            url: requestUrl(arguments[1]), sent: false };
          if (generation.eligible) requests.set(this, generation);
        }
      } catch (e) { warn(); }
      try { return previousOpen.apply(this, arguments); }
      catch (error) { try { requests.delete(this); if (generation) discard(generation.record); } catch (e) {  } throw error; }
    };
    wrappedSend = function() {
      try { if (installed && !suspended && !stopped) prepare(this); }
      catch (e) { var broken = requests.get(this); if (broken) discard(broken.record); warn(); }

      try { return previousSend.apply(this, arguments); }
      catch (error) { try { var failed = requests.get(this); if (failed) discard(failed.record); } catch (e) {  } throw error; }
    };
    try {
      if (typeof previousOpen !== 'function' || typeof previousSend !== 'function') throw new Error();
      prototype.open = wrappedOpen;
      prototype.send = wrappedSend;
      if (prototype.open !== wrappedOpen || prototype.send !== wrappedSend) throw new Error();
      observer = new MutationObserver(function() {
        for (var i = pending.length - 1; i >= 0; i--) {
          var record = pending[i];

          if (record.bound) continue;
          try { if (!current(record)) discard(record); }
          catch (e) { discard(record); }
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true,
        attributeFilter: ['id', 'class', 'src', 'action', 'method', 'name', 'type', 'disabled', 'form'] });
      installed = true; controller.state = 'installed';
    } catch (e) {
      installed = false; installationFailed = true; controller.state = 'failed';
      if (observer) observer.disconnect();
      restore(); clear(); warn();
    }
  }
  function checkInstall() {
    if (installed || stopped || suspended || installationFailed) return;
    try {
      if (!supportsWindowEvent || window.top !== window || window.location.protocol !== 'https:') return;
      var forms = document.querySelectorAll('.fs-webform-container form');
      for (var i = 0; i < forms.length; i++) if (identity(forms[i])) { install(); return; }
    } catch (e) { warn(); }
  }
  function hide() { suspended = true; controller.state = 'suspended'; clear(); }
  function show() {
    if (stopped) return;
    suspended = false;
    controller.state = installed ? 'installed' : installationFailed ? 'failed' : 'waiting';
    checkInstall();
  }
  function teardown() {
    stopped = true; clear();
    if (observer) observer.disconnect();
    window.removeEventListener('submit', handleSubmit, true);
    document.removeEventListener('DOMContentLoaded', checkInstall);
    window.removeEventListener('load', checkInstall);
    window.removeEventListener('pagehide', hide);
    window.removeEventListener('pageshow', show);
    if (prototype) restore();
    controller.state = 'stopped';
  }

  window.addEventListener('submit', handleSubmit, true);
  document.addEventListener('DOMContentLoaded', checkInstall);
  window.addEventListener('load', checkInstall);
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', show);
  checkInstall();
})();
