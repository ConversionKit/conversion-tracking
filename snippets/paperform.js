/*! Paperform conversion detection - ConversionKit
 *  https://github.com/ConversionKit/conversion-tracking | https://converly.io
 *  Detects: form submission. Pushes dataLayer event: paperform_form_submitted
 *  Keep this notice when sharing or installing this snippet. */
/* Paperform Form Listener by Converly. Pushes only event and form metadata. */
(function() {
  'use strict';

  window.dataLayer = window.dataLayer || [];
  var sink = {
    siteKey: 'gtm-pack-paperform-event-only',
    advertisingAllowed: function () { return true; },
    onSubmission: function (payload) {
      var context = payload.submissionContext || {};
      var push = { event: 'paperform_form_submitted', form_id: context.form_id || null };
      window.dataLayer.push(push);
    }
  };

  if (typeof window === 'undefined' || window.__converlyRecipePaperform) return;
  window.__converlyRecipePaperform = true;

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

  function object(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function extractAnswers() { return { userData: {}, formFieldsSeen: [] }; }

  var HOST = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.paperform\.co$/;
  function originSlug(origin) {
    if (typeof origin !== 'string') return null;
    try {
      var url = new URL(origin);
      if (url.protocol !== 'https:' || url.origin !== origin) return null;
      var match = HOST.exec(url.hostname);
      return match && !url.port ? match[1] : null;
    } catch (e) { return null; }
  }

  function frameOrigin(frame) {
    try {
      var src = frame.getAttribute('src');
      if (!src) return null;
      var url = new URL(src, document.baseURI);
      if (url.username || url.password || !originSlug(url.origin)) return null;
      return url.origin;
    } catch (e) { return null; }
  }

  var frames = [];
  var trackerStarted = false;

  function scan() {
    frames = [];
    var candidates = document.querySelectorAll('iframe');
    for (var i = 0; i < candidates.length; i++) {
      if (frameOrigin(candidates[i])) frames.push(candidates[i]);
    }
  }
  function startTracker() {
    if (trackerStarted || !document.documentElement) return;
    trackerStarted = true;
    scan();
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(scan).observe(document.documentElement, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['src']
      });
    }
  }
  function boundSource(source, origin) {
    for (var i = 0; i < frames.length; i++) {
      try {
        if (document.documentElement.contains(frames[i]) &&
            frames[i].contentWindow === source && frameOrigin(frames[i]) === origin) return true;
      } catch (e) {  }
    }
    return false;
  }

  var seen = Object.create(null);
  function handleMessage(event) {
    try {
      if (!event || !event.source || event.source === window || event.isTrusted !== true) return;
      var slug = originSlug(event.origin);
      if (!slug || !consentAllows()) return;
      var raw = event.data;
      if (typeof raw !== 'string' || raw.indexOf('paperform:') !== 0) return;
      var message = JSON.parse(raw.slice(10));
      if (!object(message) || message.action !== 'submission' || !object(message.details) ||
          typeof message.details.submission_id !== 'string' || !message.details.submission_id.trim() ||
          !Array.isArray(message.details.data) || message.id !== slug) return;
      if (!boundSource(event.source, event.origin)) return;
      var loader = sink;
      if (!loader || typeof loader.onSubmission !== 'function' || !consentAllows()) return;
      var id = message.details.submission_id;
      if (Object.prototype.hasOwnProperty.call(seen, id)) return;
      var extracted = extractAnswers(message.details.data);
      if (!consentAllows()) return;
      seen[id] = true;
      loader.onSubmission({
        trigger: 'paperform',
        pageUrl: window.location.pathname,
        userData: extracted.userData,
        formFieldsSeen: extracted.formFieldsSeen,
        submissionContext: { form_id: slug }
      });
    } catch (e) {  }
  }

  window.addEventListener('message', handleMessage, false);
  startTracker();
  if (!trackerStarted) document.addEventListener('DOMContentLoaded', startTracker, false);

})();
