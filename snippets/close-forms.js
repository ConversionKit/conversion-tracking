/*! Close Forms conversion detection - ConversionKit
 *  https://github.com/ConversionKit/conversion-tracking | https://converly.io
 *  Detects: form submission. Pushes dataLayer event: close_form_submitted
 *  Keep this notice when sharing or installing this snippet. */
/* Close Form Listener by Converly. Sends only the event and public form ID. */
(function() {
  'use strict';

  if (window.__converlyRecipeCloseForms) return;
  var roots = [], candidates = [], pending = [], consumed = Object.create(null);
  var previousFetch = null, wrappedFetch = null, observer = null;
  var discoveryTimer = null, pendingTimer = null, paused = false, stopped = false;
  var FORM_ID = /^form_[A-Za-z0-9]{1,128}$/;
  var SESSION_ID = /^formsession_[A-Za-z0-9]{1,128}$/;
  var own = Object.prototype.hasOwnProperty;

  function allowed() { return !stopped && !paused; }
  function pageAllowed() {
    try { return window.top === window && location.protocol === 'https:' &&
      !/(^|\.)close\.com$/i.test(location.hostname); } catch (e) { return false; }
  }
  function hostId(host) {
    var id = host && host.getAttribute('id');
    return host && host.tagName === 'CLOSE-FORM' && host.isConnected && FORM_ID.test(id || '') ? id : null;
  }
  function snapshot(form, root, id) { return { submissionContext: { form_id: id } }; }
  function remove(list, item) {
    var index = list.indexOf(item);
    if (index !== -1) list.splice(index, 1);
  }
  function cancelReader(attempt) {
    var reader = attempt.reader;
    attempt.reader = null;
    if (reader) try {
      var result = reader.cancel();
      if (result && result.catch) result.catch(function() {});
    } catch (e) {  }
  }
  function invalidate(attempt) {
    attempt.dead = true;
    attempt.payload = null;
    cancelReader(attempt);
  }
  function finish(attempt) {
    invalidate(attempt);
    clearTimeout(attempt.timer);
    remove(pending, attempt);
    if (!pending.length && pendingTimer) { clearInterval(pendingTimer); pendingTimer = null; }
  }
  function live(attempt) {
    if (attempt.dead) return false;
    if (!allowed() || hostId(attempt.host) !== attempt.id || Date.now() - attempt.started >= 180000) {
      invalidate(attempt); return false;
    }
    return true;
  }
  function onSubmit(event) {
    try {

      if (observer) mutations(observer.takeRecords());
      var root = event.currentTarget, form = event.target, host = root && root.host, id = hostId(host);
      if (!allowed() || !id || !event.isTrusted || event.type !== 'submit' || !event.eventPhase ||
          host.shadowRoot !== root || !form || form.tagName !== 'FORM' || form.getRootNode() !== root) return;
      var payload = snapshot(form, root, id);
      if (!payload || !allowed()) return;
      var candidate = { event: event, root: root, form: form, host: host, id: id, payload: payload, bound: false };
      candidates.push(candidate);
      candidate.timer = setTimeout(function() { candidate.payload = null; remove(candidates, candidate); }, 0);
    } catch (e) {  }
  }
  function requestInfo(args) {
    var input = args[0], init = args[1], raw, method;

    if (typeof input === 'string') raw = input;
    else if (typeof window.Request === 'function' && input instanceof window.Request) raw = input.url;
    else if (typeof window.URL === 'function' && input instanceof window.URL) raw = input.href;
    else return null;
    method = init && init.method !== undefined ? init.method : input && input.method;
    if (typeof method !== 'string' || method.toUpperCase() !== 'POST' || typeof raw !== 'string') return null;

    var match = /^https:\/\/webforms\.close\.com\/webforms\/form\/(formconf_[A-Za-z0-9]{1,128})\/$/.exec(raw);
    return match ? { url: raw, configuration: match[1] } : null;
  }
  function bind(args) {
    if (!allowed()) return null;
    var info = requestInfo(args);
    if (!info) return null;
    for (var i = candidates.length - 1; i >= 0; i--) {
      var c = candidates[i], event = c.event;
      if (c.bound || !c.payload || !event.isTrusted || event.eventPhase === 0 || !event.currentTarget ||
          event.target !== c.form || c.form.getRootNode() !== c.root || hostId(c.host) !== c.id) continue;

      if (event.currentTarget !== c.root && (!event.currentTarget.getRootNode || event.currentTarget.getRootNode() !== c.root)) continue;
      c.bound = true;
      var attempt = { host: c.host, id: c.id, payload: c.payload, url: info.url,
        configuration: info.configuration, started: Date.now(), dead: false, reader: null };
      c.payload = null;
      for (var j = 0; j < pending.length; j++) if (pending[j].host === c.host) {
        invalidate(pending[j]); invalidate(attempt);
      }
      pending.push(attempt);
      attempt.timer = setTimeout(function() { finish(attempt); }, 180000);
      if (!pendingTimer) pendingTimer = setInterval(function() {
        pending.slice().forEach(function(a) { live(a); });
      }, 250);
      return attempt;
    }
    return null;
  }
  function completion(text, attempt) {
    var data;
    try { data = JSON.parse(text); } catch (e) { return null; }
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
        !own.call(data, 'form_configuration_id') || data.form_configuration_id !== attempt.configuration ||
        !own.call(data, 'form_field_errors') || !Array.isArray(data.form_field_errors) || data.form_field_errors.length ||
        !own.call(data, 'form_session_id') || typeof data.form_session_id !== 'string' || !SESSION_ID.test(data.form_session_id) ||
        !own.call(data, 'step') || !data.step || Array.isArray(data.step) || !own.call(data.step, 'type') || data.step.type !== 'form_complete' ||
        data.step.redirect_url != null || data.step.redirect_after_seconds != null) return null;
    return data.form_session_id;
  }
  function observe(response, attempt) {
    if (!live(attempt) || !response || typeof response.status !== 'number' || response.status < 200 || response.status >= 300 ||
        !isFinite(response.status) || response.url !== attempt.url || response.redirected !== false ||
        (response.type !== 'basic' && response.type !== 'cors' && response.type !== 'default')) { finish(attempt); return; }
    var clone = response.clone();
    if (!live(attempt) || !clone.body || typeof clone.body.getReader !== 'function' || typeof window.TextDecoder !== 'function') {
      if (clone.body && clone.body.cancel) { var cancelled = clone.body.cancel(); if (cancelled && cancelled.catch) cancelled.catch(function() {}); }
      finish(attempt); return;
    }
    var reader = clone.body.getReader(), decoder = new window.TextDecoder('utf-8', { fatal: true });
    attempt.reader = reader;
    var size = 0, text = '';
    function read() {
      if (!live(attempt)) { finish(attempt); return; }
      return reader.read().then(function(chunk) {
        if (!live(attempt)) { finish(attempt); return; }
        if (!chunk.done) {
          size += chunk.value.byteLength;
          if (size > 65536) { finish(attempt); return; }
          text += decoder.decode(chunk.value, { stream: true });
          return read();
        }
        text += decoder.decode();
        var session = completion(text, attempt);
        text = '';
        if (!session || !live(attempt)) { finish(attempt); return; }
        var key = attempt.id + ':' + session, payload = attempt.payload;
        if (consumed[key]) { finish(attempt); return; }
        consumed[key] = true;
        finish(attempt);
        if (allowed()) {
          var push = { event: 'close_form_submitted', form_id: payload.submissionContext.form_id };
          (window.dataLayer = window.dataLayer || []).push(push);
        }
      });
    }
    return read();
  }
  function installFetch() {
    if (wrappedFetch || typeof window.fetch !== 'function') return;
    var delegate = window.fetch;
    var wrapper = function() {
      var attempt = null;
      try { if (window.fetch && wrappedFetch === wrapper) attempt = bind(arguments); } catch (e) {  }
      var result;
      try { result = delegate.apply(this, arguments); }
      catch (error) { if (attempt) finish(attempt); throw error; }
      if (attempt) try {
        result.then(function(response) { return observe(response, attempt); }, function() { finish(attempt); })
          .catch(function() { finish(attempt); });
      } catch (e) { finish(attempt); }
      return result;
    };
    try {
      window.fetch = wrapper;
      if (window.fetch === wrapper) { previousFetch = delegate; wrappedFetch = wrapper; }
    } catch (e) {  }
  }
  function discover() {
    if (stopped || paused || !pageAllowed()) return;
    var hosts = document.querySelectorAll('close-form'), waiting = false;
    for (var i = 0; i < hosts.length; i++) {
      var host = hosts[i];
      if (!hostId(host)) continue;
      var root = host.shadowRoot;
      if (!root || !root.querySelector('form')) { waiting = true; continue; }
      if (roots.some(function(entry) { return entry.root === root; })) continue;
      var rootObserver = new MutationObserver(function() {
        candidates.forEach(function(c) { if (!c.bound && c.form.getRootNode() !== c.root) c.payload = null; });
      });
      rootObserver.observe(root, { childList: true, subtree: true });
      root.addEventListener('submit', onSubmit, true);
      roots.push({ root: root, observer: rootObserver });
      installFetch();
    }
    if (waiting && !discoveryTimer) discoveryTimer = setInterval(discover, 250);
    if (!waiting && discoveryTimer) { clearInterval(discoveryTimer); discoveryTimer = null; }
    for (i = roots.length - 1; i >= 0; i--) if (!roots[i].root.host.isConnected) {
      roots[i].root.removeEventListener('submit', onSubmit, true); roots[i].observer.disconnect(); roots.splice(i, 1);
    }
  }
  function mutations(records) {
    pending.slice().forEach(function(a) {
      for (var i = 0; i < records.length; i++) {
        var record = records[i];
        if (record.type === 'attributes' && record.target === a.host) invalidate(a);
        for (var j = 0; record.removedNodes && j < record.removedNodes.length; j++) {
          var node = record.removedNodes[j];
          if (node === a.host || (node.contains && node.contains(a.host))) invalidate(a);
        }
      }
      live(a);
    });
    discover();
  }
  function clearWork() {
    candidates.forEach(function(c) { clearTimeout(c.timer); c.payload = null; }); candidates = [];
    pending.slice().forEach(finish);
    roots.forEach(function(entry) { entry.root.removeEventListener('submit', onSubmit, true); entry.observer.disconnect(); }); roots = [];
    if (observer) observer.disconnect(); observer = null;
    clearInterval(discoveryTimer); discoveryTimer = null;
    try { if (window.fetch === wrappedFetch) window.fetch = previousFetch; } catch (e) {  }
    wrappedFetch = null; previousFetch = null;
  }
  function start() {
    if (stopped || !pageAllowed()) return;
    paused = false;
    if (!observer) { observer = new MutationObserver(mutations); observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['id'] }); }
    discover();
  }
  function pagehide() { paused = true; clearWork(); }
  function teardown() {
    stopped = true; clearWork();
    window.removeEventListener('pagehide', pagehide, true);
    window.removeEventListener('pageshow', start, true);
  }
  window.__converlyRecipeCloseForms = { discover: discover, teardown: teardown };
  window.addEventListener('pagehide', pagehide, true);
  window.addEventListener('pageshow', start, true);
  start();
})();
