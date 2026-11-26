/*! Avada Forms conversion detection - ConversionKit
 *  https://github.com/ConversionKit/conversion-tracking | https://converly.io
 *  Detects: form submission. Pushes dataLayer event: avada_forms_submitted
 *  Keep this notice when sharing or installing this snippet. */
(function () {
  if (window.__converlyRecipeAvadaForms || window.__converlyRecipeAvadaFormsLegacy) return;
  window.__converlyRecipeAvadaForms = true;
  window.dataLayer = window.dataLayer || [];
  var seen = typeof WeakSet === 'function' ? new WeakSet() : null;
  var lastSuccess = {};
  function positiveId(value) {
    if (typeof value === 'number') return isFinite(value) && Math.floor(value) === value && value > 0 && value <= 9007199254740991 ? String(value) : '';
    if (typeof value === 'string') {
      if (!/^\d+$/.test(value)) return '';
      var numeric = Number(value);
      return isFinite(numeric) && Math.floor(numeric) === numeric && numeric > 0 && numeric <= 9007199254740991 ? value : '';
    }
    return '';
  }
  function onDone(event, payload) {
    if (event && seen) { if (seen.has(event)) return; seen.add(event); }
    if (!payload || !payload.result || payload.result.status !== 'success') return;
    var formId = positiveId(payload.formConfig && payload.formConfig.form_id);
    if (!formId) return;
    // Avada can send both clicks before its working state blocks the button.
    // Count their closely spaced successful responses once for this form ID.
    var now = Date.now();
    if (lastSuccess[formId] && now - lastSuccess[formId] < 1000) return;
    lastSuccess[formId] = now;
    window.dataLayer.push({ event: 'avada_forms_submitted', form_id: formId });
  }
  var handlerBound = false;
  function hook() {
    if (handlerBound) return true;
    var jq = typeof jQuery !== 'undefined' ? jQuery : (typeof $ !== 'undefined' ? $ : null);
    if (!jq) return false;
    jq(window).on('fusion-form-ajax-submit-done', onDone);
    handlerBound = true;
    return true;
  }
  if (!hook()) {
    document.addEventListener('DOMContentLoaded', hook, { once: true });
    window.addEventListener('load', hook, { once: true });
  }
})();
