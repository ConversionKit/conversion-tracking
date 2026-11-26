/*! Copper Web Forms conversion detection - ConversionKit
 *  https://github.com/ConversionKit/conversion-tracking | https://converly.io
 *  Detects: form submission. Pushes dataLayer event: copper_form_submitted
 *  Keep this notice when sharing or installing this snippet. */
/* Copper Form Listener by Converly. Sends only the event and public form ID. */
(function() {
  'use strict';

  if (window.__converlyRecipeCopperForms) return;
  var controller = { state: 'waiting' };
  window.__converlyRecipeCopperForms = controller;
  var portals = new WeakMap(), carriers = new WeakMap(), dispatches = new WeakMap(), pending = [];
  var previousFetch, wrappedFetch, installed = false, stopped = false, suspended = false;

  function allowed() { return true; }
  function endpoint(raw) {
    if (typeof raw !== 'string' || !/^https:\/\/forms\.copper\.com\/f\/[A-Za-z0-9]{1,128}$/.test(raw)) return null;
    try {
      var url = new URL(raw);
      return url.origin === 'https://forms.copper.com' && !url.username && !url.password &&
        !url.search && !url.hash ? { url: raw, id: url.pathname.slice(3) } : null;
    } catch (e) { return null; }
  }
  function identity(form) {
    if (window.top !== window || window.location.protocol !== 'https:' || !form ||
        form.tagName !== 'FORM' || form.ownerDocument !== document ||
        !document.documentElement.contains(form) || (form.getAttribute('method') || '').toLowerCase() !== 'post') return null;
    var key = endpoint(form.getAttribute('action'));
    var portal = form.closest('.fptl'), widget = form.closest('.cpfc'), root = form.closest('[id="cpfh"]');
    if (!key || !portal || !widget || !root || !root.contains(widget) || !widget.contains(portal) ||
        portal.querySelectorAll('form').length !== 1 || portal.querySelector('form') !== form ||
        !form.closest('.fwgt.show') || !visible(form)) return null;
    key.portal = portal; key.widget = widget; key.root = root;
    return key;
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

    var labels = Array.prototype.slice.call(form.getElementsByTagName('label'));
    var liveLabels = document.getElementsByTagName('label');
    for (var l = 0; l < liveLabels.length; l++) {
      if (labels.indexOf(liveLabels[l]) === -1) labels.push(liveLabels[l]);
    }
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

  function fieldMeta(el, form) {
    var type = (el.type || 'text').toLowerCase(), name = el.name || '';
    if (el.form !== form || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.disabled || el.matches(':disabled') ||
        /^(hidden|password|file|submit|button|reset|image)$/.test(type) ||
        /captcha|honeypot|bottrap/i.test(name) || !safeControl(el, form)) return null;
    var key = '';
    if (el.tagName === 'INPUT' && /^(text|email|tel)$/.test(type)) {
      if (name === 'email') key = 'email';
      if (name === 'name') key = 'fullName';
      if (name === 'mobilePhone') key = 'phone';
    }
    return { name: name, type: type, key: key };
  }
  function snapshot(form) {
    var fields = [], controls = form.querySelectorAll('input,select,textarea');
    for (var i = 0; i < controls.length; i++) {
      if (!allowed()) return null;
      var el = controls[i], meta = fieldMeta(el, form);
      if (!meta || !visible(el)) continue;
      var value = '';
      if (meta.key) {
        if (!allowed()) return null;
        value = meta.key === 'email' ? emailValue(el.value) :
          meta.key === 'phone' ? phoneValue(el.value) : bounded(el.value);
      }
      fields.push({ el: el, name: meta.name, type: meta.type, key: meta.key, value: value });
    }
    return fields;
  }
  function release(record) {
    var seen = [], data = {}, choices = {};
    for (var i = 0; i < record.fields.length; i++) {
      var saved = record.fields[i], meta = fieldMeta(saved.el, record.form);
      var safe = meta && record.form.contains(saved.el) && meta.name === saved.name &&
        meta.type === saved.type && meta.key === saved.key;
      if (safe && saved.name) seen.push({ name: saved.name, type: saved.type });
      if (!saved.key) continue;

      if (Object.prototype.hasOwnProperty.call(choices, saved.key)) choices[saved.key] = null;
      else choices[saved.key] = safe ? saved.value : null;
    }
    if (choices.email) data.email = choices.email;
    if (choices.phone) data.phone = choices.phone;
    if (choices.fullName) {
      var parts = choices.fullName.split(/\s+/);
      data.firstName = parts.shift();
      if (parts.length) data.lastName = parts.join(' ');
    }
    return { trigger: 'copper', pageUrl: record.path, userData: data,
      formFieldsSeen: seen, submissionContext: { form_id: record.key.id } };
  }
  function sameSnapshot(first, next) {
    if (!next || first.length !== next.length) return false;
    for (var i = 0; i < first.length; i++) {
      if (first[i].name !== next[i].name || first[i].type !== next[i].type ||
          first[i].key !== next[i].key || first[i].value !== next[i].value) return false;
    }
    return true;
  }
  function addAttempt(record, event) {
    var attempt = { record: record, event: event, bound: false, confirmed: false, reader: null };
    record.attempts.push(attempt); dispatches.set(event, attempt);
    return attempt;
  }
  function finish(record, poison) {
    if (!record || record.dead) return;
    record.dead = true;
    if (poison) {
      portals.set(record.key.portal, true); carriers.set(record.key.root, true);
    } else {
      if (portals.get(record.key.portal) === record) portals.delete(record.key.portal);
      if (carriers.get(record.key.root) === record) carriers.delete(record.key.root);
    }
    clearTimeout(record.timer); clearInterval(record.poll);
    if (record.observer) record.observer.disconnect();
    for (var a = 0; a < record.attempts.length; a++) {
      var attempt = record.attempts[a];
      if (attempt.reader) {
        try { attempt.reader.cancel().catch(function() {}); } catch (e) {  }
      }
      attempt.reader = null; attempt.event = null;
    }
    var index = pending.indexOf(record);
    if (index !== -1) pending.splice(index, 1);
    record.fields = null; record.form = null; record.attempts = null;
    record.successNodes = null; record.errorNodes = null;
    record.key = null; record.path = null; record.observer = null;
  }
  function current(record) {
    var key = record.key, portal = key.portal;
    if (!document.documentElement.contains(portal) || !key.root.contains(key.widget) ||
        !key.widget.contains(portal) || !portal.closest('.fwgt.show') || !visible(portal) ||
        window.location.pathname !== record.path ||
        record.form.getAttribute('action') !== key.url ||
        (record.form.getAttribute('method') || '').toLowerCase() !== 'post') return false;
    var forms = portal.querySelectorAll('form');
    return forms.length === 0 || (forms.length === 1 && forms[0] === record.form);
  }
  function inspect(record) {
    if (record.dead) return;
    try {
      if (!allowed() || suspended || stopped || Date.now() >= record.expires || !current(record)) {
        finish(record, true); return;
      }
      var errors = record.key.portal.querySelectorAll('.errmsg');
      for (var e = 0; e < errors.length; e++) {
        if (visible(errors[e]) && record.errorNodes.indexOf(errors[e]) === -1) {

          finish(record, true); return;
        }
      }
      for (var a = 0; a < record.attempts.length; a++) {
        if (!record.attempts[a].confirmed || !record.attempts[a].event.defaultPrevented) return;
      }
      var successes = record.key.portal.querySelectorAll('.fscss');
      for (var i = 0; i < successes.length; i++) {
        var node = successes[i];
        if (record.successNodes.indexOf(node) !== -1 || !visible(node) ||
            !node.querySelector('.tyou') || !node.querySelector('.scssmsg')) continue;
        var payload = release(record), form = record.form;
        finish(record, record.attempts.length > 1);
        if (!allowed()) return;
        form.setAttribute('data-converly-processing', 'true');
        try {
          var push = { event: 'copper_form_submitted', form_id: payload.submissionContext.form_id };
          (window.dataLayer = window.dataLayer || []).push(push);
         }
        finally { form.removeAttribute('data-converly-processing'); }
        return;
      }
    } catch (e) { finish(record, true); }
  }
  function arm(event) {
    if (!event || event.type !== 'submit' || event.isTrusted !== true || stopped || suspended) return null;
    if (dispatches.has(event)) return dispatches.get(event);
    dispatches.set(event, null);
    var form = event.target, key = identity(form);
    if (!key) return null;
    var old = portals.get(key.portal) || carriers.get(key.root);
    if (old) {
      if (old === true) return null;
      try {
        if (old.key.portal === key.portal && old.key.id === key.id && old.form === form &&
            Date.now() - old.started <= 2000 && allowed() && current(old) &&
            sameSnapshot(old.fields, snapshot(form)) && allowed()) return addAttempt(old, event);
      } catch (e) {  }
      finish(old, true); return null;
    }

    if (!allowed() || !install()) { portals.set(key.portal, true); carriers.set(key.root, true); return null; }
    var started = Date.now();
    var record = { form: form, key: key, path: window.location.pathname,
      started: started, expires: started + 60000, dead: false, attempts: [],
      successNodes: Array.prototype.slice.call(key.portal.querySelectorAll('.fscss')),
      errorNodes: Array.prototype.slice.call(key.portal.querySelectorAll('.errmsg')) };
    portals.set(key.portal, record); carriers.set(key.root, record); pending.push(record);
    var attempt = addAttempt(record, event);
    try {
      record.fields = snapshot(form);
      if (!record.fields || !allowed()) { finish(record, true); return null; }
      record.observer = new MutationObserver(function() { inspect(record); });
      record.observer.observe(key.portal, { childList: true, subtree: true, attributes: true });
      record.timer = setTimeout(function() { finish(record, true); }, 60000);
      record.poll = setInterval(function() { inspect(record); }, 100);
      return attempt;
    } catch (e) { finish(record, true); return null; }
  }
  function handleSubmit(event) { try { arm(event); } catch (e) {  } }
  function answer(attempt, response) {
    var record = attempt.record;
    if (record.dead) return;
    if (!allowed() || !current(record)) { finish(record, true); return; }

    if (!response || response.url !== record.key.url || response.redirected || response.type === 'opaque') {
      finish(record, true); return;
    }
    if (response.status !== 200) { finish(record, record.attempts.length > 1); return; }

    var clone = response.clone();
    if (!clone.body) { attempt.confirmed = true; inspect(record); return; }
    var reader = clone.body.getReader();
    attempt.reader = reader;
    reader.read().then(function(part) {
      if (!part.done) {
        try { reader.cancel().catch(function() {}); } catch (e) {  }
      }
      if (record.dead) return;
      if (!allowed() || !part.done) { finish(record, true); return; }
      attempt.confirmed = true; inspect(record);
    }, function() { finish(record, true); });
  }
  function install() {
    if (installed) return true;
    if (stopped || suspended || typeof window.fetch !== 'function' || !('event' in window)) return false;
    previousFetch = window.fetch;
    wrappedFetch = function() {
      var record = null, attempt = null;
      try {
        var url = endpoint(arguments[0]), options = arguments[1];

        if (!stopped && !suspended && url && options && options.method === 'POST') {
          attempt = arm(window.event);
          record = attempt && attempt.record;
          if (record && !record.dead && record.key.url === url.url && current(record)) {
            if (attempt.bound) { finish(record, true); record = null; }
            else attempt.bound = true;
          } else record = null;
        }
      } catch (e) { if (record) finish(record, true); record = null; }
      var result;
      try { result = previousFetch.apply(this, arguments); }
      catch (error) { if (record && !record.dead) finish(record, record.attempts.length > 1); throw error; }
      if (record) {
        try {
          result.then(function(response) {
            try { answer(attempt, response); } catch (e) { finish(record, true); }
          }, function() { if (!record.dead) finish(record, record.attempts.length > 1); });
        } catch (e) { finish(record, true); }
      }
      return result;
    };
    try {
      window.fetch = wrappedFetch;
      installed = window.fetch === wrappedFetch;
    } catch (e) { installed = false; }
    if (!installed) {
      try { if (window.fetch === wrappedFetch) window.fetch = previousFetch; } catch (e) {  }
    }
    controller.state = installed ? 'installed' : 'unavailable';
    return installed;
  }
  function checkInstall() {
    if (stopped || suspended || !allowed()) return;
    var forms = document.querySelectorAll('form');
    for (var i = 0; i < forms.length; i++) if (identity(forms[i])) { install(); return; }
  }
  function hide() {
    suspended = true;
    while (pending.length) finish(pending[0], true);
  }
  function show() { suspended = false; checkInstall(); }
  function teardown() {
    stopped = true; hide();
    window.removeEventListener('submit', handleSubmit, true);
    window.removeEventListener('pagehide', hide);
    window.removeEventListener('pageshow', show);
    document.removeEventListener('DOMContentLoaded', checkInstall);
    window.removeEventListener('load', checkInstall);
    if (window.fetch === wrappedFetch) window.fetch = previousFetch;
    controller.state = 'stopped';
  }
  window.addEventListener('submit', handleSubmit, true);
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', show);
  document.addEventListener('DOMContentLoaded', checkInstall);
  window.addEventListener('load', checkInstall);
  checkInstall();
})();
