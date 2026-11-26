/*! Insightly Web Forms conversion detection - ConversionKit
 *  https://github.com/ConversionKit/conversion-tracking | https://converly.io
 *  Detects: form submission. Pushes dataLayer event: insightly_form_submitted
 *  Keep this notice when sharing or installing this snippet. */
// Counts a return to the site after Web-to-Lead, not a confirmed saved lead.
(function() {
  'use strict';

  if (window.__converlyRecipeInsightlyInstalled) return;
  window.__converlyRecipeInsightlyInstalled = true;

  if (window.top !== window) return;

  var PENDING_KEY = '__converly_recipe_insightly_pending_v1';
  var TTL = 60000;
  var active = null;
  var landingWait = null;
  var disabled = false;
  var CONTACTS = { email: 'email', FirstName: 'firstName', LastName: 'lastName', phone: 'phone' };

  function ready() { return !disabled; }
  function removePending() {
    try { window.sessionStorage.removeItem(PENDING_KEY); return true; } catch (e) { return false; }
  }
  function plain(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function keys(value, expected) { return plain(value) && Object.keys(value).sort().join(',') === expected; }
  function safeString(value, max) {
    return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
  }
  function validPath(path) {
    return safeString(path, 2048) && /^\/(?!\/)/.test(path) && !/[?#\\]/.test(path) &&
      new URL(path, window.location.origin).pathname === path;
  }
  function pathKey(path) { return path.replace(/\/+$/, '') || '/'; }
  function boundedRaw(raw) {
    return typeof raw === 'string' && raw.length <= 16384 &&
      encodeURIComponent(raw).replace(/%[A-F0-9]{2}/g, 'x').length <= 16384;
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
      if (SENSITIVE_AUTOCOMPLETE[tokens[t]] === true || /^cc-/.test(tokens[t])) return true;
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

  function isInsightlyForm(form) {
    if (!form || form.tagName !== 'FORM' || !form.getAttribute) return false;

    var raw = form.getAttribute('action');
    return typeof raw === 'string' && !/\s/.test(raw) &&
      /^https:\/\/crm\.[a-z0-9]+\.insightly\.com\/WebToLead\/Create$/.test(raw);
  }

  function ownedNamed(form, name) {
    var result = [];
    for (var i = 0; i < form.elements.length; i++) {
      var el = form.elements[i];
      if (el.form === form && el.name === name) result.push(el);
    }
    return result;
  }
  function enabled(el) { return !el.disabled && !el.matches(':disabled'); }
  function identity(form, submitter) {
    if (!isInsightlyForm(form) || form.ownerDocument !== document ||
        !document.documentElement.contains(form) || window.location.protocol !== 'https:' ||
        form.method.toLowerCase() !== 'post' || form.enctype !== 'application/x-www-form-urlencoded') return null;
    if (submitter && (submitter.form !== form || submitter.hasAttribute('formaction') ||
        submitter.hasAttribute('formmethod') || submitter.hasAttribute('formenctype') || submitter.hasAttribute('formtarget'))) return null;
    var base = document.querySelector('base[target]');
    var target = form.getAttribute('target') || (base && base.getAttribute('target')) || '_self';
    if (target.toLowerCase() !== '_self') return null;
    var ids = ownedNamed(form, 'formId');
    if (ids.length !== 1) return null;
    var control = ids[0];
    if (control.tagName !== 'INPUT' || control.type !== 'hidden' || !enabled(control) || !safeControl(control, form)) return null;
    var formId = control.value;
    if (!safeString(formId, 256) || formId.trim() !== formId) return null;
    return { formPath: window.location.pathname, formId: formId,
      action: form.getAttribute('action'), control: control };
  }

  function excluded(el, form) {
    var type = (el.type || 'text').toLowerCase();
    return el.form !== form || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || !enabled(el) ||
      /^(hidden|submit|button|reset|image|file)$/.test(type) || !safeString(el.name, 256) ||
      /(?:captcha|honeypot|debug)/i.test(el.name + ' ' + el.id) || !safeControl(el, form);
  }
  function snapshot(form) {
    var data = {}, seen = [], tracked = [];
    for (var i = 0; i < form.elements.length; i++) {
      var el = form.elements[i];
      if (excluded(el, form)) continue;
      var type = (el.type || 'text').toLowerCase();
      if (seen.length >= 100) return null;
      seen.push({ name: el.name, type: type });
      tracked.push({ el: el, name: el.name, type: type, count: ownedNamed(form, el.name).length });
      var key = Object.prototype.hasOwnProperty.call(CONTACTS, el.name) && CONTACTS[el.name];
      if (!key || el.tagName !== 'INPUT' || !/^(text|email|tel)$/.test(type) || ownedNamed(form, el.name).length !== 1) continue;
        // Event-only mode does not read contact values.
    }
    return { payload: { userData: data, formFieldsSeen: seen }, tracked: tracked };
  }
  function validRecord(record) {
    if (!keys(record, 'attemptId,created,formId,formPath,origin,payload,siteKey,v') || record.v !== 1 || !ready() ||
        record.siteKey !== 'insightly-forms-event-v1' || record.origin !== window.location.origin || window.location.protocol !== 'https:' ||
        (typeof record.attemptId !== 'string' || !/^[a-f0-9]{32}$/.test(record.attemptId)) || typeof record.created !== 'number' || !isFinite(record.created) ||
        Date.now() - record.created < 0 || Date.now() - record.created >= TTL ||
        !validPath(record.formPath) || !safeString(record.formId, 256) || record.formId.trim() !== record.formId) return false;
    var payload = record.payload;
    if (!keys(payload, 'formFieldsSeen,userData') || !plain(payload.userData) || !Array.isArray(payload.formFieldsSeen) || payload.formFieldsSeen.length > 100) return false;
    var names = Object.keys(payload.userData);
    for (var i = 0; i < names.length; i++) {
      if (['email', 'phone', 'firstName', 'lastName'].indexOf(names[i]) === -1 || !safeString(payload.userData[names[i]], 512)) return false;
    }
    for (var j = 0; j < payload.formFieldsSeen.length; j++) {
      var field = payload.formFieldsSeen[j];
      if (!keys(field, 'name,type') || typeof field.type !== 'string' || !safeString(field.name, 256) || isSensitiveName(field.name) ||
          /(?:captcha|honeypot|debug)/i.test(field.name) ||
          !/^(text|email|tel|url|number|search|date|datetime-local|month|week|time|color|range|checkbox|radio|textarea|select-one|select-multiple)$/.test(field.type)) return false;
    }
    return true;
  }
  function attemptId() {
    var bytes = new Uint8Array(16), id = '';
    window.crypto.getRandomValues(bytes);
    for (var i = 0; i < bytes.length; i++) id += ('0' + bytes[i].toString(16)).slice(-2);
    return id;
  }
  function stop(attempt, preserve) {
    if (!attempt || active !== attempt) return;
    clearTimeout(attempt.afterDispatch); clearTimeout(attempt.timeout); clearInterval(attempt.sweep);
    if (attempt.observer) attempt.observer.disconnect();
    window.removeEventListener('pagehide', attempt.hide, true);
    active = null;
    attempt.form = attempt.record = attempt.event = attempt.identity = attempt.tracked = null;
    if (!preserve) removePending();
  }
  function unchanged(attempt) {
    if (!ready() || attempt.event.defaultPrevented) return false;
    var current = identity(attempt.form, attempt.event.submitter), original = attempt.identity;
    if (!current || !validRecord(attempt.record) || current.formPath !== original.formPath || current.action !== original.action ||
        current.formId !== original.formId || current.control !== original.control) return false;
    for (var i = 0; i < attempt.tracked.length; i++) {
      var item = attempt.tracked[i], el = item.el;
      if (!document.documentElement.contains(el) || excluded(el, attempt.form) || el.name !== item.name || el.type !== item.type ||
          (Object.prototype.hasOwnProperty.call(CONTACTS, item.name) && ownedNamed(attempt.form, item.name).length !== item.count)) return false;
    }
    return true;
  }
  function recheck(attempt) {
    if (active !== attempt) return;
    try { if (!unchanged(attempt)) stop(attempt); } catch (e) { stop(attempt); }
  }
  function handleSubmit(event) {
    if (event.isTrusted !== true) return;
    cancelLanding();

    stop(active); removePending();
    try {
      if (!ready() || event.defaultPrevented || !removePending()) return;
      var key = identity(event.target, event.submitter);
      if (!key) return;
      var captured = snapshot(event.target);
      if (!captured) return;
      var record = { v: 1, siteKey: 'insightly-forms-event-v1', origin: window.location.origin,
        created: Date.now(), attemptId: attemptId(), formPath: key.formPath,
        formId: key.formId, payload: captured.payload };
      if (!validRecord(record) || !boundedRaw(JSON.stringify(record))) return;
      var attempt = { form: event.target, event: event, identity: key, record: record, tracked: captured.tracked };
      active = attempt;
      attempt.hide = function() {
        try {
          if (!unchanged(attempt)) { stop(attempt); return; }
          var raw = JSON.stringify(attempt.record);
          if (!boundedRaw(raw)) { stop(attempt); return; }
          window.sessionStorage.setItem(PENDING_KEY, raw);
          stop(attempt, true);
        } catch (e) { stop(attempt); }
      };
      window.addEventListener('pagehide', attempt.hide, true);
      attempt.afterDispatch = setTimeout(function() {
        recheck(attempt);
        if (active !== attempt) return;
        try {
          var raw = JSON.stringify(attempt.record);
          if (!boundedRaw(raw)) { stop(attempt); return; }
          window.sessionStorage.setItem(PENDING_KEY, raw);
        } catch (e) { stop(attempt); }
      }, 0);
      attempt.sweep = setInterval(function() { recheck(attempt); }, 250);
      attempt.timeout = setTimeout(function() { stop(attempt); }, TTL);
      attempt.observer = new MutationObserver(function() { recheck(attempt); });
      attempt.observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
    } catch (e) { stop(active); removePending(); }
  }
  function clearLandingWait() {
    var waiting = landingWait;
    if (!waiting) return null;
    landingWait = null;
    clearInterval(waiting.sweep); clearTimeout(waiting.timeout);
    window.removeEventListener('load', onLandingLoad);
    window.removeEventListener('pagehide', cancelLanding, true);
    return waiting.record;
  }
  function cancelLanding() { clearLandingWait(); removePending(); }
  function onLandingLoad() {
    var record = clearLandingWait();
    try { if (record) evaluateLanding(record, true); } catch (e) { cancelLanding(); }
  }
  function evaluateLanding(record, afterLoad) {
    if (!validRecord(record)) return;
    var url = new URL(window.location.href);
    if (pathKey(url.pathname) === pathKey(record.formPath)) return;
    var entries = window.performance.getEntriesByType('navigation'), nav = entries && entries[0];
    if (!nav && !afterLoad && document.readyState !== 'complete') {
      landingWait = { record: record };
      landingWait.sweep = setInterval(function() { if (!ready()) cancelLanding(); }, 250);
      landingWait.timeout = setTimeout(cancelLanding, TTL - (Date.now() - record.created));
      window.addEventListener('load', onLandingLoad);
      window.addEventListener('pagehide', cancelLanding, true);
      return;
    }
    if (!nav || nav.type !== 'navigate' || ('responseStatus' in nav && nav.responseStatus !== 200)) return;
    if (!ready()) return;
    var output = { event: 'insightly_form_submitted', form_id: record.formId };
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(output);
  }
  function processLanding() {
    if (window.__converlyRecipeInsightlyBlockedArrival) { removePending(); return; }
    try {
      var raw = window.sessionStorage.getItem(PENDING_KEY);
      if (!removePending() || !raw || !boundedRaw(raw)) return;
      evaluateLanding(JSON.parse(raw), false);
    } catch (e) { cancelLanding(); }
  }
  function abandon(event) {
    if (!active) return;
    if ((event.type === 'input' || event.type === 'change') &&
        (event.target.form === active.form || active.form.contains(event.target))) stop(active);
    else if (event.type === 'reset' && event.target === active.form) stop(active);
    else if (event.type === 'click' && event.target.closest && event.target.closest('a[href]')) stop(active);
  }
  function onPageShow(event) { if (event.persisted) { cancelLanding(); stop(active); removePending(); } }

  function disable() { disabled = true; cancelLanding(); stop(active); removePending(); }
  function destroy() {
    clearLandingWait(); stop(active);
    document.removeEventListener('submit', handleSubmit, true);
    document.removeEventListener('input', abandon, true);
    document.removeEventListener('change', abandon, true);
    document.removeEventListener('reset', abandon, true);
    document.removeEventListener('click', abandon, true);
    window.removeEventListener('pageshow', onPageShow, true);
    delete window.__converlyRecipeInsightlyInstalled;
    delete window.__converlyRecipeInsightly;
  }
  window.__converlyRecipeInsightly = { disable: disable };
  processLanding();
  document.addEventListener('submit', handleSubmit, true);
  document.addEventListener('input', abandon, true);
  document.addEventListener('change', abandon, true);
  document.addEventListener('reset', abandon, true);
  document.addEventListener('click', abandon, true);
  window.addEventListener('pageshow', onPageShow, true);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { handleSubmit: handleSubmit, destroy: destroy, disable: disable,
      isInsightlyForm: isInsightlyForm, pendingKey: PENDING_KEY };
  }
})();
