/*! Fillout Forms conversion detection - ConversionKit
 *  https://github.com/ConversionKit/conversion-tracking | https://converly.io
 *  Detects: form submission. Pushes dataLayer event: fillout_form_submitted
 *  Keep this notice when sharing or installing this snippet. */
/* Fillout Form Listener by Converly. Pushes only event and form metadata. */
(function() {
  'use strict';

  window.dataLayer = window.dataLayer || [];
  var sink = {
    siteKey: 'gtm-pack-fillout-event-only',
    advertisingAllowed: function () { return true; },
    onSubmission: function (payload) {
      var context = payload.submissionContext || {};
      var push = { event: 'fillout_form_submitted', form_id: context.form_id || null };
      window.dataLayer.push(push);
    }
  };

  if (typeof window === 'undefined' || window.__converlyRecipeFillout) return;
  window.__converlyRecipeFillout = true;

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
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    var proto = Object.getPrototypeOf(value);

    return proto === Object.prototype || proto === null;
  }

  function extractAnswers() { return { userData: {}, formFieldsSeen: [] }; }

  var ORIGIN = 'https://embed.fillout.com';
  function frameUrl(frame) {
    try {
      var src = frame.getAttribute('src');
      if (!src) return null;
      var url = new URL(src, document.baseURI);
      if (url.username || url.password || url.origin !== ORIGIN) return null;
      return url;
    } catch (e) { return null; }
  }

  var frames = [];
  var trackerStarted = false;
  function scan() {
    frames = [];
    var candidates = document.querySelectorAll('iframe');
    for (var i = 0; i < candidates.length; i++) {
      if (frameUrl(candidates[i])) frames.push(candidates[i]);
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
  function boundUrl(source) {
    for (var i = 0; i < frames.length; i++) {
      try {
        if (document.documentElement.contains(frames[i]) && frames[i].contentWindow === source) {
          var url = frameUrl(frames[i]);
          if (url) return url;
        }
      } catch (e) {  }
    }
    return null;
  }

  var seen = Object.create(null);
  function handleMessage(event) {
    try {
      if (!event || !event.source || event.source === window || event.isTrusted !== true) return;
      if (event.origin !== ORIGIN || !consentAllows()) return;
      var message = event.data;
      if (!object(message) || message.type !== 'form_submit' ||
          typeof message.submissionUuid !== 'string' || !message.submissionUuid.trim() ||
          !Array.isArray(message.questions)) return;
      var url = boundUrl(event.source);
      if (!url) return;
      var loader = sink;
      if (!loader || typeof loader.onSubmission !== 'function' || !consentAllows()) return;
      var id = message.submissionUuid;
      if (Object.prototype.hasOwnProperty.call(seen, id)) return;

      var match = /^\/t\/([a-zA-Z0-9_-]+)\/?$/.exec(url.pathname);
      var context = match ? { form_id: match[1] } : {};
      var extracted = extractAnswers(message.questions);
      if (!consentAllows()) return;
      seen[id] = true;
      loader.onSubmission({
        trigger: 'fillout-forms', pageUrl: window.location.pathname,
        userData: extracted.userData, formFieldsSeen: extracted.formFieldsSeen,
        submissionContext: context
      });
    } catch (e) {  }
  }

  window.addEventListener('message', handleMessage, false);
  startTracker();
  if (!trackerStarted) document.addEventListener('DOMContentLoaded', startTracker, false);

})();
