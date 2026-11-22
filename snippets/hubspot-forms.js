/*! HubSpot Forms conversion detection - ConversionKit
 *  https://github.com/ConversionKit/conversion-tracking | https://converly.io
 *  Detects: form submission. Pushes dataLayer event: hubspot_form_submitted
 *  Keep this notice when sharing or installing this snippet. */
(function() {
  'use strict';

  if (window.__converlyRecipeHubspotForms) return;
  window.__converlyRecipeHubspotForms = true;

  var includeIdentity = false;
  window.dataLayer = window.dataLayer || [];

  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var conversions = Object.create(null);
  var carriers = Object.create(null);
  var ownership = Object.create(null);
  var attempts = Object.create(null);
  var pending = [];
  var valueRequests = Object.create(null);
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

  function validId(id) { return typeof id === 'string' && UUID.test(id); }
  function connected(el) {
    return !!(el && el.nodeType === 1 && el.ownerDocument === document && document.documentElement.contains(el));
  }
  function frameTarget(el) {
    if (!connected(el)) return false;
    while (el && el.nodeType === 1) {
      if (el.tagName === 'DIV' && el.classList.contains('hs-form-frame')) return true;
      el = el.parentElement;
    }
    return false;
  }

  function reserve(formId, conversionId) {
    var key = conversionId.toLowerCase();
    if (conversions[key]) return null;
    var record = { state: 'reserved', formId: formId, conversionId: conversionId,
      timer: null };
    conversions[key] = record;
    return record;
  }
  function addField(result, name, source, key, isNew) {
    if (typeof name !== 'string' || isSensitiveName(name)) return;
    result.formFieldsSeen.push({ name: name, type: '' });
    var property = name;
    if (isNew) {
      if (name.indexOf('0-1/') !== 0) return;
      property = name.slice(4);
    }
    var category = property === 'email' ? 'email' : property === 'firstname' ? 'firstName' :
      property === 'lastname' ? 'lastName' : property === 'phone' || property === 'mobilephone' ? 'phone' : '';
    if (!category) return;
    var value = source[key];
    if (typeof value === 'string' && value.trim() && !result.userData[category]) result.userData[category] = value.trim();
  }

  function mapValues(values, isNew) {
    var result = { userData: {}, formFieldsSeen: [] };
    if (isNew) {
      if (!Array.isArray(values)) return result;
      for (var i = 0; i < values.length; i++) {
        var item = values[i];
        if (item && typeof item === 'object') addField(result, item.name, item, 'value', true);
      }
    } else if (values && typeof values === 'object' && !Array.isArray(values)) {
      for (var name in values) {
        if (Object.prototype.hasOwnProperty.call(values, name)) addField(result, name, values, name, false);
      }
    }
    return result;
  }

  function clearPending(record) {
    if (record.timer !== null) window.clearTimeout(record.timer);
    var index = pending.indexOf(record);
    if (index !== -1) pending.splice(index, 1);
    if (!pending.length) window.removeEventListener('pagehide', onPageHide, false);
  }

  function handoff(record, values, isNew) {
    if (record.state !== 'reserved') return;
    record.state = 'discarded';
    clearPending(record);
    var mapped;
    try {
      if (record.instance && (record.ambiguous || record.instance.getConversionId() !== record.conversionId)) values = null;
    } catch (e) { values = null; }
    try { mapped = includeIdentity ? mapValues(values, isNew).userData : {}; }
    catch (e) { mapped = {}; }
    record.state = 'consumed';
    var payload = { event: 'hubspot_form_submitted', form_id: record.formId };
    if (mapped.email) payload.email = mapped.email;
    if (mapped.firstName) payload.first_name = mapped.firstName;
    if (mapped.lastName) payload.last_name = mapped.lastName;
    if (mapped.phone) payload.phone = mapped.phone;
    try { window.dataLayer.push(payload); } catch (e) {}
  }

  function onPageHide() {
    var waiting = pending.slice();
    for (var i = 0; i < waiting.length; i++) handoff(waiting[i], null, true);
  }

  function handleNewEditor(event) {
    try {
      if (!frameTarget(event.target)) return;
      var detail = event.detail;
      if (!detail || !validId(detail.formId) || typeof detail.instanceId !== 'string' || !detail.instanceId) return;
      if (event.type === 'hs-form-event:on-ready') {
        if (!carriers[detail.instanceId]) carriers[detail.instanceId] = event.target;
        return;
      }
      var api = window.HubSpotFormsV4 || window.HubspotFormsV4;
      if (!api || typeof api.getFormFromEvent !== 'function') return;
      var inst = api.getFormFromEvent(event);
      if (!inst || typeof inst.getFormId !== 'function' || typeof inst.getInstanceId !== 'function' ||
          typeof inst.getConversionId !== 'function' || typeof inst.getFormFieldValues !== 'function') return;
      if (inst.getFormId() !== detail.formId || inst.getInstanceId() !== detail.instanceId) return;
      if (carriers[detail.instanceId] && carriers[detail.instanceId] !== event.target) return;
      var conversionId = inst.getConversionId();
      if (!validId(conversionId)) return;
      var record = reserve(detail.formId, conversionId);
      if (!record) return;
      if (!includeIdentity) { handoff(record, null, true); return; }
      // Keep contact values out when an instance has overlapping answers.
      if (valueRequests[detail.instanceId]) {
        valueRequests[detail.instanceId].ambiguous = true;
        handoff(record, null, true);
        return;
      }
      record.instance = inst;
      valueRequests[detail.instanceId] = record;
      function settle(values) {
        delete valueRequests[detail.instanceId];
        handoff(record, values, true);
      }
      if (!pending.length) window.addEventListener('pagehide', onPageHide, false);
      pending.push(record);
      record.timer = window.setTimeout(function() { handoff(record, null, true); }, 1500);
      try {
        Promise.resolve(inst.getFormFieldValues()).then(function(values) {
          settle(values);
        }, function() { settle(null); });
      } catch (e) { settle(null); }
    } catch (e) {}
  }

  function recordOwnership(formId) {
    var key = formId.toLowerCase();
    var saved = ownership[key] || (ownership[key] = []);
    function remember(form, container) {
      if (!form || !connected(container)) return;
      for (var i = 0; i < saved.length; i++) if (saved[i].container === container) return;
      saved.push({ formGuid: formId, container: container, instanceId: form.getAttribute('data-instance-id') || '' });
    }
    var frames = document.querySelectorAll('iframe[id^="hs-form-iframe-"]');
    for (var i = 0; i < frames.length; i++) {
      try { remember(frames[i].contentDocument.getElementById('hsForm_' + formId), frames[i]); }
      catch (e) { /* Not an accessible legacy frame. */ }
    }
    var forms = document.querySelectorAll('form[id="hsForm_' + formId + '"]');
    for (var j = 0; j < forms.length; j++) {
      var container = forms[j].parentElement;
      while (container && !container.classList.contains('hbspt-form')) container = container.parentElement;
      remember(forms[j], container);
    }
  }

  function hasOwnership(key) {
    var saved = ownership[key] || [];
    for (var i = 0; i < saved.length; i++) if (connected(saved[i].container)) return true;
    return false;
  }

  function handleLegacy(event) {
    if (event.source !== window || !event.origin || event.origin === 'null' || event.origin !== window.location.origin) return;
    var data = event.data;
    if (!data || typeof data !== 'object' || data.type !== 'hsFormCallback') return;
    try {
      if (data.eventName === 'onFormReady' || data.eventName === 'onFormSubmit') {
        if (!validId(data.id)) return;
        recordOwnership(data.id);
        var key = data.id.toLowerCase();
        if (data.eventName === 'onFormSubmit' && hasOwnership(key)) {
          var queue = attempts[key] || (attempts[key] = []);
          while (queue.length && Date.now() - queue[0] > 60000) queue.shift();
          queue.push(Date.now());
        }
        return;
      }
      if (data.eventName !== 'onFormSubmitted') return;
      var accepted = data.data;
      if (!accepted || typeof accepted !== 'object' || Array.isArray(accepted) ||
          !validId(accepted.formGuid) || !validId(accepted.conversionId)) return;
      if (conversions[accepted.conversionId.toLowerCase()]) return;
      var formKey = accepted.formGuid.toLowerCase();
      var waiting = attempts[formKey] || [];
      while (waiting.length && Date.now() - waiting[0] > 60000) waiting.shift();
      if (!hasOwnership(formKey) || !waiting.length) return;
      waiting.shift();
      var record = reserve(accepted.formGuid, accepted.conversionId);
      handoff(record, includeIdentity ? accepted.submissionValues : null, false);
    } catch (e) {}
  }

  document.addEventListener('hs-form-event:on-ready', handleNewEditor, true);
  document.addEventListener('hs-form-event:on-submission:success', handleNewEditor, true);
  window.addEventListener('message', handleLegacy, false);
})();
