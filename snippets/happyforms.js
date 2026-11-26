/*! HappyForms conversion detection - ConversionKit
 *  https://github.com/ConversionKit/conversion-tracking | https://converly.io
 *  Detects: form submission. Pushes dataLayer event: happyforms_form_submitted
 *  Keep this notice when sharing or installing this snippet. */
(function () {
  if (window.__converlyHappyFormsListener) return;
  window.__converlyHappyFormsListener = true;

  function install() {
    var $ = window.jQuery;
    if (!$ || !$.fn || !$.fn.on) return false;
    $(document).on('happyforms.submitted.converlyHappyForms', '.happyforms-form form', function (event, response) {
      // HappyForms also sends this callback for rejected submissions.
      // Require its accepted reply and final confirmation, not the callback alone.
      if (!response || response.success !== true || !response.data ||
          typeof response.data.html !== 'string' || this.__converlyHappyFormsAccepted) return;
      var id = /^happyforms-form-(\d+)$/.exec(this.id || '');
      if (!id) return;
      try {
        // Parse only to find the confirmation structure. Never read input values
        // or message text, and never insert the reply into the live document.
        var reply = new DOMParser().parseFromString(response.data.html, 'text/html');
        var wrapper = reply.getElementById('happyforms-' + id[1]);
        if (!wrapper || !wrapper.querySelector('.happyforms-message-notice.success')) return;
        this.__converlyHappyFormsAccepted = true;
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ event: 'happyforms_form_submitted', form_id: id[1] });
      } catch (ignore) {}
    });
    return true;
  }

  if (!install()) {
    var attempts = 0;
    var timer = window.setInterval(function () {
      if (install() || ++attempts >= 120) window.clearInterval(timer);
    }, 250);
  }
})();
