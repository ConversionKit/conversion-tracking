/*! Duda conversion detection - ConversionKit
 *  https://github.com/ConversionKit/conversion-tracking | https://converly.io
 *  Detects: form submission. Pushes dataLayer event: duda_form_submitted
 *  Keep this notice when sharing or installing this snippet. */
(function () {
  if (window.__converlyRecipeDuda) return;
  window.__converlyRecipeDuda = true;
  window.dataLayer = window.dataLayer || [];

  var armed = false;
  var fastPoll = null;
  var slowPoll = null;

  function stopPolling() {
    if (fastPoll) { clearInterval(fastPoll); fastPoll = null; }
    if (slowPoll) { clearInterval(slowPoll); slowPoll = null; }
  }

  function fireConversion(fields) {
    var count = 0;
    try {
      if (fields && typeof fields.length === 'number') count = fields.length;
    } catch (e) {
      count = 0;
    }
    window.dataLayer.push({
      event: 'duda_form_submitted',
      // Duda's event carries no form id or name (see the notes above), so this
      // is the only signal that separates, say, a 2-field newsletter box from
      // a 6-field quote form on the same page. It is form structure, never
      // visitor data.
      field_count: count
    });
  }

  function arm() {
    if (armed) return true;
    var api = window.dmAPI;
    if (!api || typeof api.subscribeEvent !== 'function') return false;
    if (!api.EVENTS || !api.EVENTS.FORM_SUBMISSION) return false;
    try {
      api.subscribeEvent(api.EVENTS.FORM_SUBMISSION, function (fields) {
        try {
          fireConversion(fields);
        } catch (e) {
          // Never throw back into Duda's own event dispatch.
        }
      });
    } catch (e) {
      // dmAPI can be half-initialised: the members exist but subscribing
      // throws. Stay unarmed and let the poll try again, rather than marking
      // ourselves armed with no listener attached and going silent forever.
      return false;
    }
    // Only now. Setting this before the call means a throw leaves us
    // permanently "armed" with nothing listening.
    armed = true;
    return true;
  }

  if (!arm()) {
    // Duda's runtime usually exists before GTM injects this tag, but a slow
    // connection or a lazily rendered section can reverse that. Poll quickly
    // for the first 20 seconds, then keep trying slowly for the life of the
    // page rather than giving up: a form that appears late (a popup, a section
    // below a slow hero) would otherwise never be tracked, silently.
    fastPoll = setInterval(function () { if (arm()) stopPolling(); }, 100);
    slowPoll = setInterval(function () { if (arm()) stopPolling(); }, 2000);
    setTimeout(function () {
      if (fastPoll) { clearInterval(fastPoll); fastPoll = null; }
    }, 20000);
  }
})();
