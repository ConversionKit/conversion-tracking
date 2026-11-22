/*! Zoho Bookings conversion detection - ConversionKit
 *  https://github.com/ConversionKit/conversion-tracking | https://converly.io
 *  Detects: booking made. Pushes dataLayer event: zoho_bookings_appointment_scheduled
 *  Keep this notice when sharing or installing this snippet. */
/* Zoho Bookings Listener by Converly. Counts matching confirmation returns inside AU booking frames. */
(function() {
  'use strict';
  if (typeof window === 'undefined' || window !== window.top ||
      window.location.protocol !== 'https:' || window.__converlyRecipeZohoBookings) return;
  window.__converlyRecipeZohoBookings = true;

  var frames = [];
  var observer = null;
  var reserved = Object.create(null);
  var own = Object.prototype.hasOwnProperty;
  var PREFIX = '__converly_recipe_zoho_bookings_';
  var LIMIT = 256;
  var CLEAN_KEYS = ('booking_id workspace_uuid workspace_name assigned_to service_uuid service_name ' +
    'customer_name customer_first_name customer_last_name customer_contact_no customer_email ' +
    'booking_start_time booking_end_time booking_cost booking_cost_paid booking_currency ' +
    'utm_source utm_medium utm_campaign utm_content utm_term').split(' ');

  function allowed() { return true; }
  function eligible(frame) {
    try {
      var src = frame.getAttribute('src');
      if (!src) return null;
      var u = new URL(src, document.baseURI);
      if (u.protocol !== 'https:' || u.username || u.password || u.port ||
          !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.zohobookings\.com\.au$/.test(u.hostname) ||
          u.pathname !== '/portal-embed' || !/^#\/[0-9]{1,64}$/.test(u.hash)) return null;
      return { src: src, origin: u.origin, service: u.hash.slice(2) };
    } catch (e) { return null; }
  }
  function connected(record) {
    return document.documentElement.contains(record.frame) &&
      record.frame.contentWindow === record.win && record.frame.getAttribute('src') === record.src;
  }
  function remove(record) {
    record.dead = true;
    record.frame.removeEventListener('load', record.listener, false);
    var index = frames.indexOf(record);
    if (index !== -1) frames.splice(index, 1);
  }
  function origin(record) {
    try { return record.win.location.origin; } catch (e) { return null; }
  }
  function decode(raw) { return decodeURIComponent(raw); }
  function queryParts(search) {
    var parts = search.replace(/^\?/, '').split('&');
    var kept = [], values = Object.create(null), malformed = false;
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      var eq = parts[i].indexOf('=');
      var rawKey = eq < 0 ? parts[i] : parts[i].slice(0, eq);
      var key;
      try { key = decode(rawKey); } catch (e) { malformed = true; kept.push(parts[i]); continue; }
      if (CLEAN_KEYS.indexOf(key) === -1) { kept.push(parts[i]); continue; }
      if (!own.call(values, key)) values[key] = [];
      values[key].push(eq < 0 ? '' : parts[i].slice(eq + 1));
    }
    return { values: values, kept: kept, malformed: malformed };
  }
  function single(values, key) {
    if (!own.call(values, key) || values[key].length !== 1) return null;
    try { return decode(values[key][0]); } catch (e) { return null; }
  }
  function validPair(pair) {
    return Array.isArray(pair) && pair.length === 2 && typeof pair[0] === 'string' &&
      /^[0-9]{1,64}$/.test(pair[0]) && typeof pair[1] === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(pair[1]);
  }
  function reserve(pair) {
    if (!allowed()) return false;
    var key = PREFIX + encodeURIComponent(window.location.origin);
    var identity = key + ':' + JSON.stringify(pair);
    if (own.call(reserved, identity)) return false;
    reserved[identity] = true;
    try {
      if (!allowed()) return false;
      var storage = window.sessionStorage;
      var raw = storage.getItem(key);
      var data = raw === null ? { v: 2, bookings: [] } : JSON.parse(raw);
      var bookings;
      if (Array.isArray(data)) bookings = data;
      else if (data && data.v === 2 && Array.isArray(data.bookings)) bookings = data.bookings;
      else return false;
      if (bookings.length > LIMIT) return false;
      var duplicate = false;
      for (var i = 0; i < bookings.length; i++) {
        if (!validPair(bookings[i])) return false;
        if (bookings[i][0] === pair[0] && bookings[i][1] === pair[1]) duplicate = true;
      }
      if (duplicate) {
        if (Array.isArray(data) && allowed()) storage.setItem(key, JSON.stringify({ v: 2, bookings: bookings }));
        return false;
      }
      if (bookings.length === LIMIT || !allowed()) return false;
      bookings.push(pair);
      storage.setItem(key, JSON.stringify({ v: 2, bookings: bookings }));
      return true;
    } catch (e) { return false; }
  }
  function contacts() { return { userData: {} }; }
  function handleLoad(record, event) {
    if (!event || event.isTrusted !== true || record.dead) return;
    try {
      if (!connected(record)) { remove(record); return; }
      if (!allowed()) { record.dead = true; return; }
      var currentOrigin = origin(record);
      if (currentOrigin === null) { record.armed = true; return; }
      if (currentOrigin === 'null') return;
      if (currentOrigin !== window.location.origin) { record.dead = true; return; }
      record.dead = true;
      if (!record.armed || !allowed()) return;
      var location = record.win.location;
      var search = location.search;
      var parsed = queryParts(search);
      var submission = null;
      try {
        if (parsed.malformed || !allowed()) return;
        var workspace = single(parsed.values, 'workspace_uuid');
        var booking = single(parsed.values, 'booking_id');
        var service = single(parsed.values, 'service_uuid');
        if (!validPair([workspace, booking]) || service !== record.service) return;
        if (!reserve([workspace, booking]) || !allowed()) return;
        submission = contacts(parsed.values);
      } finally {
        record.win.history.replaceState(record.win.history.state, '', location.pathname +
          (parsed.kept.length ? '?' + parsed.kept.join('&') : '') + location.hash);
      }
      if (!submission || !allowed()) return;
      var push = { event: 'zoho_bookings_appointment_scheduled', form_id: service, booking_id: booking };
      (window.dataLayer = window.dataLayer || []).push(push);
    } catch (e) { /* No payload logging, no queue, no reservation rollback. */ }
  }
  function scan(mutations) {
    var i, j;
    if (mutations) for (i = 0; i < mutations.length; i++) {
      var change = mutations[i];
      var old = frames.slice();
      for (j = 0; j < old.length; j++) {
        if (change.type === 'attributes' && change.target === old[j].frame) remove(old[j]);
        if (change.removedNodes) for (var n = 0; n < change.removedNodes.length; n++) {
          var node = change.removedNodes[n];
          if (node === old[j].frame || (node.contains && node.contains(old[j].frame))) remove(old[j]);
        }
      }
    }
    for (i = frames.length - 1; i >= 0; i--) if (!connected(frames[i])) remove(frames[i]);
    var candidates = document.querySelectorAll('iframe');
    for (i = 0; i < candidates.length; i++) {
      var frame = candidates[i], found = false;
      for (j = 0; j < frames.length; j++) if (frames[j].frame === frame) found = true;
      if (found) continue;
      var url = eligible(frame);
      if (!url || !frame.contentWindow) continue;
      track(frame, url);
    }
  }
  function track(frame, url) {
    var record = { frame: frame, win: frame.contentWindow, src: url.src, origin: url.origin, service: url.service, dead: false };
    record.listener = function(event) { handleLoad(record, event); };
    frames.push(record);
    frame.addEventListener('load', record.listener, false);
    var initial = origin(record);
    record.armed = initial === null;
    if (initial !== null && initial !== 'null') record.dead = true;
  }
  function start() {
    if (observer || !document.documentElement) return;
    if (typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(scan);
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    }
    scan();
  }
  function pagehide() { for (var i = 0; i < frames.length; i++) frames[i].dead = true; }
  function destroy() {
    if (observer) observer.disconnect();
    while (frames.length) remove(frames[0]);
    window.removeEventListener('pagehide', pagehide, false);
    document.removeEventListener('DOMContentLoaded', start, false);
  }
  window.addEventListener('pagehide', pagehide, false);
  start();
  if (!observer) document.addEventListener('DOMContentLoaded', start, false);
})();
