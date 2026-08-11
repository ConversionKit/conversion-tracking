/**
 * Jotform conversion detection snippet
 * From Converly's conversion tracking toolkit - https://converly.io
 * Repo: https://github.com/converlyio/conversion-tracking
 *
 * Detects a Jotform form submission and pushes this dataLayer event:
 *   jotform_form_submitted
 *
 * Install EITHER by pasting this file inside a <script> tag in your
 * site's <head> (via your platform's custom code setting), OR as a
 * GTM Custom HTML tag firing on All Pages. Do not install both.
 * The importable GTM version of this snippet lives at
 *   recipes/gtm/detect/converly-gtm-recipe-jotform.json
 */
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

  document.addEventListener('submit', function (event) {
    var formEl = event.target;
    if (!isJotformInlineForm(formEl)) return;
    fireConversion(formEl.id);
  }, true);
})();
