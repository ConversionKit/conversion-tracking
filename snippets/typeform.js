/**
 * Typeform conversion detection snippet
 * From Converly's conversion tracking toolkit - https://converly.io
 * Repo: https://github.com/converlyio/conversion-tracking
 *
 * Detects a Typeform form submission and pushes this dataLayer event:
 *   typeform_form_submitted
 *
 * Install EITHER by pasting this file inside a <script> tag in your
 * site's <head> (via your platform's custom code setting), OR as a
 * GTM Custom HTML tag firing on All Pages. Do not install both.
 * The importable GTM version of this snippet lives at
 *   recipes/gtm/detect/converly-gtm-recipe-typeform.json
 */
(function () {
  if (window.__converlyRecipeTypeform) return;
  window.__converlyRecipeTypeform = true;
  window.dataLayer = window.dataLayer || [];

  var ORIGIN_PATTERN = /(^|\.)typeform\.com$/;

  function fireConversion(formId, responseId) {
    window.dataLayer.push({
      event: 'typeform_form_submitted',
      form_id: formId || '',
      response_id: responseId || ''
    });
  }

  function looksLikeTypeformSubmit(data) {
    if (!data || typeof data !== 'object') return false;
    var t = data.type;
    if (typeof t !== 'string') return false;
    return (
      t === 'form-submit' ||
      t === 'typeform.formSubmit' ||
      t === 'typeform-form-submit' ||
      t === 'embed-auto-close-popup'
    );
  }

  function pickFormId(data) {
    return data.formId || data.form_id || data.formID ||
      (data.payload && (data.payload.formId || data.payload.form_id)) || '';
  }

  function pickResponseId(data) {
    return data.responseId || data.response_id || data.responseID ||
      (data.payload && (data.payload.responseId || data.payload.response_id)) || '';
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
    if (!data || typeof data !== 'object') return;
    if (!looksLikeTypeformSubmit(data)) return;

    var formId = pickFormId(data);
    var responseId = pickResponseId(data);
    if (!formId || !responseId) return;

    fireConversion(formId, responseId);
  }

  window.addEventListener('message', onMessage, false);
})();
