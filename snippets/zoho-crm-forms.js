/*! Zoho CRM Web Forms conversion detection - ConversionKit
 *  https://github.com/ConversionKit/conversion-tracking | https://converly.io
 *  Detects: form submission. Pushes dataLayer event: zoho_crm_form_submitted
 *  Keep this notice when sharing or installing this snippet. */
// Counts a return to the site after web form, not a confirmed saved lead.
(function() {
  'use strict';

  if (typeof window === 'undefined' || window.__converlyRecipeZohoCrmInstalled) return;
  if (window.top !== window) return;
  window.__converlyRecipeZohoCrmInstalled = true;

  var SENSITIVE_NAME_SUBSTRINGS = [
    'password', 'passwd', 'passcode', 'cardnum', 'ccnumber', 'creditcard',
    'onetimecode', 'securitycode', 'socialsecurity'
  ];
  var SENSITIVE_NAME_TOKENS = {
    otp: true, cvv: true, cvc: true, ssn: true, pwd: true, pin: true
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

  function plain(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var prototype = Object.getPrototypeOf(value);
    return prototype === null || prototype === Object.prototype;
  }

  function ownData(object, key) {
    var property = Object.getOwnPropertyDescriptor(object, key);
    return property && Object.prototype.hasOwnProperty.call(property, 'value') ? property.value : undefined;
  }
  var HTML_KEY = '__converly_recipe_zoho_crm_pending_v1';
  var HTML_TTL = 60000;
  var htmlActive = null;
  var htmlWait = null;
  var htmlConsumed = false;
  var htmlNonce = null;
  var HTML_CONTACTS = [
    ['Email', 'email', 'text', 512], ['First Name', 'firstName', 'text', 512],
    ['Last Name', 'lastName', 'text', 512], ['Phone', 'phone', 'text', 512]
  ];
  function htmlConsent() { return true; }
  function htmlReady() { return true; }
  function removeHtmlPending() {
    try { window.sessionStorage.removeItem(HTML_KEY); return true; } catch (e) { return false; }
  }
  function safeText(value, limit) {
    return typeof value === 'string' && value.length > 0 && value.length <= limit &&
      !/[\x00-\x1f\x7f]/.test(value);
  }
  function exactKeys(value, keys) {
    return plain(value) && Object.keys(value).sort().join(',') === keys;
  }
  function boundedHtml(raw) {
    return typeof raw === 'string' && raw.length <= 16384 &&
      encodeURIComponent(raw).replace(/%[A-F0-9]{2}/g, 'x').length <= 16384;
  }

  var ZOHO_CRM_ACTIONS = [
    'https://crm.zoho.com/crm/WebToLeadForm',
    'https://crm.zoho.eu/crm/WebToLeadForm',
    'https://crm.zoho.in/crm/WebToLeadForm',
    'https://crm.zoho.com.au/crm/WebToLeadForm',
    'https://crm.zoho.jp/crm/WebToLeadForm',
    'https://crm.zohocloud.ca/crm/WebToLeadForm',
    'https://crm.zoho.sa/crm/WebToLeadForm'
  ];
  function htmlAction(raw) {

    return ZOHO_CRM_ACTIONS.indexOf(raw) !== -1;
  }
  function htmlIdentity(form, submitter) {
    if (window.top !== window || window.location.protocol !== 'https:' || !form || form.tagName !== 'FORM' ||
        form.ownerDocument !== document || !document.documentElement.contains(form) ||
        !form.closest('.crmWebToEntityForm') || !/^webform[0-9]{1,64}$/.test(form.id)) return null;
    if (!htmlAction(form.getAttribute('action')) || (form.getAttribute('method') || '').toLowerCase() !== 'post' ||
        (form.getAttribute('enctype') || 'application/x-www-form-urlencoded').toLowerCase() !== 'application/x-www-form-urlencoded') return null;
    if (submitter && (submitter.form !== form || submitter.hasAttribute('formaction') ||
        submitter.hasAttribute('formmethod') || submitter.hasAttribute('formenctype') ||
        submitter.hasAttribute('formtarget'))) return null;
    var base = document.querySelector('base[target]');
    var target = form.getAttribute('target');
    if (target === null) target = (base && base.getAttribute('target')) || '';
    if (target && target.toLowerCase() !== '_self') return null;
    var control = null;
    var count = 0;
    for (var i = 0; i < form.elements.length; i++) {
      if (form.elements[i].name === 'returnURL') { control = form.elements[i]; count++; }
    }
    if (count !== 1 || control.form !== form || !form.contains(control) || control.disabled ||
        control.matches(':disabled') || control.tagName !== 'INPUT' || !htmlSafeControl(control, form) || !htmlConsent()) return null;
    var raw = control.value;
    if (!safeText(raw, 2048) || /[\\\s]/.test(raw)) return null;
    var url;
    try { url = new URL(raw); } catch (e) { return null; }
    if (url.origin !== window.location.origin || url.username || url.password || url.hash ||
        url.pathname === window.location.pathname || !safePath(url.pathname) ||
        (url.search !== '' && url.search !== '?converly=zoho-crm') || url.href !== raw) return null;
    return { action: form.getAttribute('action'), formId: form.id, target: target,
      returnControl: control, returnPath: url.pathname, returnQuery: url.search };
  }
  function safePath(path) {
    return safeText(path, 2048) && /^\/(?!\/)/.test(path) && !/[?#\\]/.test(path) &&
      new URL(path, window.location.origin).pathname === path;
  }
  function htmlLabelText(el, form) {
    var text = '';
    var labels = document.querySelectorAll('label');

    if (el.id) {
      var nodes = document.querySelectorAll('[id]');
      var count = 0;
      for (var n = 0; n < nodes.length; n++) if (nodes[n].id === el.id) count++;
      if (count !== 1) return null;
    }
    for (var i = 0; i < labels.length; i++) {
      var label = labels[i];
      if (label.contains(el) || (el.id && label.getAttribute('for') === el.id)) {
        if (!form.contains(label)) return null;
        text += ' ' + label.textContent;
      }
    }
    var ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/);
    for (var j = 0; j < ids.length; j++) {
      if (!ids[j]) continue;
      var matches = form.querySelectorAll('[id]');
      var found = 0;
      for (var k = 0; k < matches.length; k++) {
        if (matches[k].id === ids[j]) { text += ' ' + matches[k].textContent; found++; }
      }
      if (found !== 1) return null;
    }
    return text;
  }
  function htmlSafeControl(el, form) {
    var tokens = (el.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/);
    if (el.type === 'password') return false;
    for (var i = 0; i < tokens.length; i++) {
      if (/^cc-/.test(tokens[i]) || /^(current-password|new-password|one-time-code)$/.test(tokens[i])) return false;
    }
    if (isSensitiveName(el.name) || isSensitiveName(el.id) || isSensitiveName(el.getAttribute('aria-label')) ||
        isSensitiveName(el.getAttribute('placeholder'))) return false;
    var labels = htmlLabelText(el, form);
    return labels !== null && !isSensitiveName(labels);
  }
  function htmlSnapshot(form) { return { userData: {}, formFieldsSeen: [] }; }
  function validHtmlRecord(record) {
    if (!exactKeys(record, 'created,formFieldsSeen,formId,formPath,nonce,origin,returnPath,returnQuery,siteKey,userData,v') ||
        record.v !== 1 || !htmlReady() || record.siteKey !== 'zoho-crm-forms-event-v1' ||
        record.origin !== window.location.origin || window.location.protocol !== 'https:' ||
        typeof record.created !== 'number' || !isFinite(record.created) ||
        Date.now() - record.created < 0 || Date.now() - record.created >= HTML_TTL ||
        !safeText(record.formPath, 2048) || !/^\/(?!\/)/.test(record.formPath) || /[?#\\]/.test(record.formPath) ||
        new URL(record.formPath, record.origin).pathname !== record.formPath ||
        !safePath(record.returnPath) || record.returnPath === record.formPath ||
        (record.returnQuery !== '' && record.returnQuery !== '?converly=zoho-crm') ||
        typeof record.formId !== 'string' || !/^webform[0-9]{1,64}$/.test(record.formId) ||
        typeof record.nonce !== 'string' || !/^[a-f0-9]{32}$/.test(record.nonce) ||
        !plain(record.userData) || !Array.isArray(record.formFieldsSeen) || record.formFieldsSeen.length > 4) return false;
    var names = Object.keys(record.userData);
    if (names.length !== record.formFieldsSeen.length) return false;
    var used = [];
    for (var i = 0; i < record.formFieldsSeen.length; i++) {
      var field = record.formFieldsSeen[i];
      if (!exactKeys(field, 'name,type')) return false;
      var contact = null;
      for (var c = 0; c < HTML_CONTACTS.length; c++) if (HTML_CONTACTS[c][0] === field.name) contact = HTML_CONTACTS[c];
      if (!contact || typeof field.type !== 'string' || !/^(text|email|tel)$/.test(field.type) ||
          used.indexOf(field.name) !== -1) return false;
      used.push(field.name);
      var value = ownData(record.userData, contact[1]);
      if (!safeText(value, contact[3]) || value.trim() !== value ||
          (contact[1] === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) return false;
    }
    return true;
  }
  function makeHtmlNonce() {

    var bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    var value = '';
    for (var i = 0; i < bytes.length; i++) value += ('0' + bytes[i].toString(16)).slice(-2);
    return value;
  }
  function stopHtml(attempt, preserve) {
    if (!attempt || htmlActive !== attempt) return;
    clearTimeout(attempt.after);
    clearTimeout(attempt.expiry);
    clearInterval(attempt.sweep);
    window.removeEventListener('pagehide', attempt.hide, true);
    document.removeEventListener('input', abandonHtml, true);
    document.removeEventListener('change', abandonHtml, true);
    document.removeEventListener('reset', abandonHtml, true);
    document.removeEventListener('click', abandonHtml, true);
    if (attempt.observer) attempt.observer.disconnect();
    htmlActive = null;
    attempt.form = attempt.event = attempt.record = null;
    if (!preserve) removeHtmlPending();
  }
  function unchangedHtml(attempt) {
    if (!htmlConsent() || !htmlReady() || attempt.event.defaultPrevented) return false;
    var identity = htmlIdentity(attempt.form, attempt.event.submitter);
    return identity && identity.action === attempt.identity.action && identity.target === attempt.identity.target &&
      identity.formId === attempt.identity.formId && identity.returnControl === attempt.identity.returnControl &&
      identity.returnPath === attempt.identity.returnPath && identity.returnQuery === attempt.identity.returnQuery &&
      window.location.pathname === attempt.record.formPath && validHtmlRecord(attempt.record);
  }
  function abandonHtml(event) {
    if (!htmlActive) return;
    if (event.type === 'click') {
      if (event.target.closest && event.target.closest('a[href]')) stopHtml(htmlActive);
    } else if (event.target === htmlActive.form || event.target.form === htmlActive.form ||
        htmlActive.form.contains(event.target)) stopHtml(htmlActive);
  }
  function handleHtmlSubmit(event) {
    if (window.top !== window || !event || event.isTrusted !== true) return;
    try {

      stopHtml(htmlActive);
      cancelHtmlWait();
      if (!removeHtmlPending() || !htmlReady() || !htmlConsent() || event.defaultPrevented) return;
      var identity = htmlIdentity(event.target, event.submitter);
      if (!identity) return;
      var created = Date.now();
      var nonce = makeHtmlNonce();
      var snapshot = htmlSnapshot(event.target);
      var record = { v: 1, created: created, siteKey: 'zoho-crm-forms-event-v1', origin: window.location.origin,
        formPath: window.location.pathname, formId: identity.formId, nonce: nonce,
        returnPath: identity.returnPath, returnQuery: identity.returnQuery,
        userData: snapshot.userData, formFieldsSeen: snapshot.formFieldsSeen };
      if (!htmlConsent() || !validHtmlRecord(record)) return;
      var attempt = { form: event.target, event: event, identity: identity, record: record };
      htmlActive = attempt;
      attempt.hide = function(event) {
        try {
          if (event.persisted) { stopHtml(attempt); return; }
          if (!unchangedHtml(attempt)) { stopHtml(attempt); return; }
          var raw = JSON.stringify(attempt.record);
          if (!boundedHtml(raw) || !htmlConsent()) { stopHtml(attempt); return; }
          window.sessionStorage.setItem(HTML_KEY, raw);
          stopHtml(attempt, true);
        } catch (e) { stopHtml(attempt); }
      };
      window.addEventListener('pagehide', attempt.hide, true);
      attempt.after = setTimeout(function() {
        try {
          if (htmlActive !== attempt) return;
          if (!unchangedHtml(attempt)) { stopHtml(attempt); return; }
          var raw = JSON.stringify(attempt.record);
          if (!boundedHtml(raw) || !htmlConsent()) { stopHtml(attempt); return; }
          window.sessionStorage.setItem(HTML_KEY, raw);
        } catch (e) { stopHtml(attempt); }
      }, 0);
      attempt.sweep = setInterval(function() {
        try { if (htmlActive === attempt && !unchangedHtml(attempt)) stopHtml(attempt); }
        catch (e) { stopHtml(attempt); }
      }, 250);
      attempt.expiry = setTimeout(function() { stopHtml(attempt); }, HTML_TTL);
      if (typeof MutationObserver !== 'undefined') {
        attempt.observer = new MutationObserver(function(records) {
          try {
            if (htmlActive !== attempt) return;
            for (var r = 0; r < records.length; r++) {
              var removed = records[r].removedNodes;
              for (var n = 0; removed && n < removed.length; n++) {
                if (removed[n] === attempt.form || (removed[n].contains && removed[n].contains(attempt.form))) {
                  stopHtml(attempt); return;
                }
              }
            }
            if (!unchangedHtml(attempt)) stopHtml(attempt);
          }
          catch (e) { stopHtml(attempt); }
        });
        attempt.observer.observe(document.documentElement, { childList: true, subtree: true,
          attributes: true, attributeFilter: ['action', 'method', 'enctype', 'target', 'formaction', 'formmethod', 'formenctype', 'formtarget', 'id', 'class', 'name', 'value', 'disabled', 'form'] });
      }
      document.addEventListener('input', abandonHtml, true);
      document.addEventListener('change', abandonHtml, true);
      document.addEventListener('reset', abandonHtml, true);
      document.addEventListener('click', abandonHtml, true);
    } catch (e) { stopHtml(htmlActive); removeHtmlPending(); }
  }
  function landingMatches(record) {
    if (window.location.pathname === record.formPath) return false;
    var parts = window.location.search.slice(1).split('&');
    var count = 0;
    for (var i = 0; i < parts.length; i++) {
      var pair = parts[i].split('=');
      var key;
      try { key = decodeURIComponent(pair[0].replace(/\+/g, ' ')); } catch (e) { return false; }
      if (key !== 'converly') continue;
      count++;
      if (pair.length !== 2 || pair[1] !== 'zoho-crm') return false;
    }
    if (count > 1) return false;

    if (record.returnQuery || count) return count === 1 &&
      window.location.pathname === record.returnPath && window.location.search === '?converly=zoho-crm';
    return true;
  }
  function cancelHtmlWait() {
    if (!htmlWait) return;
    clearInterval(htmlWait.sweep);
    clearTimeout(htmlWait.expiry);
    window.removeEventListener('load', htmlWait.load);
    window.removeEventListener('pagehide', cancelHtmlWait, true);
    htmlWait.record = null;
    htmlWait = null;
  }
  function htmlVerdict(record, afterLoad) {
    try {
      if (htmlConsumed || htmlNonce === record.nonce || !htmlConsent() || !validHtmlRecord(record)) return;
      var entries = window.performance.getEntriesByType && window.performance.getEntriesByType('navigation');
      var nav = entries && entries[0];
      if (!nav && !afterLoad && document.readyState !== 'complete') {
        htmlWait = { record: record };
        htmlWait.load = function() {
          var held = htmlWait && htmlWait.record;
          cancelHtmlWait();
          if (held) htmlVerdict(held, true);
        };
        htmlWait.sweep = setInterval(function() {
          if (htmlWait && (!htmlConsent() || !validHtmlRecord(htmlWait.record))) cancelHtmlWait();
        }, 250);
        htmlWait.expiry = setTimeout(cancelHtmlWait, HTML_TTL - (Date.now() - record.created));
        window.addEventListener('load', htmlWait.load);
        window.addEventListener('pagehide', cancelHtmlWait, true);
        return;
      }
      if (!nav || nav.type !== 'navigate' || !landingMatches(record) ||
          ('responseStatus' in nav && nav.responseStatus !== 200) || !htmlConsent() || !htmlReady()) return;
      htmlConsumed = true;
      htmlNonce = record.nonce;
    var output = { event: 'zoho_crm_form_submitted', form_id: record.formId };
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(output);
    } catch (e) {  }
  }
  function processHtmlLanding() {
    if (window.top !== window) return;
    if (!htmlReady() || !htmlConsent()) { removeHtmlPending(); return; }
    try {
      var raw = window.sessionStorage.getItem(HTML_KEY);
      if (!removeHtmlPending() || !raw || !boundedHtml(raw)) return;
      var record = JSON.parse(raw);
      if (validHtmlRecord(record)) htmlVerdict(record, false);
    } catch (e) { removeHtmlPending(); }
  }
  function htmlPageShow(event) {
    if (event.persisted && window.top === window) {
      cancelHtmlWait();
      stopHtml(htmlActive);
      removeHtmlPending();
    }
  }
  function destroyHtml() {
    cancelHtmlWait();
    stopHtml(htmlActive);
    document.removeEventListener('submit', handleHtmlSubmit, true);
    window.removeEventListener('pageshow', htmlPageShow, true);
  }
  processHtmlLanding();
  document.addEventListener('submit', handleHtmlSubmit, true);
  window.addEventListener('pageshow', htmlPageShow, true);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { handleSubmit: handleHtmlSubmit, destroy: destroyHtml, key: HTML_KEY };
  }
})();
