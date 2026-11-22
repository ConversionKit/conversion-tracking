/*! ClickFunnels conversion detection - ConversionKit
 *  https://github.com/ConversionKit/conversion-tracking | https://converly.io
 *  Detects: form submission. Pushes dataLayer event: clickfunnels_form_submitted
 *  Keep this notice when sharing or installing this snippet. */
/* ClickFunnels Form Listener by Converly. Pushes only event and form metadata. */
(function() {
  'use strict';

  window.dataLayer = window.dataLayer || [];
  var sink = {
    siteKey: 'gtm-pack-clickfunnels-event-only',
    advertisingAllowed: function () { return true; },
    onSubmission: function (payload) {
      var context = payload.submissionContext || {};
      var push = { event: 'clickfunnels_form_submitted', page_path: payload.pageUrl };
      window.dataLayer.push(push);
    }
  };

  var ATTEMPT = 'cf:form_submitted';
  var SUCCESS = 'cf:form_submitted:ok';
  var WINDOW_MS = 60000;
  var KEYS = ['email', 'first_name', 'last_name', 'name', 'phone_number'];
  var TARGETS = { email: 'email', first_name: 'firstName', last_name: 'lastName', phone_number: 'phone' };
  var active = null;

  var attempts = typeof WeakMap === 'function' ? new WeakMap() : null;

  function consentAllows() {
    try {
      var c = sink;
      return !(c && typeof c.advertisingAllowed === 'function' && c.advertisingAllowed() === false);
    } catch (e) { return true; }
  }

  var SENSITIVE_AUTOCOMPLETE = {
    'current-password': true, 'new-password': true, 'one-time-code': true,
    'cc-number': true, 'cc-csc': true, 'cc-exp': true, 'cc-exp-month': true,
    'cc-exp-year': true, 'cc-name': true, 'cc-given-name': true,
    'cc-family-name': true, 'cc-additional-name': true, 'cc-type': true,
  };

  var SENSITIVE_NAME_SUBSTRINGS = [
    'password', 'passwd', 'passcode', 'cardnum', 'ccnumber', 'creditcard',
    'onetimecode', 'securitycode', 'socialsecurity',
  ];
  var SENSITIVE_NAME_TOKENS = {
    otp: true, cvv: true, cvc: true, ssn: true, pwd: true, pin: true,
  };

  function isSensitiveName(name) {
    if (!name) return false;
    var lower = String(name).toLowerCase();
    var norm = lower.replace(/[^a-z0-9]/g, '');
    for (var i = 0; i < SENSITIVE_NAME_SUBSTRINGS.length; i++) {
      if (norm.indexOf(SENSITIVE_NAME_SUBSTRINGS[i]) !== -1) return true;
    }
    var parts = lower.split(/[^a-z0-9]+/);
    for (var p = 0; p < parts.length; p++) {
      if (SENSITIVE_NAME_TOKENS[parts[p]] === true) return true;
    }
    return false;
  }

  function isSensitiveField(type, autocomplete, name) {
    if (type === 'password') return true;

    if (autocomplete) {
      var tokens = autocomplete.split(/\s+/);
      for (var t = 0; t < tokens.length; t++) {
        if (SENSITIVE_AUTOCOMPLETE[tokens[t]] === true) return true;
      }
    }
    if (isSensitiveName(name)) return true;
    return false;
  }

  function labelTextFor(el) {
    var text = '';
    var wrap = el.closest('label');
    if (wrap) text += ' ' + wrap.textContent;
    var doc = el.ownerDocument;
    var id = el.getAttribute('id');
    var labels = doc.getElementsByTagName('label');
    for (var i = 0; id && i < labels.length; i++) {
      if (labels[i].getAttribute('for') === id) text += ' ' + labels[i].textContent;
    }
    var ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/);
    var nodes = doc.querySelectorAll('[id]');
    for (var k = 0; k < nodes.length; k++) {
      if (ids.indexOf(nodes[k].getAttribute('id')) !== -1) text += ' ' + nodes[k].textContent;
    }
    return text;
  }

  function object(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function dataProperty(objectValue, key) {
    var descriptor = Object.getOwnPropertyDescriptor(objectValue, key);
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor : null;
  }

  function contactFor(detail) {
    if (!object(detail) || 'purchase' in detail) return null;
    var contact = dataProperty(detail, 'contact');
    return contact && object(contact.value) ? contact.value : null;
  }

  function carrierForRuntime() {
    var events = window.CFEvents;
    if (!events || events.FORM_SUBMITTED !== ATTEMPT || events.FORM_SUBMITTED_OK !== SUCCESS) return null;
    var carriers = document.querySelectorAll('form#cfAR[data-cf-form-action]');
    return carriers.length === 1 && document.documentElement.contains(carriers[0]) ? carriers[0] : null;
  }

  function clearAttempt() {
    if (active) window.clearTimeout(active.timer);
    active = null;
  }

  function refreshIndex(index) {
    var fields = document.querySelectorAll('.elFormItem:not([data-prevent-submit="true"])');
    for (var i = 0; i < fields.length; i++) {
      var el = fields[i];
      if (el.closest('form#cfAR, [data-page-element="Checkout/V2"]')) continue;
      var name = el.getAttribute('name') || '';
      if (KEYS.indexOf(name) === -1) continue;
      var type = (el.getAttribute('type') || 'text').toLowerCase();
      var autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
      var sensitive = isSensitiveField(type, autocomplete, name) ||
        isSensitiveName(el.getAttribute('id')) ||
        isSensitiveName(el.getAttribute('aria-label')) ||
        isSensitiveName(el.getAttribute('placeholder')) || isSensitiveName(labelTextFor(el));
      var ineligible = el.tagName === 'SELECT' || !/^(text|email|tel|name|first_name|last_name|phone_number)$/.test(type);
      var entry = index[name] || { sensitive: false, ineligible: false, type: type };
      entry.sensitive = entry.sensitive || sensitive;
      entry.ineligible = entry.ineligible || ineligible;
      index[name] = entry;
    }
  }

  function handleAttempt(event) {
    try {
      if (!consentAllows()) { clearAttempt(); return; }
      if (event.target !== document || !attempts) return;
      var carrier = carrierForRuntime();
      if (!carrier) { clearAttempt(); return; }
      var detail = event.detail;
      if (!contactFor(detail)) { clearAttempt(); return; }
      if (attempts.has(detail)) return; // no deadline extension or replay
      clearAttempt();
      var token = {};
      attempts.set(detail, token);
      active = { token: token, carrier: carrier, path: window.location.pathname,
        started: Date.now(), index: Object.create(null), timer: null };
      refreshIndex(active.index);

      active.timer = window.setTimeout(clearAttempt, WINDOW_MS + 1);
    } catch (e) { clearAttempt(); }
  }

  function snapshot() { return { pageUrl: window.location.pathname, userData: {}, formFieldsSeen: [] }; }

  function handleSuccess(event) {
    try {
      if (!consentAllows()) { clearAttempt(); return; }
      if (event.target !== document || !active) return;
      if (carrierForRuntime() !== active.carrier || window.location.pathname !== active.path ||
          Date.now() - active.started > WINDOW_MS) { clearAttempt(); return; }
      var detail = event.detail;
      if (!object(detail) || attempts.get(detail) !== active.token) return;
      var contact = contactFor(detail);
      if (!contact || !sink || typeof sink.onSubmission !== 'function') {
        clearAttempt(); return;
      }
      refreshIndex(active.index);
      var payload = snapshot(contact, active.index);
      clearAttempt(); // consume before invoking outside code, including reentry
      sink.onSubmission(payload);
    } catch (e) {
      clearAttempt();

    }
  }

  if (typeof window !== 'undefined' && !window.__converlyRecipeClickFunnels && attempts) {
    window.__converlyRecipeClickFunnels = true;
    document.addEventListener(ATTEMPT, handleAttempt);
    document.addEventListener(SUCCESS, handleSuccess);
    window.addEventListener('checkout:order-submit-errors', clearAttempt);
    window.addEventListener('payments:submit-failed', clearAttempt);
    window.addEventListener('pagehide', clearAttempt);
  }
})();
