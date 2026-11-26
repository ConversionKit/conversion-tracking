/*! Netlify conversion detection - ConversionKit
 *  https://github.com/ConversionKit/conversion-tracking | https://converly.io
 *  Detects: form submission. Pushes dataLayer event: netlify_form_submitted
 *  Keep this notice when sharing or installing this snippet. */
/* Netlify Form Listener by Converly. Pushes only event and form metadata. */
(function() {
  'use strict';

  window.dataLayer = window.dataLayer || [];
  var sink = {
    siteKey: 'gtm-pack-netlify-event-only',
    advertisingAllowed: function () { return true; },
    onSubmission: function (payload) {
      var context = payload.submissionContext || {};
      var push = { event: 'netlify_form_submitted', form_name: context.form_id || null };
      window.dataLayer.push(push);
    }
  };

  if (window.top !== window || window.__converlyRecipeNetlify) return;
  window.__converlyRecipeNetlify = true;

  var PENDING_KEY = '__converlyRecipe_netlify_pending_v2';
  var TTL = 120000;
  var active = null;
  var landingWait = null;

  function consentAllows() {

    try {
      var c = sink;
      return !(c && typeof c.advertisingAllowed === 'function' && c.advertisingAllowed() === false);
    } catch (e) { return true; }
  }

  function ready() {
    var c = sink;
    return c && typeof c.onSubmission === 'function' && typeof c.siteKey === 'string' &&
      c.siteKey.length > 0 && c.siteKey.length <= 256;
  }

  function removePending() {
    try { window.sessionStorage.removeItem(PENDING_KEY); return true; } catch (e) { return false; }
  }

  function pathKey(path) { return path.replace(/\/+$/, '') || '/'; }
  function plain(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function keys(value, expected) { return plain(value) && Object.keys(value).sort().join(',') === expected; }
  function safeString(value, max) {
    return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
  }
  function validPath(path, max) {
    if (!safeString(path, max) || !/^\/(?!\/)/.test(path) || /[?#\\]/.test(path)) return false;
    return new URL(path, window.location.origin).pathname === path;
  }
  function boundedRaw(raw) {
    return typeof raw === 'string' && raw.length <= 32768 &&
      encodeURIComponent(raw).replace(/%[A-F0-9]{2}/g, 'x').length <= 32768;
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

  function normalizeKey(s) {

    return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function scoreField(field) {
    var scores = {
      email: 0,
      phone: 0,
      firstName: 0,
      lastName: 0,
      fullName: 0,
    };

    var type = field.type;
    var ac = field.autocomplete;
    var key = normalizeKey(field.name);

    if (type === 'email') scores.email = 100;
    if (type === 'tel') scores.phone = 100;

    if (ac === 'email') scores.email = Math.max(scores.email, 90);
    if (
      ac === 'tel' ||
      ac === 'tel-national' ||
      ac === 'tel-local' ||
      ac === 'tel-country-code' ||
      ac === 'tel-area-code' ||
      ac === 'mobile tel' // some libraries emit this
    ) {
      scores.phone = Math.max(scores.phone, 90);
    }
    if (ac === 'given-name') scores.firstName = Math.max(scores.firstName, 90);
    if (ac === 'family-name') scores.lastName = Math.max(scores.lastName, 90);
    if (ac === 'name') scores.fullName = Math.max(scores.fullName, 90);

    if (key.indexOf('email') !== -1) {
      scores.email = Math.max(scores.email, 50);
    }
    if (
      key.indexOf('phone') !== -1 ||
      key.indexOf('mobile') !== -1 ||
      key === 'tel' ||
      key.indexOf('telephone') !== -1
    ) {
      scores.phone = Math.max(scores.phone, 50);
    }

    if (
      key === 'first' ||
      key === 'fname' ||
      key === 'givenname' ||
      key.indexOf('firstname') !== -1 ||
      key.indexOf('givenname') !== -1
    ) {
      scores.firstName = Math.max(scores.firstName, 50);
    }

    if (
      key === 'last' ||
      key === 'lname' ||
      key === 'familyname' ||
      key.indexOf('lastname') !== -1 ||
      key.indexOf('surname') !== -1 ||
      key.indexOf('familyname') !== -1
    ) {
      scores.lastName = Math.max(scores.lastName, 50);
    }

    if (
      scores.firstName === 0 &&
      scores.lastName === 0 &&
      (key === 'name' || key === 'fullname' || key === 'yourname' || key === 'fullName')
    ) {
      scores.fullName = Math.max(scores.fullName, 50);
    }

    if (!field.labelPass) {
      var labels = scoreField({ type: '', autocomplete: '', name: field.label || '', labelPass: true });
      var ids = scoreField({ type: '', autocomplete: '', name: field.id || '', labelPass: true });
      for (var category in scores) {
        scores[category] = Math.max(scores[category], labels[category] ? 80 : 0, ids[category]);
      }
      var tokens = (ac || '').split(/\s+/);
      for (var i = 0; i < tokens.length; i++) {
        var tokenScores = scoreField({ type: '', autocomplete: tokens[i], name: '', labelPass: true });
        for (var key in scores) scores[key] = Math.max(scores[key], tokenScores[key]);
      }
    }
    return scores;
  }

  function identify(fields) {
    var best = {
      email: { value: undefined, score: 0 },
      phone: { value: undefined, score: 0 },
      firstName: { value: undefined, score: 0 },
      lastName: { value: undefined, score: 0 },
      fullName: { value: undefined, score: 0 },
    };

    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      var scores = scoreField(field);

      var trimmed = (field.value || '').toString().trim();
      if (!trimmed) continue;

      for (var category in scores) {
        if (scores[category] > best[category].score) {
          best[category] = { value: field.value, score: scores[category] };
        }
      }
    }

    var result = {};
    if (best.email.value) result.email = best.email.value;
    if (best.phone.value) result.phone = best.phone.value;
    if (best.firstName.value) result.firstName = best.firstName.value;
    if (best.lastName.value) result.lastName = best.lastName.value;

    if (best.fullName.value && !result.firstName && !result.lastName) {
      var parts = best.fullName.value.split(/\s+/);
      if (parts.length === 1) {
        result.firstName = parts[0];
      } else {
        result.firstName = parts[0];
        result.lastName = parts.slice(1).join(' ');
      }
    }

    return result;
  }

  function snapshot() { return { userData: {}, formFieldsSeen: [] }; }

  function marked(form) {
    if (!form || form.tagName !== 'FORM' || !form.elements) return false;
    for (var i = 0; i < form.elements.length; i++) {
      var el = form.elements[i];
      if (el.form === form && el.tagName === 'INPUT' && el.type === 'hidden' && el.name === 'form-name') return true;
    }
    return false;
  }

  function identity(form, submitter) {
    if (!form || form.tagName !== 'FORM' || form.ownerDocument !== document ||
        !document.documentElement.contains(form) || window.location.protocol !== 'https:') return null;
    if (form.method.toLowerCase() !== 'post') return null;
    if (submitter && (submitter.hasAttribute('formaction') || submitter.hasAttribute('formmethod') ||
        submitter.hasAttribute('formtarget'))) return null;
    var base = document.querySelector('base[target]');
    var target = form.getAttribute('target') || (base && base.getAttribute('target')) || '_self';
    if (target.toLowerCase() !== '_self') return null;
    var action = new URL(form.getAttribute('action') || window.location.href, document.baseURI);
    if (action.protocol !== 'https:' || action.origin !== window.location.origin || action.username || action.password ||
        pathKey(action.pathname) === pathKey(window.location.pathname)) return null;
    var named = [];
    for (var i = 0; i < form.elements.length; i++) {
      if (form.elements[i].name === 'form-name') named.push(form.elements[i]);
    }
    if (named.length !== 1 || named[0].tagName !== 'INPUT' || named[0].type !== 'hidden' ||
        named[0].disabled || named[0].matches(':disabled') || named[0].form !== form || !safeControl(named[0], form)) return null;
    var id = named[0].value;
    if (!safeString(id, 256) || !id.trim() || id !== form.getAttribute('name')) return null;
    return { formId: id, formPath: window.location.pathname, actionPath: action.pathname, actionSearch: action.search };
  }

  function validRecord(record) {
    if (!keys(record, 'actionPath,actionSearch,created,formId,formPath,origin,payload,siteKey,v') ||
        record.v !== 1 || !ready() || record.siteKey !== sink.siteKey ||
        record.origin !== window.location.origin || window.location.protocol !== 'https:' ||
        typeof record.created !== 'number' || !isFinite(record.created) ||
        Date.now() - record.created < 0 || Date.now() - record.created >= TTL ||
        !validPath(record.formPath, 2048) || !validPath(record.actionPath, 4096) ||
        !safeString(record.formId, 256) || !record.formId.trim() ||
        typeof record.actionSearch !== 'string' || /[#\x00-\x20\x7f]/.test(record.actionSearch) ||
        (record.actionSearch && record.actionSearch.charAt(0) !== '?') ||
        record.actionPath.length + record.actionSearch.length > 4096 ||
        pathKey(record.formPath) === pathKey(record.actionPath)) return false;
    if (new URL(record.actionPath + record.actionSearch, record.origin).search !== record.actionSearch) return false;
    var payload = record.payload;
    if (!keys(payload, 'formFieldsSeen,userData') || !plain(payload.userData) ||
        !Array.isArray(payload.formFieldsSeen) || payload.formFieldsSeen.length > 100) return false;
    var names = Object.keys(payload.userData);
    for (var i = 0; i < names.length; i++) {
      if (['email', 'phone', 'firstName', 'lastName'].indexOf(names[i]) === -1 ||
          typeof payload.userData[names[i]] !== 'string' || payload.userData[names[i]].length > 512) return false;
    }
    for (var j = 0; j < payload.formFieldsSeen.length; j++) {
      var field = payload.formFieldsSeen[j];
      if (!keys(field, 'name,type') || !safeString(field.name, 256) || isSensitiveName(field.name) ||
          !/^(text|email|tel|url|number|search|date|datetime-local|month|week|time|color|range|checkbox|radio|textarea|select-one|select-multiple)$/.test(field.type) ||
          field.name === 'form-name' || field.name === 'bot-field' || /(?:captcha|honeypot)/i.test(field.name)) return false;
    }
    return true;
  }

  function stop(attempt, preserve) {
    if (!attempt || active !== attempt) return;
    clearTimeout(attempt.afterDispatch);
    clearTimeout(attempt.timeout);
    clearInterval(attempt.sweep);
    window.removeEventListener('pagehide', attempt.hide, true);
    active = null;
    attempt.form = null;
    attempt.record = null;
    attempt.event = null;
    if (!preserve) removePending();
  }

  function unchanged(attempt) {
    if (!consentAllows() || !ready() || attempt.event.defaultPrevented) return false;
    var current = identity(attempt.form, attempt.event.submitter);
    var saved = attempt.record;
    return current && current.formId === saved.formId && current.formPath === saved.formPath &&
      current.actionPath === saved.actionPath && current.actionSearch === saved.actionSearch && validRecord(saved);
  }

  function handleSubmit(event) {
    if (event.isTrusted !== true) return;
    try {
      if (!consentAllows()) { stop(active); removePending(); return; }
      if (!marked(event.target)) return;
      cancelLanding();
      stop(active);

      if (!removePending() || !ready() || event.defaultPrevented) return;
      var key = identity(event.target, event.submitter);
      if (!key) return;
      var record = { v: 1, siteKey: sink.siteKey, origin: window.location.origin,
        created: Date.now(), formPath: key.formPath, formId: key.formId,
        actionPath: key.actionPath, actionSearch: key.actionSearch, payload: snapshot(event.target) };
      if (!consentAllows() || !validRecord(record)) { removePending(); return; }
      var raw = JSON.stringify(record);
      if (!boundedRaw(raw)) return;
      window.sessionStorage.setItem(PENDING_KEY, raw);
      var attempt = { form: event.target, record: record, event: event };
      active = attempt;
      attempt.hide = function() {
        try { stop(attempt, unchanged(attempt)); } catch (e) { stop(attempt); }
      };
      window.addEventListener('pagehide', attempt.hide, true);
      attempt.afterDispatch = setTimeout(function() {
        if (active !== attempt) return;
        try { if (!unchanged(attempt)) stop(attempt); } catch (e) { stop(attempt); }
      }, 0);
      attempt.sweep = setInterval(function() {
        if (active !== attempt) return;
        try { if (!unchanged(attempt)) stop(attempt); } catch (e) { stop(attempt); }
      }, 250);
      attempt.timeout = setTimeout(function() { stop(attempt); }, TTL);
    } catch (e) { stop(active); removePending(); }
  }

  function clearLandingWait() {
    if (!landingWait) return;
    clearInterval(landingWait.sweep);
    window.removeEventListener('load', onLandingLoad);
    window.removeEventListener('pagehide', cancelLanding, true);
    landingWait = null;
  }

  function cancelLanding() {
    if (!landingWait) return;
    clearLandingWait();
    removePending();
  }

  function onLandingLoad() {
    clearLandingWait();
    processLanding(true);
  }

  function processLanding(afterLoad) {
    if (!consentAllows()) { removePending(); return; }
    try {
      var raw = window.sessionStorage.getItem(PENDING_KEY);
      var entries = raw && window.performance.getEntriesByType('navigation');
      var nav = entries && entries[0];
      if (raw && !nav && !afterLoad && document.readyState !== 'complete') {
        landingWait = { sweep: setInterval(function() {
          if (!consentAllows()) cancelLanding();
        }, 250) };
        window.addEventListener('load', onLandingLoad);
        window.addEventListener('pagehide', cancelLanding, true);
        return;
      }

      window.sessionStorage.removeItem(PENDING_KEY);
      if (!raw || !boundedRaw(raw)) return;
      var record = JSON.parse(raw);
      if (!validRecord(record)) return;
      if (!nav || nav.type !== 'navigate' || pathKey(window.location.pathname) !== pathKey(record.actionPath) ||
          window.location.search !== record.actionSearch || pathKey(window.location.pathname) === pathKey(record.formPath)) return;
      if (document.referrer) {
        var referrer = new URL(document.referrer);
        if (referrer.origin !== record.origin || pathKey(referrer.pathname) !== pathKey(record.formPath)) return;
      }
      if ('responseStatus' in nav && nav.responseStatus !== 200) return;
      if (!consentAllows() || !ready()) return;
      sink.onSubmission({ trigger: 'netlify', pageUrl: record.formPath,
        userData: record.payload.userData, formFieldsSeen: record.payload.formFieldsSeen,
        submissionContext: { form_id: record.formId } });
    } catch (e) { removePending(); }
  }

  function abandon(event) {
    if (!active) return;
    if ((event.type === 'input' || event.type === 'change') &&
        (event.target.form === active.form || active.form.contains(event.target))) stop(active);
    else if (event.type === 'click' && event.target.closest && event.target.closest('a[href]')) stop(active);
  }
  function onPageShow(event) {
    if (event.persisted) { cancelLanding(); stop(active); removePending(); }
  }

  processLanding();
  document.addEventListener('submit', handleSubmit, true);
  document.addEventListener('input', abandon, true);
  document.addEventListener('change', abandon, true);
  document.addEventListener('click', abandon, true);
  window.addEventListener('pageshow', onPageShow, true);

})();
