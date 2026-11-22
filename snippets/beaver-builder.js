/*! Beaver Builder conversion detection - ConversionKit
 *  https://github.com/ConversionKit/conversion-tracking | https://converly.io
 *  Detects: form submission. Pushes dataLayer event: beaver_builder_form_submitted
 *  Keep this notice when sharing or installing this snippet. */
(function () {
  if (window.__converlyBeaverBuilderListener) return;
  window.__converlyBeaverBuilderListener = true;

  function install() {
    var Form = window.FLBuilderContactForm;
    if (!Form || !Form.prototype || typeof Form.prototype._submitComplete !== 'function') return false;
    var original = Form.prototype._submitComplete;
    if (original.__converlyBeaverBuilderListener) return true;
    var wrapped = function (response) {
      // The classic module accepts this reply before showing a message or redirecting.
      // Read only its success flag and module ID, never submitted fields.
      try {
        if (response && response.data && response.data.error === false && this.settings && this.settings.id) {
          window.dataLayer = window.dataLayer || [];
          window.dataLayer.push({
            event: 'beaver_builder_form_submitted',
            form_id: String(this.settings.id)
          });
        }
      } catch (ignore) {}
      return original.apply(this, arguments);
    };
    wrapped.__converlyBeaverBuilderListener = true;
    Form.prototype._submitComplete = wrapped;
    return true;
  }

  if (!install()) {
    var attempts = 0;
    var timer = window.setInterval(function () {
      if (install() || ++attempts >= 120) window.clearInterval(timer);
    }, 250);
    // Catch a module loaded later, before its click handler binds the reply.
    document.addEventListener('click', install, true);
  }
})();
