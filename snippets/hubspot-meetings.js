/*! HubSpot Meetings conversion detection - ConversionKit
 *  https://github.com/ConversionKit/conversion-tracking | https://converly.io
 *  Detects: meeting booked. Pushes dataLayer event: hubspot_meeting_booked
 *  Keep this notice when sharing or installing this snippet. */
/* HubSpot Meetings Listener by Converly. Sends only the booking event and meeting link slug. */
(function() {
  'use strict';

  if (typeof window === 'undefined' || window.__converlyRecipeHubspotMeetings) return;
  window.__converlyRecipeHubspotMeetings = true;

  var ORIGIN = 'https://meetings.hubspot.com';
  var frames = [];
  var trackerStarted = false;
  var seen = Object.create(null);

  function object(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function eligibleFrame(frame) {
    try {
      var src = frame.getAttribute('src');
      if (!src) return false;
      var url = new URL(src, document.baseURI);
      return !url.username && !url.password && url.origin === ORIGIN;
    } catch (e) { return false; }
  }

  function scan() {
    frames = [];
    var candidates = document.querySelectorAll('iframe');
    for (var i = 0; i < candidates.length; i++) {
      if (eligibleFrame(candidates[i])) frames.push(candidates[i]);
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

  function boundSource(source) {
    for (var i = 0; i < frames.length; i++) {
      try {
        if (document.documentElement.contains(frames[i]) &&
            frames[i].contentWindow === source && eligibleFrame(frames[i])) return true;
      } catch (e) { /* Unreadable frames fail closed. */ }
    }
    return false;
  }

  function handleMessage(event) {
    try {
      if (!event || !event.source || event.source === window || event.isTrusted !== true) return;
      if (event.origin !== ORIGIN) return;
      var data = event.data;
      if (!object(data) || data.meetingBookSucceeded !== true || data.meetingBookFailed === true) return;
      var payload = data.meetingsPayload;
      if (!object(payload) || !object(payload.bookingResponse)) return;
      var response = payload.bookingResponse.postResponse;
      if (!object(response) || !object(response.contact) || !object(response.timerange)) return;
      var sourceMatchesScheduler = boundSource(event.source);
      if (!sourceMatchesScheduler) return;
      if (payload.linkType !== 'PERSONAL_LINK' || payload.isPaidMeeting !== false) return;
      var formGuid = payload.formGuid;
      if (typeof formGuid !== 'string' || formGuid.length !== 36 ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(formGuid)) return;
      var contact = response.contact;
      var email = contact.email;
      var start = response.timerange.start;
      if (typeof email !== 'string' || !email.trim() || typeof start !== 'number' ||
          !isFinite(start) || start <= 0 || Math.floor(start) !== start) return;
      var key = JSON.stringify([formGuid.toLowerCase(), email.trim().toLowerCase(), start]);
      if (Object.prototype.hasOwnProperty.call(seen, key)) return;

      var context = {};
      var slug = payload.userSlug;
      // Missing/malformed evidence never falls back to the different formGuid.
      if (typeof slug === 'string' && /^[a-zA-Z0-9_-]+$/.test(slug)) context.form_id = slug;
      // Reserve the booking before handing it to GTM.
      seen[key] = true;
      var push = { event: 'hubspot_meeting_booked' };
      if (context.form_id) push.form_id = context.form_id;
      (window.dataLayer = window.dataLayer || []).push(push);
    } catch (e) { /* Drop ambiguous messages without logging identity or payloads. */ }
  }

  window.addEventListener('message', handleMessage, false);
  startTracker();
  if (!trackerStarted) document.addEventListener('DOMContentLoaded', startTracker, false);

})();
