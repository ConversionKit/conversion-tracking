/*! Jotform conversion detection - ConversionKit
 *  https://github.com/ConversionKit/conversion-tracking | https://converly.io
 *  Detects: form submission. Pushes dataLayer event: jotform_form_submitted
 *  Keep this notice when sharing or installing this snippet. */
(function () {
  if (window.__converlyRecipeJotform) return;
  window.__converlyRecipeJotform = true;
  window.dataLayer = window.dataLayer || [];

  var JOTFORM_FORM_ID_RE = /^\d{10,}$/;
  var JOTFORM_SUBMIT_ACTION_RE = /^https?:\/\/submit\.jotform\.com\//i;

  function isJotformInlineForm(formEl) {
    if (!formEl || (formEl.tagName || '').toLowerCase() !== 'form') return false;
    var hasClass = formEl.classList && formEl.classList.contains('jotform-form');
    var action = formEl.getAttribute && formEl.getAttribute('action');
    var hasAction = action && JOTFORM_SUBMIT_ACTION_RE.test(action);
    if (!hasClass && !hasAction) return false;
    var id = formEl.id || '';
    if (!JOTFORM_FORM_ID_RE.test(id)) return false;
    return true;
  }

  function fireConversion(formId) {
    window.dataLayer.push({
      event: 'jotform_form_submitted',
      form_id: formId || ''
    });
  }

  var attempted = {};
  var fired = {};

  document.addEventListener('submit', function (event) {
    var formEl = event.target;
    if (!isJotformInlineForm(formEl)) return;
    attempted[formEl.id] = true;
  }, true);

  document.addEventListener('formdata', function (event) {
    var formEl = event.target;
    if (!isJotformInlineForm(formEl)) return;
    if (!attempted[formEl.id] || fired[formEl.id]) return;
    fired[formEl.id] = true;
    fireConversion(formEl.id);
  }, true);
})();
