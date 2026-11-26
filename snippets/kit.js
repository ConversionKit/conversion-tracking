/*! Kit conversion detection - ConversionKit
 *  https://github.com/ConversionKit/conversion-tracking | https://converly.io
 *  Detects: form submission. Pushes dataLayer event: kit_form_submitted
 *  Keep this notice when sharing or installing this snippet. */
/* Kit Form Listener by Converly. Pushes only event and form metadata. */
(function() {
  'use strict';

  window.dataLayer = window.dataLayer || [];
  var sink = {
    siteKey: 'gtm-pack-kit-event-only',
    advertisingAllowed: function () { return true; },
    onSubmission: function (payload) {
      var context = payload.submissionContext || {};
      var push = { event: 'kit_form_submitted', form_id: context.form_id || null };
      window.dataLayer.push(push);
    }
  };

  if (window.__converlyRecipeKit) return;
  window.__converlyRecipeKit = true;

  var pending = [];
  var consumed = new WeakSet();
  var PREFIX = '[Converly:kit-forms]';

  function warn() { ; }

  function consentAllows() {
    try {
      var c = sink;
      return !(c && typeof c.advertisingAllowed === 'function' && c.advertisingAllowed() === false);
    } catch (e) { return true; }
  }

  function ready() {
    return sink && typeof sink.onSubmission === 'function';
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
      if (SENSITIVE_AUTOCOMPLETE[tokens[t]] === true) return true;
    }
    return isSensitiveName(name);
  }

  function labelTextFor(el, form) {
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
      var style = window.getComputedStyle(node);
      if (node.hidden || style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  }

  function eligible(el, types) {
    return el.tagName === 'INPUT' && types.indexOf((el.type || 'text').toLowerCase()) !== -1 && !el.disabled && visible(el);
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

  function sources(form, name) {
    var result = [];
    for (var i = 0; i < form.elements.length; i++) {
      if (form.elements[i].name === name) result.push(form.elements[i]);
    }
    return result;
  }

  function snapshot(form) {
    var data = {};
    var seen = [];
    var emailControls = sources(form, 'email_address');
    var emailControl = emailControls.length === 1 ? emailControls[0] : null;
    var emailSafe = !!(emailControl && eligible(emailControl, ['email', 'text']) && safeControl(emailControl, form));
    var submittedEmail = emailSafe ? emailValue(emailControl.value) : '';
    for (var i = 0; i < form.elements.length; i++) {
      var el = form.elements[i];
      var type = (el.type || 'text').toLowerCase();
      if (!/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) ||
          /^(hidden|submit|button|reset|image|file)$/.test(type) || !visible(el) || !safeControl(el, form)) continue;
      var name = el.name || el.id || '';
      if (name) seen.push({ name: name, type: type });
    }
    var keys = ['fields[first_name]', 'fields[last_name]', 'fields[phone]', 'fields[phone_number]'];
    return { userData: data, formFieldsSeen: seen, emailControl: emailControl,
      emailSafe: emailSafe, submittedEmail: submittedEmail };
  }

  function identity(form) {
    if (!form || form.tagName !== 'FORM' || form.ownerDocument !== document ||
        !document.documentElement.contains(form)) return null;
    var id = form.getAttribute('data-sv-form') || '';
    var uid = form.getAttribute('data-uid') || '';
    if (!id || id.length > 15 || /[^0-9]/.test(id) ||
        !uid || uid.length > 64 || /[^a-zA-Z0-9]/.test(uid)) return null;
    var action = form.getAttribute('action') || '';

    if (action !== 'https://app.kit.com/forms/' + id + '/subscriptions' &&
        action !== 'https://app.convertkit.com/forms/' + id + '/subscriptions') return null;
    return { id: id, uid: uid, action: action };
  }

  function recordFor(form) {
    for (var i = 0; i < pending.length; i++) if (pending[i].form === form) return pending[i];
    return null;
  }

  function discard(record) {
    if (!record) return;
    var index = pending.indexOf(record);
    if (index !== -1) pending.splice(index, 1);
    record.snapshot = null;
    record.form = null;
  }

  function clearPending() {
    while (pending.length) discard(pending[0]);
  }

  function handleSubmit(event) {
    var form = event.target;
    var old = recordFor(form);
    try {
      if (event.isTrusted !== true) return;
      var key = identity(form);
      if (!key || !consentAllows() || !ready()) { discard(old); return; }
      if (consumed.has(form) || form.getAttribute('data-converly-recipe-processing')) return;
      if (old && Date.now() - old.armedAt < 500 && old.id === key.id &&
          old.uid === key.uid && old.action === key.action) return;
      discard(old);
      pending.push({ form: form, id: key.id, uid: key.uid, action: key.action,
        pageUrl: window.location.pathname, armedAt: Date.now(), snapshot: snapshot(form) });
    } catch (e) { discard(old); warn(); }
  }

  function emailStillSafe(record) {
    var snap = record.snapshot;
    if (!snap.emailSafe) return false;
    var current = sources(record.form, 'email_address');
    if (current.length > 1 || (current.length === 1 && current[0] !== snap.emailControl)) return false;

    if (document.documentElement.contains(snap.emailControl)) {
      return current.length === 1 && eligible(snap.emailControl, ['email', 'text']) && safeControl(snap.emailControl, record.form);
    }
    return current.length === 0;
  }

  function handleComplete(event) {
    var record = recordFor(event.target);
    if (!record) return;
    try {
      if (!consentAllows() || !ready()) { discard(record); return; }
      var key = identity(event.target);
      if (!key || key.id !== record.id || key.uid !== record.uid || key.action !== record.action) {
        discard(record); return;
      }
      var detail = event.detail;
      if (!detail || typeof detail !== 'object' || Array.isArray(detail) ||
          typeof detail.uid !== 'string' || detail.uid !== record.uid) return;
      var snap = record.snapshot;
      var email = emailStillSafe(record) ? emailValue(detail.email_address) : '';
      if (email && snap.submittedEmail && email.toLowerCase() !== snap.submittedEmail.toLowerCase()) {
        discard(record); return;
      }
      if (!consentAllows() || !ready()) { discard(record); return; }
      if (email) snap.userData.email = email;
      var form = record.form;
      var payload = { trigger: 'kit-forms', pageUrl: record.pageUrl, userData: snap.userData,
        formFieldsSeen: snap.formFieldsSeen, submissionContext: { form_id: record.id } };
      consumed.add(form);
      discard(record);
      form.setAttribute('data-converly-recipe-processing', 'true');
      setTimeout(function() { form.removeAttribute('data-converly-recipe-processing'); }, 2000);
      sink.onSubmission(payload);
    } catch (e) { discard(record); warn(); }
  }

  document.addEventListener('submit', handleSubmit, true);
  document.addEventListener('ckjs:submission:complete', handleComplete, true);
  window.addEventListener('pagehide', clearPending);
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(function() {
      for (var i = pending.length - 1; i >= 0; i--) {
        if (!document.documentElement.contains(pending[i].form)) discard(pending[i]);
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

})();
