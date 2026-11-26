/*! OptinMonster conversion detection - ConversionKit
 *  https://github.com/ConversionKit/conversion-tracking | https://converly.io
 *  Detects: form submission. Pushes dataLayer event: optinmonster_form_submitted
 *  Keep this notice when sharing or installing this snippet. */
/* OptinMonster Listener by Converly. Sends only the event and Campaign ID. */
(function() {
  'use strict';

  if (window.__converlyRecipeOptinMonsterArmed || typeof WeakMap !== 'function') return;
  var ATTEMPT = 'om.Optin.init.submit';
  var SUCCESS = 'om.Optin.success';
  var ERROR = 'om.Optin.error';
  var WINDOW_MS = 60000;
  var KEYS = ['email', 'name', 'first_name', 'fname', 'last_name', 'lname', 'phone'];
  var seenEvents = new WeakMap();
  var pending = [];
  var sequence = 0;
  var hiding = false;

  function allowed() { return true; }

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
        if (SENSITIVE_AUTOCOMPLETE[tokens[t]] === true || tokens[t].indexOf('cc-') === 0) return true;
      }
    }
    if (isSensitiveName(name)) return true;
    return false;
  }

  function labelTextFor(el) {
    var text = '';
    var wrap = el.closest('label');
    if (wrap) text += ' ' + wrap.textContent;
    var doc = el.ownerDocument;
    var id = el.getAttribute('id');
    var labels = doc.getElementsByTagName('label');
    for (var i = 0; id && i < labels.length; i++) {
      if (labels[i].getAttribute('for') === id) text += ' ' + labels[i].textContent;
    }
    var ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/);
    var nodes = doc.querySelectorAll('[id]');
    for (var k = 0; k < nodes.length; k++) {
      if (ids.indexOf(nodes[k].getAttribute('id')) !== -1) text += ' ' + nodes[k].textContent;
    }
    return text;
  }

  function object(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function dataProperty(objectValue, key) {
    var descriptor = Object.getOwnPropertyDescriptor(objectValue, key);
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor : null;
  }

  function own(value, key) {
    if (!object(value)) return null;
    return dataProperty(value, key);
  }

  function ownObject(value, key) {
    var property = own(value, key);
    return property && object(property.value) ? property.value : null;
  }

  function owner(detail) {
    var campaign = ownObject(detail, 'Campaign');
    var id = own(campaign, 'id');
    var view = own(campaign, 'viewDiv');
    if (!id || typeof id.value !== 'string' || !/^[a-z0-9]{10,32}$/.test(id.value) ||
        !view || !(view.value instanceof window.Element)) return null;
    return { id: id.value, view: view.value };
  }

  function connected(key) {
    return key.view.ownerDocument === document && document.documentElement.contains(key.view) &&
      key.view.id === 'om-' + key.id + '-optin' && document.getElementById(key.view.id) === key.view;
  }

  function current(record) {
    var age = Date.now() - record.lastEvent;
    return age >= 0 && (record.ambiguous ? age < WINDOW_MS : age <= WINDOW_MS) &&
      record.path === window.location.pathname && connected(record);
  }

  function erase(record) {
    if (!record) return;
    record.snapshot = null;
    record.index = null;
    record.view = null;
  }

  function remove(record) {
    var index = pending.indexOf(record);
    if (index !== -1) pending.splice(index, 1);
    if (record) window.clearTimeout(record.timer);
    if (!pending.length && hiding) {
      window.removeEventListener('pagehide', clear, false);
      hiding = false;
    }
  }

  function discard(record) { remove(record); erase(record); }
  function clear() { while (pending.length) discard(pending[0]); }
  function prune() {
    for (var i = pending.length - 1; i >= 0; i--) {
      if (!current(pending[i])) discard(pending[i]);
    }
  }
  function find(key) {
    for (var i = 0; i < pending.length; i++) {
      if (pending[i].id === key.id && pending[i].view === key.view) return pending[i];
    }
    return null;
  }

  function fresh(event) {
    if (event.target !== document || seenEvents.has(event)) return false;
    seenEvents.set(event, true);
    return true;
  }

  function visible(el, view) {
    for (var node = el; node && node.nodeType === 1; node = node.parentElement) {
      var style = window.getComputedStyle(node);
      if (node.hidden || style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return view.contains(el);
  }

  function metadata(view) {
    var index = Object.create(null);
    var controls = view.querySelectorAll('input,select,textarea,button');
    for (var i = 0; i < controls.length; i++) {
      var el = controls[i];
      var name = el.getAttribute('name') || '';
      if (KEYS.indexOf(name) === -1) continue;
      var type = (el.getAttribute('type') || el.type || 'text').toLowerCase();
      var id = el.getAttribute('id') || '';
      var sensitive = isSensitiveField(type, (el.getAttribute('autocomplete') || '').toLowerCase(), name) ||
        isSensitiveName(id) || isSensitiveName(el.getAttribute('aria-label')) ||
        isSensitiveName(el.getAttribute('placeholder')) || isSensitiveName(labelTextFor(el));
      var eligible = !sensitive && el.tagName === 'INPUT' && /^(text|email|tel)$/.test(type) &&
        !el.disabled && !el.matches(':disabled') && visible(el, view);
      var entry = index[name] || { blocked: false, controls: [] };
      entry.blocked = entry.blocked || !eligible;
      if (eligible) entry.controls.push({ el: el, id: id, name: name, type: type });
      index[name] = entry;
    }
    return index;
  }

  function sameControls(before, after) {
    if (!before || !after || before.blocked || after.blocked ||
        before.controls.length !== after.controls.length) return false;
    for (var i = 0; i < before.controls.length; i++) {
      var a = before.controls[i], b = after.controls[i];
      if (a.el !== b.el || a.id !== b.id || a.name !== b.name || a.type !== b.type) return false;
    }
    return true;
  }

  function fieldsFor(detail) {
    return ownObject(ownObject(ownObject(detail, 'Optin'), 'data'), 'fields');
  }

  function explicitNames(index) {

    return !!(index.first_name || index.fname || index.last_name || index.lname);
  }

  function capture(index, fields) {
    var snapshot = Object.create(null);
    for (var i = 0; i < KEYS.length; i++) {
      var key = KEYS[i], entry = index[key];
      if (!entry || entry.blocked) continue;
      if (!allowed()) return null;
      var property = own(fields, key);
      if (property && typeof property.value === 'string') snapshot[key] = property.value;
    }
    return snapshot;
  }

  function release(record, fields) {
    var index = metadata(record.view), values = Object.create(null), seen = [];
    if (!allowed()) return null;
    for (var i = 0; i < KEYS.length; i++) {
      var key = KEYS[i];
      if (!Object.prototype.hasOwnProperty.call(record.snapshot, key) ||
          !sameControls(record.index[key], index[key])) continue;
      if (!allowed()) return null;
      var property = own(fields, key);
      if (!property || typeof property.value !== 'string' || property.value !== record.snapshot[key]) return null;
      values[key] = record.snapshot[key].trim();
      for (var j = 0; j < record.index[key].controls.length; j++) {
        var control = record.index[key].controls[j];
        seen.push({ name: control.name, type: control.type });
      }
    }
    var userData = {};
    if (values.email) userData.email = values.email;
    if (values.phone) userData.phone = values.phone;
    var first = alias(values, 'first_name', 'fname', record, index);
    var last = alias(values, 'last_name', 'lname', record, index);
    if (first) userData.firstName = first;
    if (last) userData.lastName = last;
    if (!record.explicitNames && !explicitNames(index) && values.name) {
      var parts = values.name.split(/\s+/);
      userData.firstName = parts[0];
      if (parts.length > 1) userData.lastName = parts.slice(1).join(' ');
    }
    return { trigger: 'optinmonster', pageUrl: record.path, userData: userData,
      formFieldsSeen: seen, submissionContext: { form_id: record.id, form_name: '' } };
  }

  function alias(values, a, b, record, index) {

    var keys = [a, b];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if ((record.index[key] || index[key]) && !sameControls(record.index[key], index[key])) return '';
    }
    if (Object.prototype.hasOwnProperty.call(record.snapshot, a) &&
        Object.prototype.hasOwnProperty.call(record.snapshot, b) &&
        record.snapshot[a].trim() !== record.snapshot[b].trim()) return '';
    if (Object.prototype.hasOwnProperty.call(values, a) && Object.prototype.hasOwnProperty.call(values, b) &&
        values[a] !== values[b]) return '';
    return values[a] || values[b] || '';
  }

  function scheduleExpiry(record) {

    window.clearTimeout(record.timer);
    var token = record.sequence = ++sequence;
    record.timer = window.setTimeout(function() {
      if (record.sequence === token && pending.indexOf(record) !== -1) discard(record);
    }, WINDOW_MS + (record.ambiguous ? 0 : 1));
  }

  function attempt(event) {
    var record = null;
    try {
      if (!fresh(event)) return;
      prune();
      var key = owner(event.detail);
      if (!key || !connected(key)) return;
      record = find(key);
      var path = window.location.pathname, started = Date.now();
      if (!allowed()) { discard(record); return; }
      var fields = fieldsFor(event.detail);
      if (!fields) return;
      if (record) {
        record.outstanding++;
        record.ambiguous = true;
        record.snapshot = null;
        record.index = null;
        record.lastEvent = started;
        scheduleExpiry(record);
        return;
      }
      var index = metadata(key.view);

      if (!allowed()) return;
      record = { id: key.id, view: key.view, path: path,
        lastEvent: started, outstanding: 1, ambiguous: false, index: index,
        explicitNames: explicitNames(index), snapshot: capture(index, fields), timer: null };
      if (!record.snapshot || !allowed() || !current(record)) { erase(record); return; }
      pending.push(record);
      scheduleExpiry(record);
      if (!hiding) { window.addEventListener('pagehide', clear, false); hiding = true; }
    } catch (e) { discard(record); }
  }

  function terminal(event) {
    var record = null;
    try {
      if (!fresh(event)) return;
      prune();
      var key = owner(event.detail);
      if (!key) return;
      record = find(key);
      if (!record) return;
      record.outstanding--;
      if (record.ambiguous && record.outstanding > 0) {
        record.lastEvent = Date.now();
        scheduleExpiry(record);
        record = null;
        return;
      }
      remove(record);
      if (record.ambiguous || event.type === ERROR || !current(record) || !allowed()) return;
      var response = ownObject(event.detail, 'response');
      var success = own(response, 'success');
      if (!success || success.value !== true) return;
      var optin = ownObject(event.detail, 'Optin');
      var spam = own(optin, 'spam');
      if (spam && spam.value === true) return;
      var fields = fieldsFor(event.detail);
      if (!fields || !allowed()) return;
      var payload = release(record, fields);
      if (!payload || !current(record) || !allowed()) return;
      erase(record);
      var push = { event: 'optinmonster_form_submitted', form_id: payload.submissionContext.form_id };
      (window.dataLayer = window.dataLayer || []).push(push);
    } catch (e) {

    } finally { erase(record); }
  }

  window.__converlyRecipeOptinMonsterArmed = true;
  document.addEventListener(ATTEMPT, attempt, true);
  document.addEventListener(SUCCESS, terminal, true);
  document.addEventListener(ERROR, terminal, true);
  window.__converlyRecipeOptinMonsterReady = true;
})();
