/*! Formsite conversion detection - ConversionKit
 *  https://github.com/ConversionKit/conversion-tracking | https://converly.io
 *  Detects: form submission. Pushes dataLayer event: formsite_form_submitted
 *  Keep this notice when sharing or installing this snippet. */
/* Formsite Form Listener by Converly. Pushes only event and form metadata. */
(function() {
  'use strict';

  window.dataLayer = window.dataLayer || [];
  var sink = {
    siteKey: 'gtm-pack-formsite-event-only',
    advertisingAllowed: function () { return true; },
    onSubmission: function (payload) {
      var context = payload.submissionContext || {};
      var push = { event: 'formsite_form_submitted', form_name: context.form_id || null };
      window.dataLayer.push(push);
    }
  };

  var CONTACT_KEYS = {
    fs_email: 'email', fs_first: 'firstName', fs_last: 'lastName',
    fs_name: 'name', fs_phone: 'phone'
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

  function decode(value) {
    try { return decodeURIComponent(value.replace(/\+/g, ' ')); }
    catch (e) { return null; }
  }

  function consentAllows() {
    try {

      var c = sink;
      return !(c && typeof c.advertisingAllowed === 'function' && c.advertisingAllowed() === false);
    } catch (e) { return true; }
  }

  function formKey() {
    var parts = window.location.search.slice(1).split('&');
    var count = 0;
    var key = null;
    for (var i = 0; i < parts.length; i++) {
      var equals = parts[i].indexOf('=');
      if (decode(equals < 0 ? parts[i] : parts[i].slice(0, equals)) !== 'formsite_form') continue;
      count++;
      key = equals < 0 ? null : decode(parts[i].slice(equals + 1));
    }
    return count === 1 && key && /^[a-z][a-z0-9_-]{0,63}$/.test(key) &&
      key !== 'null' && !isSensitiveName(key) ? key : null;
  }

  function validArrival(afterLoad) {
    try {
      if (window.top !== window.self) return false;
      var referrer = document.referrer;
      if (!/^https:\/\/fs[0-9]+\.formsite\.com\//.test(referrer)) return false;
      var parsed = new URL(referrer);
      if (parsed.protocol !== 'https:' || !/^fs[0-9]+\.formsite\.com$/.test(parsed.hostname) ||
          parsed.username || parsed.password || parsed.port) return false;
      var navigation = window.performance.getEntriesByType('navigation');
      if (!(navigation && navigation[0]) && !afterLoad && document.readyState !== 'complete') return null;
      return !!(navigation && navigation[0] && navigation[0].type === 'navigate');
    } catch (e) { return false; }
  }

  function cleanFragment(capture) {
    var parts = window.location.hash.slice(1).split('&');
    var kept = [];
    var selected = {};
    var seen = {};
    var changed = false;
    for (var i = 0; i < parts.length; i++) {
      var equals = parts[i].indexOf('=');
      var key = decode(equals < 0 ? parts[i] : parts[i].slice(0, equals));
      if (!Object.prototype.hasOwnProperty.call(CONTACT_KEYS, key)) {
        kept.push(parts[i]);
        continue;
      }
      changed = true;
      if (!capture || isSensitiveName(key)) continue;
      if (seen[key]) {
        delete selected[key];
      } else if (equals >= 0) {
        selected[key] = parts[i].slice(equals + 1);
      }
      seen[key] = true;
    }
    if (changed) {
      window.history.replaceState(window.history.state, '',
        window.location.pathname + window.location.search + (kept.length ? '#' + kept.join('&') : ''));
    }
    return selected;
  }

  function contactValue(key, raw) {
    var max = key === 'fs_email' ? 254 : key === 'fs_phone' ? 64 : 200;
    if (raw.length > max * 12) return null;
    var value = decode(raw);
    if (!value || /[\x00-\x1f\x7f-\x9f]/.test(value) || /\[pipe:/i.test(value)) return null;
    value = value.replace(/^\s+|\s+$/g, '');
    if (!value || value.length > max) return null;
    if (key === 'fs_email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
    if (key === 'fs_phone') {
      var digits = value.replace(/\D/g, '');
      if (!/^\+?[0-9\s().-]+$/.test(value) || digits.length < 7 || digits.length > 15) return null;
    }
    return value;
  }

  function submitSelected(c, key, selected) {
    if (!consentAllows()) return;
    var userData = {};
    var fields = [];
    var fullName = null;
    for (var name in selected) {
      if (!Object.prototype.hasOwnProperty.call(selected, name)) continue;
      var value = contactValue(name, selected[name]);
      if (!value) continue;
      if (name === 'fs_name') fullName = value;
      else userData[CONTACT_KEYS[name]] = value;
      fields.push({ name: name, type: name === 'fs_email' ? 'email' : name === 'fs_phone' ? 'tel' : 'text' });
    }
    if (fullName && !userData.firstName && !userData.lastName) {
      var names = fullName.split(/\s+/);
      userData.firstName = names.shift();
      if (names.length) userData.lastName = names.join(' ');
    }
    if (!consentAllows()) return;
    try {
      c.onSubmission({ trigger: 'formsite', pageUrl: window.location.pathname,
        userData: userData, formFieldsSeen: fields, submissionContext: { form_id: key } });
    } catch (e) {  }
  }

  function waitForArrival(c, key, selected) {
    function cancel() {
      selected = null;
      window.clearInterval(sweep);
      window.removeEventListener('load', onLoad);
      window.removeEventListener('pagehide', cancel, true);
    }
    function onLoad() {
      var values = selected;
      cancel(); // Consume before validation or handoff, including failed checks.
      if (!values || !consentAllows() || formKey() !== key || validArrival(true) !== true) return;
      submitSelected(c, key, values);
    }
    var sweep = window.setInterval(function() {
      if (!consentAllows()) cancel();
    }, 250);
    window.addEventListener('load', onLoad);
    window.addEventListener('pagehide', cancel, true);
  }

  function init() {
    var already = window.__converlyRecipeFormsite;
    window.__converlyRecipeFormsite = true;
    var c = sink;
    var key = null;
    var arrival = false;
    var capture = false;
    try {
      key = formKey();
      capture = !already && !!(c && typeof c.onSubmission === 'function') &&
        !!key && (arrival = validArrival()) !== false && consentAllows();
    } catch (e) { capture = false; }

    var selected;
    try { selected = cleanFragment(false); }
    catch (e) { return; } // Never send while contact pipes remain in the address.
    if (!capture) return;
    if (arrival === null) {
      if (consentAllows()) waitForArrival(c, key, selected);
      return;
    }
    submitSelected(c, key, selected);
  }

  init();
})();
