/*! HubSpot Forms conversion detection - ConversionKit
 *  https://github.com/ConversionKit/conversion-tracking | https://converly.io
 *  Detects: form submission. Pushes dataLayer event: hubspot_form_submitted
 *  Keep this notice when sharing or installing this snippet. */
(function () {
  if (window.__converlyRecipeHubspotForms) return;
  window.__converlyRecipeHubspotForms = true;
  window.dataLayer = window.dataLayer || [];

  // One submission, one push. Keyed on the form id, so a duplicate signal for
  // the same submission inside 2 seconds is ignored, while a genuinely new
  // submission (which takes far longer than 2 seconds) still fires.
  var DEDUPE_WINDOW_MS = 2000;
  var lastFiredAt = {};

  function fireConversion(formId) {
    var id = formId ? String(formId) : '';
    var key = id || 'unknown';
    var now = Date.now();
    if (lastFiredAt[key] && now - lastFiredAt[key] < DEDUPE_WINDOW_MS) return;
    lastFiredAt[key] = now;
    window.dataLayer.push({
      event: 'hubspot_form_submitted',
      form_id: id
    });
  }

  // ------------------------------------------------------------
  // Path 1: current forms editor (live-verified)
  // ------------------------------------------------------------
  // HubSpot dispatches this on the .hs-form-frame container and lets it bubble
  // (or on document itself when it cannot find the container), with
  // detail = { formId, instanceId }. It only ever follows a submission
  // HubSpot's server accepted. Listening on document in the capture phase
  // catches both dispatch points and cannot be silenced by page code that
  // stops the event's propagation further down.
  function hubspotFormsApi() {
    return window.HubSpotFormsV4 || window.HubspotFormsV4 || null;
  }

  function handleSubmissionSuccess(event) {
    try {
      var detail = event && event.detail;
      if (!detail || typeof detail.formId !== 'string' || !detail.formId) return;
      if (typeof detail.instanceId !== 'string' || !detail.instanceId) return;
      // When HubSpot's forms API is on the page, the event must name a form
      // instance HubSpot actually rendered here. A stray or malformed event
      // with a made-up instance id is ignored.
      var api = hubspotFormsApi();
      if (api && typeof api.getFormFromEvent === 'function') {
        if (!api.getFormFromEvent(event)) return;
      }
      fireConversion(detail.formId);
    } catch (e) {
      // Never throw back into HubSpot's own event dispatch.
    }
  }

  // ------------------------------------------------------------
  // Path 2: legacy forms editor (ported from the production module)
  // ------------------------------------------------------------
  // Legacy forms announce each lifecycle step with a postMessage of
  // { type: 'hsFormCallback', eventName, id, data }. Only 'onFormSubmitted'
  // means the submission was accepted; 'onFormSubmit' also fires for
  // submissions that then fail validation, so it is ignored.
  //
  // Origin check: an inline legacy form broadcasts from the page's own window,
  // and an iframed one from a HubSpot-owned https origin. Anything else (an ad
  // iframe, another site) is rejected. Hosts are anchored so a lookalike such
  // as "hsforms.com.attacker.example" cannot pass.
  var HUBSPOT_ORIGIN_PATTERNS = [
    /(^|\.)hsforms\.com$/,
    /(^|\.)hsforms\.net$/,
    /(^|\.)hubspot\.com$/
  ];

  function isTrustedOrigin(event) {
    if (!event) return false;
    if (event.source === window && event.origin === window.location.origin) return true;
    if (!event.source) return false;
    if (!event.origin || typeof event.origin !== 'string') return false;
    var hostMatch = /^https:\/\/([^/:]+)(:\d+)?$/.exec(event.origin);
    if (!hostMatch) return false;
    for (var i = 0; i < HUBSPOT_ORIGIN_PATTERNS.length; i++) {
      if (HUBSPOT_ORIGIN_PATTERNS[i].test(hostMatch[1])) return true;
    }
    return false;
  }

  function handleMessage(event) {
    try {
      var data = event && event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type !== 'hsFormCallback') return;
      if (data.eventName !== 'onFormSubmitted') return;
      if (!isTrustedOrigin(event)) return;
      fireConversion(typeof data.id === 'string' ? data.id : '');
    } catch (e) {
      // Never throw back into the page's own message handling.
    }
  }

  document.addEventListener('hs-form-event:on-submission:success', handleSubmissionSuccess, true);
  window.addEventListener('message', handleMessage, false);
})();
