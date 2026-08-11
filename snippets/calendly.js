/**
 * Calendly conversion detection snippet
 * From Converly's conversion tracking toolkit - https://converly.io
 * Repo: https://github.com/converlyio/conversion-tracking
 *
 * Detects a Calendly meeting booked and pushes this dataLayer event:
 *   calendly_event_scheduled
 *
 * Install EITHER by pasting this file inside a <script> tag in your
 * site's <head> (via your platform's custom code setting), OR as a
 * GTM Custom HTML tag firing on All Pages. Do not install both.
 * The importable GTM version of this snippet lives at
 *   recipes/gtm/detect/converly-gtm-recipe-calendly.json
 */
(function () {
  if (window.__converlyRecipeCalendly) return;
  window.__converlyRecipeCalendly = true;
  window.dataLayer = window.dataLayer || [];

  var ORIGIN_PATTERN = /(^|\.)calendly\.com$/;

  function fireConversion(eventUri, inviteeUri) {
    window.dataLayer.push({
      event: 'calendly_event_scheduled',
      event_uri: eventUri || '',
      invitee_uri: inviteeUri || ''
    });
  }

  function looksLikeCalendlyScheduled(data) {
    if (!data || typeof data !== 'object') return false;
    return data.event === 'calendly.event_scheduled';
  }

  function onMessage(event) {
    if (!event || !event.source) return;
    if (event.source === window) return;
    if (!event.origin || typeof event.origin !== 'string') return;

    var hostMatch = /^https:\/\/([^/]+)$/.exec(event.origin);
    if (!hostMatch) return;
    if (!ORIGIN_PATTERN.test(hostMatch[1])) return;

    var data = event.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (e) { return; }
    }
    if (!looksLikeCalendlyScheduled(data)) return;

    var payload = data.payload || {};
    var inviteeUri = payload.invitee && payload.invitee.uri;
    var eventUri = payload.event && payload.event.uri;
    if (!inviteeUri || !eventUri) return;

    fireConversion(eventUri, inviteeUri);
  }

  window.addEventListener('message', onMessage, false);
})();
