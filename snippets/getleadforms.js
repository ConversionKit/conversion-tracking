/*! LeadCapture.io conversion detection - ConversionKit
 *  https://github.com/ConversionKit/conversion-tracking | https://converly.io
 *  Detects: form submission. Pushes dataLayer event: getleadforms_form_submitted
 *  Keep this notice when sharing or installing this snippet. */
(function() {
  'use strict';
  if (window.__converlyRecipeGetLeadForms) return;
  window.__converlyRecipeGetLeadForms = true;
  var counted = new Set();
  var records = new WeakMap();
  var activity = 0;
  function interaction(event) {
    if (event.type === 'keydown' && event.key !== 'Enter') return;
    var target = event.target;
    var form = target && target.closest && target.closest('form.lc-form');
    if (!form) return;
    var instance = form.closest('.lc-form-container') || form;
    form = instance === form ? form : instance.querySelector('form.lc-form');
    if (!form || form.querySelector('button.lc-button:disabled')) return;
    records.set(instance, ++activity);
  }
  function onSuccess(event) {
    try {
      var detail = event.detail;
      if (!detail || Object.prototype.toString.call(detail) !== '[object Object]') return;
      var proto = Object.getPrototypeOf(detail);
      if (proto !== null && proto !== Object.prototype) return;
      if (typeof detail.funnelId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(detail.funnelId) ||
          typeof detail.leadId !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(detail.leadId) || counted.has(detail.leadId)) return;
      var forms = document.querySelectorAll('form.lc-form');
      var selected = null;
      var lastActivity = -1;
      for (var i = 0; i < forms.length; i++) {
        if (forms[i].id !== 'lc-form-' + detail.funnelId) continue;
        var instance = forms[i].closest('.lc-form-container') || forms[i];
        var last = records.get(instance) || 0;
        if (last > lastActivity) { selected = instance; lastActivity = last; }
      }
      if (!selected) return;
      var context = { event: 'getleadforms_form_submitted' };
      var container = selected.closest('.lc-form-container');
      var shortId = container && container.getAttribute('data-funnel-id');
      if (shortId && /^[A-Za-z0-9_-]{4,64}$/.test(shortId)) context.form_id = shortId;
      counted.add(detail.leadId);
      records.delete(selected);
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(context);
    } catch (e) {  }
  }
  ['input', 'change', 'click', 'keydown'].forEach(function(type) {
    document.addEventListener(type, interaction, true);
  });
  document.addEventListener('leadcapture:submitted', onSuccess, true);
})();
