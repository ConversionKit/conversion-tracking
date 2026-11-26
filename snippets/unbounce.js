/*! Unbounce conversion detection - ConversionKit
 *  https://github.com/ConversionKit/conversion-tracking | https://converly.io
 *  Detects: form submission. Pushes dataLayer event: unbounce_form_submitted
 *  Keep this notice when sharing or installing this snippet. */
/* Unbounce Form Listener by Converly. Pushes only event and form metadata. */
(function() {
  'use strict';

  window.dataLayer = window.dataLayer || [];
  var sink = {
    siteKey: 'gtm-pack-unbounce-event-only',
    advertisingAllowed: function () { return true; },
    onSubmission: function (payload) {
      var context = payload.submissionContext || {};
      var push = { event: 'unbounce_form_submitted', page_id: context.page_id, page_variant: context.page_variant, form_id: context.form_id };
      window.dataLayer.push(push);
    }
  };

  if (window.__converlyRecipeUnbounce) return;
  window.__converlyRecipeUnbounce = true;

  var active = false;
  var contexts = [];
  var frames = [];
  var discoveryTimer = null;
  var identityTimer = null;
  var observer = null;
  var waiting = false;
  var mainDiscoveryUntil = 0;
  var UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  var TOKEN = /^[a-zA-Z0-9_-]{1,32}$/;

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
      if (SENSITIVE_AUTOCOMPLETE[tokens[t]] === true || tokens[t].indexOf('cc-') === 0) return true;
    }
    return isSensitiveName(name);
  }

  function labelTextFor(el, form) {
    var document = el.ownerDocument;
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
    var type = (el.getAttribute('type') || el.type || 'text').toLowerCase();
    var name = el.getAttribute('name') || '';
    if (!/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) || el.form !== form || el.disabled ||
        /^(hidden|password|file|submit|button|reset|image)$/.test(type) ||
        !visible(el) || !safeControl(el, form)) return null;
    var norm = name.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (/^(pageid|pagevariant|honeypot|bottrap|captcha|recaptcha|g-recaptcha-response)$/.test(norm)) return null;
    var key = '', priority = 0;
    if (el.tagName === 'INPUT') {
      if (type === 'email') { key = 'email'; priority = 2; }
      else if (type === 'tel') { key = 'phone'; priority = 2; }
      else if (type === 'text') {
        priority = 1;
        if (/^(email|emailaddress|workemail)$/.test(norm)) key = 'email';
        else if (/^(phone|phonenumber|telephone|mobile|mobilenumber|workphone)$/.test(norm)) key = 'phone';
        else if (/^(firstname|first|fname|givenname)$/.test(norm)) key = 'firstName';
        else if (/^(lastname|last|lname|surname|familyname)$/.test(norm)) key = 'lastName';
        else if (/^(name|fullname|yourname)$/.test(norm)) key = 'fullName';
      }
    }
    return { name: name, type: type, key: key, priority: priority };
  }

  function snapshot() { return []; }

  function release(record) {
    var seen = [], choices = {}, data = {};
    for (var i = 0; i < record.fields.length; i++) {
      var saved = record.fields[i], el = saved.el;
      var meta = el.ownerDocument === record.ctx.doc && record.form.contains(el) ? fieldMeta(el, record.form) : null;
      var safe = !!(meta && meta.name === saved.name && meta.type === saved.type && meta.key === saved.key);
      if (safe && saved.name) seen.push({ name: saved.name, type: saved.type });
      if (!saved.key || !saved.value) continue;

      var choice = choices[saved.key];
      if (!choice || saved.priority > choice.priority) {
        choices[saved.key] = { value: saved.value, priority: saved.priority, conflict: false, safe: safe };
      } else if (saved.priority === choice.priority) {
        if (saved.value !== choice.value) choice.conflict = true;
        if (!safe) choice.safe = false;
      }
    }
    var keys = ['email', 'phone', 'firstName', 'lastName'];
    for (var k = 0; k < keys.length; k++) {
      var item = choices[keys[k]];
      if (item && item.safe && !item.conflict) data[keys[k]] = item.value;
    }
    var full = choices.fullName;
    if (!choices.firstName && !choices.lastName && full && full.safe && !full.conflict) {
      var parts = full.value.split(/\s+/);
      data.firstName = parts.shift();
      if (parts.length) data.lastName = parts.join(' ');
    }
    return { userData: data, formFieldsSeen: seen };
  }

  function mainPage() {
    var page = window.ub && window.ub.page;
    if (!page || page.isAiBuilderPage !== true || page.usedAs !== 'main' ||
        typeof page.id !== 'string' || !UUID.test(page.id) ||
        typeof page.variantId !== 'string' || !TOKEN.test(page.variantId) ||
        /[\r\n]/.test(page.id + page.variantId) || window.location.protocol !== 'https:') return null;
    return page;
  }

  function owned(win, frame) {
    try {
      var main = mainPage(), page = win.ub && win.ub.page;
      if (!main || !page || page.isAiBuilderPage !== true) return false;
      if (!frame) return win === window && page === main;
      if (!window.document.documentElement.contains(frame) || frame.contentWindow !== win ||
          win.parent !== window || win.location.origin !== window.location.origin ||
          page.usedAs !== 'lightbox' || page.variantId !== main.variantId ||
          typeof page.id !== 'string' || page.id.indexOf(main.id + ':') !== 0) return false;
      var suffix = page.id.slice(main.id.length + 1);
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(suffix) || /[\r\n]/.test(suffix)) return false;
      var path = window.location.pathname;
      var directory = path.slice(0, path.lastIndexOf('/') + 1);
      return win.location.pathname === directory + main.variantId + '-' + suffix + '-lightbox.html';
    } catch (e) { return false; }
  }

  function current(ctx) {
    try {
      return active && contexts.indexOf(ctx) !== -1 && owned(ctx.win, ctx.frame) &&
        ctx.win.document === ctx.doc && ctx.win.ub === ctx.ub && window.ub === ctx.mainUb &&
        ctx.ub.hooks && ctx.ub.hooks.afterFormSubmit === ctx.after &&
        ctx.ub.hooks.onFormSubmitError === ctx.error;
    } catch (e) { return false; }
  }

  function identity(ctx, form) {
    if (!current(ctx) || !form || form.tagName !== 'FORM' || form.ownerDocument !== ctx.doc ||
        !ctx.doc.documentElement.contains(form) || form.getAttribute('data-ub-type') !== 'ub-form-inline' ||
        form.getAttribute('data-ub-bypass-lead-capture') === 'true') return null;
    var action = form.getAttribute('action') || '';
    if (!action || /[\s\\]/.test(action)) return null;
    var url = new URL(action, ctx.win.location.href), main = mainPage();
    if (url.protocol !== 'https:' || url.origin !== window.location.origin || url.pathname !== '/fsg' ||
        url.username || url.password || url.hash || url.searchParams.getAll('pageId').length !== 1 ||
        url.searchParams.getAll('variant').length !== 1 || url.searchParams.get('pageId') !== main.id ||
        url.searchParams.get('variant') !== main.variantId) return null;
    return { id: url.searchParams.get('pageId'), variant: main.variantId,
      childId: ctx.ub.page.id, action: action, pageUrl: window.location.pathname };
  }

  function discard(ctx, record) {
    var index = ctx.pending.indexOf(record);
    if (index !== -1) ctx.pending.splice(index, 1);
    if (record) { record.fields = null; record.form = null; }
  }
  function clear(ctx) { while (ctx.pending.length) discard(ctx, ctx.pending[0]); }
  function recordFor(ctx, form) {
    for (var i = 0; i < ctx.pending.length; i++) if (ctx.pending[i].form === form) return ctx.pending[i];
    return null;
  }

  function submit(ctx, event) {
    if (event.isTrusted !== true) return;
    var form = event.target, old = recordFor(ctx, form);
    try {
      var key = identity(ctx, form);
      if (!key || !consentAllows() || !ready() ||
          (event.submitter && event.submitter.hasAttribute('formaction'))) { discard(ctx, old); return; }
      if (form.getAttribute('data-converly-recipe-processing') || form.getAttribute('data-ub-submitting') === '1') return;
      discard(ctx, old);
      ctx.pending.push({ ctx: ctx, form: form, key: key, fields: snapshot(form) });
      schedule();
    } catch (e) { discard(ctx, recordFor(ctx, form)); warn(); }
  }

  function complete(ctx, detail) {
    var record = null, form = null;
    try {
      if (!current(ctx)) { clear(ctx); return; }
      if (!consentAllows() || !ready()) { clear(ctx); return; }
      if (!detail || typeof detail !== 'object' || Array.isArray(detail) || detail.isConversionGoal !== true) return;
      form = detail.formElement;
      record = recordFor(ctx, form);
      if (!record) return;
      var key = identity(ctx, form), saved = record.key;
      if (!key || key.id !== saved.id || key.variant !== saved.variant || key.childId !== saved.childId ||
          key.action !== saved.action || key.pageUrl !== saved.pageUrl || form.getAttribute('data-ub-submitting') !== '1') {
        discard(ctx, record); return;
      }
      var payload = release(record);
      payload.trigger = 'unbounce-forms';
      payload.pageUrl = saved.pageUrl;
      payload.submissionContext = { page_id: saved.id, page_variant: saved.variant, form_id: form.getAttribute('id') || null };
      discard(ctx, record);
      if (!consentAllows() || !ready()) return;
      form.setAttribute('data-converly-recipe-processing', 'true');
      try { sink.onSubmission(payload); }
      finally { form.removeAttribute('data-converly-recipe-processing'); }
    } catch (e) { discard(ctx, record); warn(); }
    finally { schedule(); }
  }

  function detach(ctx) {
    clear(ctx);
    var index = contexts.indexOf(ctx);
    if (index !== -1) contexts.splice(index, 1);

    try {
      ctx.win.removeEventListener('submit', ctx.submit, true);
      ctx.win.removeEventListener('pagehide', ctx.hide);
    } catch (e) {  }
    if (ctx.observer) ctx.observer.disconnect();
    [ctx.after, ctx.error].forEach(function(array, i) {
      try {
        var index = array.indexOf(i === 0 ? ctx.complete : ctx.fail);
        if (index !== -1) array.splice(index, 1);
      } catch (e) {  }
    });
  }

  function attach(win, frame) {
    if (!owned(win, frame)) return false;
    var ub = win.ub, hooks = ub.hooks;
    if (!hooks || !Array.isArray(hooks.afterFormSubmit) || !Array.isArray(hooks.onFormSubmitError)) return false;
    for (var i = 0; i < contexts.length; i++) {
      if (contexts[i].win === win && current(contexts[i])) return true;
    }
    var ctx = { win: win, frame: frame, doc: win.document, ub: ub, mainUb: window.ub,
      after: hooks.afterFormSubmit, error: hooks.onFormSubmitError, pending: [] };
    ctx.submit = function(event) {

      discover();
      for (var j = 0; j < contexts.length; j++) {
        if (contexts[j].win === win) { submit(contexts[j], event); break; }
      }
    };
    ctx.complete = function(detail) { complete(ctx, detail); };
    ctx.fail = function(detail, form) { discard(ctx, recordFor(ctx, form)); schedule(); };
    ctx.hide = function() { clear(ctx); detach(ctx); };
    contexts.push(ctx);
    ctx.after.push(ctx.complete);
    ctx.error.push(ctx.fail);

    if (frame) win.addEventListener('submit', ctx.submit, true);
    if (frame) win.addEventListener('pagehide', ctx.hide);
    if (frame && win.MutationObserver) {
      ctx.observer = new win.MutationObserver(function() { discover(); });
      ctx.observer.observe(ctx.doc.documentElement, { childList: true, subtree: true });
    }
    return true;
  }

  function schedule(needsDiscovery) {
    if (typeof needsDiscovery === 'boolean') waiting = needsDiscovery;
    needsDiscovery = waiting;
    var pending = contexts.some(function(ctx) { return ctx.pending.length > 0; });
    var lightbox = frames.some(function(item) { return item.lightbox; });
    if (active && needsDiscovery && !discoveryTimer) discoveryTimer = setInterval(discover, 250);
    if ((!active || !needsDiscovery) && discoveryTimer) { clearInterval(discoveryTimer); discoveryTimer = null; }
    if (active && (pending || lightbox) && !identityTimer) identityTimer = setInterval(discover, 1000);
    if ((!active || (!pending && !lightbox)) && identityTimer) { clearInterval(identityTimer); identityTimer = null; }
  }

  function discover() {
    if (!active) return;
    try {
      for (var c = contexts.length - 1; c >= 0; c--) {
        var ctx = contexts[c];
        if (!current(ctx)) { detach(ctx); continue; }
        for (var p = ctx.pending.length - 1; p >= 0; p--) {
          if (!ctx.doc.documentElement.contains(ctx.pending[p].form)) discard(ctx, ctx.pending[p]);
        }
      }
      var main = mainPage(), now = Date.now();
      var needsDiscovery = (!window.ub || !window.ub.page) && now < mainDiscoveryUntil;
      if (main && !attach(window, null) && now < mainDiscoveryUntil) needsDiscovery = true;
      var nodes = main ? window.document.querySelectorAll('iframe') : [];
      for (var f = frames.length - 1; f >= 0; f--) {
        if (!main || !window.document.documentElement.contains(frames[f].el)) {
          frames[f].el.removeEventListener('load', frameLoaded);
          frames.splice(f, 1);
        }
      }
      for (var n = 0; n < nodes.length; n++) {
        var item = null;
        for (var j = 0; j < frames.length; j++) if (frames[j].el === nodes[n]) item = frames[j];
        if (!item) {
          item = { el: nodes[n], lightbox: false, discoveryUntil: now + 5000 };
          frames.push(item);
          item.el.addEventListener('load', frameLoaded);
        }
        item.lightbox = false;
        try {
          var child = item.el.contentWindow;
          if (child.location.origin !== window.location.origin && child.location.href !== 'about:blank') continue;
          item.lightbox = owned(child, item.el);
          if (item.lightbox) { if (!attach(child, item.el) && now < item.discoveryUntil) needsDiscovery = true; }
          else if ((!child.ub || !child.ub.page) && now < item.discoveryUntil) needsDiscovery = true;
        } catch (e) {  }
      }
      schedule(needsDiscovery);
    } catch (e) { warn(); }
  }

  function frameLoaded(event) {
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].el === event.currentTarget) frames[i].discoveryUntil = Date.now() + 5000;
    }
    discover();
  }

  function mutated(records) {
    for (var r = 0; r < records.length; r++) {
      if (records[r].type !== 'attributes') continue;
      for (var i = 0; i < frames.length; i++) {
        if (frames[i].el === records[r].target) frames[i].discoveryUntil = Date.now() + 5000;
      }
    }
    discover();
  }

  function handleSubmit(event) {
    discover();
    for (var i = 0; i < contexts.length; i++) {
      if (event.target && contexts[i].doc === event.target.ownerDocument) { submit(contexts[i], event); return; }
    }
  }
  function stop() {
    active = false;
    waiting = false;
    schedule(false);
    while (contexts.length) detach(contexts[0]);
    while (frames.length) frames.pop().el.removeEventListener('load', frameLoaded);
    if (observer) { observer.disconnect(); observer = null; }
    window.removeEventListener('submit', handleSubmit, true);
    schedule();
  }
  function start() {
    if (active) return;
    active = true;
    mainDiscoveryUntil = Date.now() + 10000;
    window.addEventListener('submit', handleSubmit, true);
    if (window.MutationObserver) {
      observer = new window.MutationObserver(mutated);
      observer.observe(window.document, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    }
    discover();
  }
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', start);
  start();

})();
