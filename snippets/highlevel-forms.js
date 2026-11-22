/*! HighLevel Forms conversion detection - ConversionKit
 *  https://github.com/ConversionKit/conversion-tracking | https://converly.io
 *  Detects: form submission. Pushes dataLayer event: highlevel_form_submitted
 *  Keep this notice when sharing or installing this snippet. */
/* HighLevel Listener by Converly. */
(function() {
  'use strict';

  if (typeof window === 'undefined' || window.__converlyRecipeHighlevel) return;
  window.__converlyRecipeHighlevel = true;

  var ORIGIN = 'https://api.leadconnectorhq.com';
  var SUCCESS_WINDOW_MS = 1000;
  var PATH = /^\/widget\/(form|survey|booking)\/([A-Za-z0-9]{20})$/;
  function identity(src) {
    try {
      if (typeof src !== 'string' || !/^https:\/\//.test(src) || /[\\\s]/.test(src)) return null;
      var url = new URL(src);
      var match = PATH.exec(url.pathname);
      if (url.origin !== ORIGIN || url.username || url.password || !match) return null;
      return { type: match[1], id: match[2], origin: url.origin };
    } catch (e) { return null; }
  }
  function current(frame) {
    if (frame.hasAttribute('srcdoc')) return null;
    return identity(frame.getAttribute('src'));
  }
  function same(a, b) {
    return a && b && a.type === b.type && a.id === b.id && a.origin === b.origin;
  }
  var frames = [];
  var observer;
  var stopped = false;
  function recordFor(frame) {
    for (var i = 0; i < frames.length; i++) if (frames[i].frame === frame) return frames[i];
    return null;
  }
  function track(frame, entity) {
    var record = { frame: frame, entity: entity, page: window.location.pathname,
      consumedUntil: 0, retired: false };
    record.onLoad = function() { record.consumedUntil = 0; };
    frame.addEventListener('load', record.onLoad, false);
    frames.push(record);
  }
  function scan() {
    if (stopped || !document.documentElement) return;
    var i;
    for (i = 0; i < frames.length; i++) {
      var record = frames[i];
      if (!same(record.entity, current(record.frame))) record.retired = true;
    }
    var nodes = document.querySelectorAll('iframe');
    for (i = 0; i < nodes.length; i++) {
      var entity = current(nodes[i]);
      if (entity && !recordFor(nodes[i])) track(nodes[i], entity);
    }
  }
  function mutations(changes) {
    // Retain mutation history, not just the final URL. A -> B -> A in one task
    // must retire the original record too. WindowProxy survives navigation.
    for (var i = 0; i < changes.length; i++) {
      var change = changes[i];
      var record = recordFor(change.target);
      if (record && change.type === 'attributes') {
        if (change.attributeName === 'src' && !same(record.entity, identity(change.oldValue))) record.retired = true;
        if (change.attributeName === 'srcdoc') record.retired = true;
      }
      // Removal alone is not retirement. HighLevel wraps and re-inserts frames.
    }
    scan();
  }
  function startTracker() {
    if (observer || stopped || !document.documentElement) return;
    scan();
    if (typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(mutations);
      observer.observe(document.documentElement, { childList: true, subtree: true,
        attributes: true, attributeOldValue: true,
        attributeFilter: ['src', 'srcdoc', 'id', 'data-layout', 'data-layout-iframe-id', 'data-form-id'] });
    }
  }
  function bound(source) {
    if (observer) mutations(observer.takeRecords());
    else scan();
    // Enumerate the live page, not a cached WindowProxy from before a move/load.
    var nodes = document.querySelectorAll('iframe');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].contentWindow !== source) continue;
      var record = recordFor(nodes[i]);
      if (record && !record.retired && same(record.entity, current(nodes[i]))) return record;
    }
    return null;
  }
  function ownValue(object, key) {
    var property = Object.getOwnPropertyDescriptor(object, key);
    return property && Object.prototype.hasOwnProperty.call(property, 'value') ? property.value : undefined;
  }
  function candidateIframeId(data) {
    // Optional location/fingerprint slots are deliberately never read or retained.
    if (!Array.isArray(data) || data.length < 3 || data.length > 5 ||
        ownValue(data, '0') !== 'set-sticky-contacts') return null;
    var key = ownValue(data, '1');
    var id = ownValue(data, '2');
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(id) ||
        key !== 'embedded_iframe_' + id) return null;
    return id;
  }
  function successSignal(data, frame) {
    if (!Array.isArray(data) || data.length < 3 || data.length > 5 ||
        ownValue(data, '0') !== 'set-sticky-contacts') return false;
    if (ownValue(data, '1') !== '_ud') return candidateIframeId(data) === frame.id;
    // Validate the JSON container. Optional location and fingerprint slots stay unread.
    var json = ownValue(data, '2');
    if (typeof json !== 'string' || json.length > 65536) return false;
    try {
      var contact = JSON.parse(json);
      return contact !== null && typeof contact === 'object' && !Array.isArray(contact);
    } catch (e) { return false; }
  }
  function handleMessage(event) {
    try {
      if (stopped || !observer || !event || event.isTrusted !== true || !event.source || event.source === window || event.origin !== ORIGIN) return;
      // Bind without touching payloads. Blocked events are discarded, never queued.
      var record = bound(event.source);
      if (!record || Date.now() < record.consumedUntil || record.entity.type === 'booking') return;
      if (!successSignal(event.data, record.frame)) return;
      // Reserve before handoff, including a missing loader or throwing callback.
      // Duplicate signals do not extend the window or schedule a delayed event.
      record.consumedUntil = Date.now() + SUCCESS_WINDOW_MS;
      // Keep the host path bound to the path where the frame was admitted.
      if (window.location.pathname !== record.page) { record.consumedUntil = Infinity; return; }
      var push = { event: 'highlevel_form_submitted',
        form_id: record.entity.id, widget_type: record.entity.type };
      (window.dataLayer = window.dataLayer || []).push(push);
    } catch (e) { /* No logs, payload retention or retry after ambiguous handoff. */ }
  }
  function stop() {
    stopped = true;
    if (observer) observer.disconnect();
    for (var i = 0; i < frames.length; i++) frames[i].frame.removeEventListener('load', frames[i].onLoad, false);
    frames = [];
  }
  window.addEventListener('message', handleMessage, false);
  window.addEventListener('pagehide', stop, false);
  startTracker();
  if (!observer) document.addEventListener('DOMContentLoaded', startTracker, false);
})();
