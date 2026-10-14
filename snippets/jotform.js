/*! Jotform conversion detection - ConversionKit
 *  https://github.com/ConversionKit/conversion-tracking | https://converly.io
 *  Detects: form submission. Pushes dataLayer event: jotform_form_submitted
 *  Keep this notice when sharing or installing this snippet. */
/* Jotform iframe completion listener. Reads no form answers.
 * Counts once per embedded frame on this page. */
(function () {
  'use strict';
  if (window.__converlyRecipeJotform || window.__converlyJotformMethod2Installed) return;
  window.__converlyRecipeJotform = true;
  window.__converlyJotformMethod2Installed = true;
  var completed = [];
  window.addEventListener('message', function (event) {
    if (!event.source || event.source === window) return;
    if (!/^https:\/\/(form|submit)\.jotform\.com$/.test(event.origin)) return;
    var data = event.data;
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.action !== 'submission-completed') return;
    var frames = document.querySelectorAll('iframe');
    for (var i = 0; i < frames.length; i++) {
      var frame = frames[i];
      if (frame.contentWindow !== event.source) continue;
      var match = /^https:\/\/form\.jotform\.com\/(\d+)(?:[/?#]|$)/.exec(frame.getAttribute('src') || '');
      if (!match || (data.formID != null && String(data.formID) !== match[1])) return;
      if (completed.indexOf(frame) !== -1) return;
      completed.push(frame);
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: 'jotform_form_submitted', form_id: match[1] });
      return;
    }
  });
})();
