/*! Instapage conversion detection - ConversionKit
 *  https://github.com/ConversionKit/conversion-tracking | https://converly.io
 *  Detects: form submission. Pushes dataLayer event: instapage_form_submitted
 *  Keep this notice when sharing or installing this snippet. */
/* Instapage Form Listener by Converly. Pushes only event and form metadata. */
(function() {
  'use strict';

  window.dataLayer = window.dataLayer || [];
  var sink = {
    siteKey: 'gtm-pack-instapage-event-only',
    advertisingAllowed: function () { return true; },
    onSubmission: function (payload) {
      var context = payload.submissionContext || {};
      var push = { event: 'instapage_form_submitted', form_id: context.form_id || null };
      window.dataLayer.push(push);
    }
  };

  if (window.__converlyRecipeInstapage) return;
  var controller = { state: 'waiting' };
  window.__converlyRecipeInstapage = controller;
  var supportsWindowEvent = 'event' in window;
  var ENDPOINT = 'https://d.fastcdn.co/submissions';
  var requests = new WeakMap(), dispatches = new WeakMap();
  var pending = [], flag = null, flagTimer = null, observer = null;
  var previousOpen, previousSend, wrappedOpen, wrappedSend, prototype;
  var installationFailed = false;
  var installed = false, suspended = false, stopped = false, warned = false, captchaWarned = false;

  function warn() {
    if (warned) return;
    warned = true;
    try { ; } catch (e) {  }
  }

  function allowed() {
    return sink && typeof sink.onSubmission === 'function';
  }
  function exactUrl(value) {
    if (typeof value !== 'string' || !value) return false;
    try { return new URL(value, document.baseURI).href === ENDPOINT; } catch (e) { return false; }
  }
  function identity(form) {
    if (window.top !== window || window.location.protocol !== 'https:' || !form ||
        form.tagName !== 'FORM' || form.ownerDocument !== document ||
        !document.documentElement.contains(form) || form.getAttribute('data-at') !== 'form' ||
        !exactUrl(form.getAttribute('action-xhr'))) return null;
    var id = form.getAttribute('data-id') || '';
    if (id.length > 128 || !/^element-(?:[0-9]+|[0-9a-hjkmnp-tv-z]{26})$/i.test(id)) return null;
    var forms = document.querySelectorAll('form[data-id]');
    for (var f = 0; f < forms.length; f++) {
      if (forms[f] !== form && (forms[f].getAttribute('data-id') || '').toLowerCase() === id.toLowerCase()) return null;
    }

    var controls = document.querySelectorAll('input[name="lpsSubmissionConfig"]'), token = null;
    for (var i = 0; i < controls.length; i++) {
      if (controls[i].form !== form) continue;
      if (token || controls[i].type !== 'hidden' || controls[i].disabled || controls[i].matches(':disabled')) return null;
      token = controls[i];
    }
    return token ? { id: id, token: token, action: form.getAttribute('action-xhr') } : null;
  }
  function captchaOff() {
    var script = document.querySelector('script#ip-config'), config = null;
    try { if (script) config = JSON.parse(script.textContent); } catch (e) {  }
    if (config && config.reCaptchaEnabled === false) return true;
    var marked = !!script, forms = document.querySelectorAll('form[action-xhr]');
    for (var i = 0; !marked && i < forms.length; i++) marked = exactUrl(forms[i].getAttribute('action-xhr'));
    if (!captchaWarned && marked) {
      captchaWarned = true;

      var message = config && config.reCaptchaEnabled === true ?
        'Instapage reCAPTCHA pages are not supported yet' : 'Instapage page settings not found';
      try { ; } catch (e) {  }
    }
    return false;
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
    var tokens = autocomplete.split(/\s+/);
    for (var t = 0; t < tokens.length; t++) {
      if (SENSITIVE_AUTOCOMPLETE[tokens[t]] === true || tokens[t].indexOf('cc-') === 0) return true;
    }
    return isSensitiveName(name);
  }

  function labelTextFor(el, form) {
    var document = el.ownerDocument;
    var text = '';
    var wrap = el.closest ? el.closest('label') : null;
    if (wrap) text += ' ' + wrap.textContent;
    var labels = document.getElementsByTagName('label');
    for (var i = 0; i < labels.length; i++) {
      var owner = labels[i].closest ? labels[i].closest('form') : null;
      if (el.id && labels[i].getAttribute('for') === el.id && (!owner || owner === form)) {
        text += ' ' + labels[i].textContent;
      }
    }
    var ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/);
    for (var j = 0; j < ids.length; j++) {
      if (!ids[j]) continue;
      var nodes = form.querySelectorAll('[id]');
      var found = false;
      for (var k = 0; k < nodes.length; k++) {
        if (nodes[k].id === ids[j]) { text += ' ' + nodes[k].textContent; found = true; }
      }
      if (!found) {
        var node = document.getElementById(ids[j]);
        var nodeForm = node && node.closest ? node.closest('form') : null;
        if (node && (!nodeForm || nodeForm === form)) text += ' ' + node.textContent;
      }
    }
    return text;
  }

  function safeControl(el, form) {
    var type = (el.type || 'text').toLowerCase();
    return !isSensitiveField(type, (el.getAttribute('autocomplete') || '').toLowerCase(), el.name) &&
      !isSensitiveName(el.id) && !isSensitiveName(el.getAttribute('aria-label')) &&
      !isSensitiveName(el.getAttribute('placeholder')) && !isSensitiveName(labelTextFor(el, form));
  }

  function visible(el) {
    for (var node = el; node && node.nodeType === 1; node = node.parentElement) {
      var style = el.ownerDocument.defaultView.getComputedStyle(node);
      if (node.hidden || style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  }

  function bounded(value) {
    if (typeof value !== 'string') return '';
    value = value.trim();
    return value.length <= 200 ? value : '';
  }

  function emailValue(value) {
    value = bounded(value);
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : '';
  }

  function phoneValue(value) {
    value = bounded(value);
    return /^[+\d\s().-]{6,30}$/.test(value) ? value : '';
  }

  function contactKey(text) {
    var norm = text.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (/^(email|emailaddress|workemail)$/.test(norm)) return 'email';
    if (/^(phone|phonenumber|telephone|mobile|mobilenumber)$/.test(norm)) return 'phone';
    if (/^(firstname|givenname|first)$/.test(norm)) return 'firstName';
    if (/^(lastname|familyname|surname)$/.test(norm)) return 'lastName';
    if (/^(fullname|yourname|name)$/.test(norm)) return 'fullName';
    return '';
  }

  function fieldMeta(el, form) {
    var type = (el.getAttribute('type') || el.type || 'text').toLowerCase();
    var name = el.getAttribute('name') || '';
    if (!/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) || el.form !== form || el.disabled || el.matches(':disabled') ||
        /^(hidden|password|file|submit|button|reset|image)$/.test(type) ||
        !visible(el) || !safeControl(el, form)) return null;
    var norm = name.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (/^(pageid|pagevariant|honeypot|bottrap|captcha|recaptcha|g-recaptcha-response)$/.test(norm)) return null;

    var key = '', priority = 0;
    if (el.tagName === 'INPUT' && /^(text|email|tel)$/.test(type)) {
      if (type === 'email') { key = 'email'; priority = 5; }
      else if (type === 'tel') { key = 'phone'; priority = 5; }
      else {
        var tokens = (el.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/);
        var autocompleteKeys = { email: 'email', tel: 'phone', 'given-name': 'firstName',
          'family-name': 'lastName', name: 'fullName' };
        for (var t = 0; t < tokens.length; t++) {
          if (Object.prototype.hasOwnProperty.call(autocompleteKeys, tokens[t])) {
            if (key && key !== autocompleteKeys[tokens[t]]) return null;
            key = autocompleteKeys[tokens[t]]; priority = 4;
          }
        }
        var subtype = el.getAttribute('data-subtype');
        if (!key && (subtype === 'firstName' || subtype === 'lastName')) { key = subtype; priority = 3; }
        if (!key) { key = contactKey(labelTextFor(el, form)); priority = 2; }
        if (!key) { key = contactKey(name); priority = 1; }
      }
    }
    return { name: name, type: type, key: key, priority: priority };
  }

  function snapshot() { return []; }

  function release(record) {
    var seen = [], choices = {}, data = {};
    for (var i = 0; i < record.fields.length; i++) {
      var saved = record.fields[i], el = saved.el;
      var meta = el.ownerDocument === document && record.form.contains(el) ? fieldMeta(el, record.form) : null;
      var safe = !!(meta && meta.name === saved.name && meta.type === saved.type && meta.key === saved.key);
      if (safe && saved.name) seen.push({ name: saved.name, type: saved.type });
      if (!saved.key || !saved.value) continue;

      var choice = choices[saved.key];
      if (!choice || saved.priority > choice.priority) {
        choices[saved.key] = { value: saved.value, priority: saved.priority, conflict: false, safe: safe };
      } else if (saved.priority === choice.priority) {
        if (saved.value !== choice.value) choice.conflict = true;
        if (!safe) choice.safe = false;
      }
    }
    var keys = ['email', 'phone', 'firstName', 'lastName'];
    for (var k = 0; k < keys.length; k++) {
      var item = choices[keys[k]];
      if (item && item.safe && !item.conflict) data[keys[k]] = item.value;
    }
    var full = choices.fullName;
    if (!choices.firstName && !choices.lastName && full && full.safe && !full.conflict) {
      var parts = full.value.split(/\s+/);
      data.firstName = parts.shift();
      if (parts.length) data.lastName = parts.join(' ');
    }
    return { userData: data, formFieldsSeen: seen };
  }

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
    record.fields = null; record.form = null; record.xhr = null; record.listeners = null;
  }
  function clear() {
    while (pending.length) discard(pending[0]);
    flag = null; clearTimeout(flagTimer); flagTimer = null;
  }
  function current(record) {
    var key = identity(record.form);
    return key && key.id === record.key.id && key.token === record.key.token && key.action === record.key.action;
  }
  function arm(event) {
    if (!event || event.type !== 'submit' || event.isTrusted !== true) return null;
    if (dispatches.has(event)) return dispatches.get(event);

    dispatches.set(event, null);
    if (!installed || suspended || stopped || !allowed() || !captchaOff()) { clear(); return null; }
    var form = event.target, key = identity(form);

    if (!key || recordFor(form) || form.hasAttribute('data-converly-recipe-processing')) return null;
    var record = { form: form, key: key, fields: snapshot(form), pageUrl: window.location.pathname,
      bound: false, dead: false, listeners: [] };
    pending.push(record); dispatches.set(event, record);

    record.timer = setTimeout(function() { if (!record.bound) discard(record); }, 0);
    return record;
  }
  function handleSubmit(event) {
    if (!event || event.type !== 'submit' || event.isTrusted !== true || stopped || suspended) return;
    try {
      if (!installed) checkInstall();
      var record = arm(event);
      flag = record && !record.dead ? record : null;
      clearTimeout(flagTimer);
      flagTimer = setTimeout(function() { flag = null; flagTimer = null; }, 0);
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
    var descriptor = Object.getOwnPropertyDescriptor(value, 'success');
    return !!(descriptor && descriptor.value === true);
  }
  function complete(xhr, generation, record) {
    if (record.dead || requests.get(xhr) !== generation) return;
    try {
      if (!allowed() || suspended || stopped || Date.now() >= record.expires || !captchaOff() ||
          (!record.bound && !current(record))) { discard(record); return; }
      if (xhr.readyState !== 4) return;
      if (!(xhr.status >= 200 && xhr.status < 300) ||
          !(xhr.responseURL === '' ? generation.url === ENDPOINT : exactUrl(xhr.responseURL)) || !success(xhr)) {
        discard(record); return;
      }
      var form = record.form, payload = release(record);
      payload.trigger = 'instapage';
      payload.pageUrl = record.pageUrl;
      payload.submissionContext = { form_id: record.key.id };
      discard(record);
      if (!allowed()) return;
      form.setAttribute('data-converly-recipe-processing', 'true');
      try { sink.onSubmission(payload); }
      finally { form.removeAttribute('data-converly-recipe-processing'); }
    } catch (e) { discard(record); warn(); }
  }
  function prepare(xhr) {
    var generation = requests.get(xhr);
    if (!generation || !generation.eligible || generation.sent || suspended || stopped) return;
    generation.sent = true;
    if (!allowed() || !captchaOff()) { clear(); return; }

    var record = supportsWindowEvent ? arm(window.event) : flag;
    if (!record || record.dead || record.bound || !current(record)) return;
    record.bound = true; record.xhr = xhr; record.expires = Date.now() + 180000;
    record.binding = supportsWindowEvent ? 'event' : 'flag';
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
            exactUrl(arguments[1]) && (arguments.length < 3 || arguments[2] === undefined || !!arguments[2]),
            url: ENDPOINT, sent: false };
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
        attributeFilter: ['data-id', 'data-at', 'action-xhr', 'name', 'type', 'disabled', 'form'] });
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
      if (window.top !== window || window.location.protocol !== 'https:' || !captchaOff()) return;
      var forms = document.querySelectorAll('form[data-at="form"]');
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
