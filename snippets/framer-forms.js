/**
 * Framer Forms conversion detection snippet
 * From Converly's conversion tracking toolkit - https://converly.io
 * Repo: https://github.com/converlyio/conversion-tracking
 *
 * Detects a Framer Forms form submission and pushes this dataLayer event:
 *   framer_form_submitted
 *
 * Install EITHER by pasting this file inside a <script> tag in your
 * site's <head> (via your platform's custom code setting), OR as a
 * GTM Custom HTML tag firing on All Pages. Do not install both.
 * The importable GTM version of this snippet lives at
 *   recipes/gtm/detect/converly-gtm-recipe-framer-forms.json
 */
(function () {
  if (window.__converlyRecipeFramerForms) return;
  window.__converlyRecipeFramerForms = true;
  window.dataLayer = window.dataLayer || [];

  function fireConversion(formName) {
    window.dataLayer.push({
      event: 'framer_form_submitted',
      form_name: formName || ''
    });
  }

  function isFramerForm(formEl) {
    if (!formEl) return false;
    if (formEl.hasAttribute && formEl.hasAttribute('data-framer-name')) return true;
    var cls = typeof formEl.className === 'string' ? formEl.className : '';
    if (/(^|\s)framer-[A-Za-z0-9_-]+/.test(cls)) return true;
    try {
      if (formEl.closest && formEl.closest('[data-framer-component-type]')) return true;
      if (formEl.closest && formEl.closest('[data-framer-name]')) return true;
    } catch (e) {
      // .closest not available — fall through
    }
    return false;
  }

  function handleSubmit(event) {
    try {
      var formEl = event.target;
      if (!formEl || (formEl.tagName || '').toLowerCase() !== 'form') return;
      if (!isFramerForm(formEl)) return;

      var formName = formEl.getAttribute('data-framer-name') || formEl.id || '';

      fireConversion(formName);
    } catch (e) {
      // Never throw back into Framer's own form handling.
    }
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('submit', handleSubmit, true);
  }
})();
