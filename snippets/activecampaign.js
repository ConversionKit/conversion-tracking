/*! ActiveCampaign conversion detection - ConversionKit
 *  https://github.com/ConversionKit/conversion-tracking | https://converly.io
 *  Detects: form submission. Pushes dataLayer event: activecampaign_form_submitted
 *  Keep this notice when sharing or installing this snippet. */
(function () {
  'use strict';
  // Install once, even if GTM injects this tag more than once on the page.
  if (window.__converlyRecipeActivecampaign) return;
  window.__converlyRecipeActivecampaign = true;
  window.dataLayer = window.dataLayer || [];

  var EVENT_NAME = 'activecampaign_form_submitted';

  // Two submit events on the same form this close together are one attempt
  // (a double click, or a re-dispatch), not two.
  var RAPID_RESUBMIT_MS = 500;

  // An attempt still undecided after this long is dropped, with anything it
  // holds. ActiveCampaign's round trip was measured at about 2.5 seconds.
  var WATCH_MS = 60000;

  // Private marker set on each ActiveCampaign reply script this tag has seen.
  // Named per snippet, so the recipe and the Method 2 snippet never read each
  // other's marks.
  var CLAIM_KEY = '__converlyRecipeActivecampaignSeen';

  // Only used by browsers WITHOUT the Navigation API (older Safari). There, a
  // page navigation counts as ActiveCampaign's redirect only if it starts
  // within this long of ActiveCampaign's response. Same window as Converly's
  // production module.
  var NAV_TRUST_MS = 4000;

  // Chrome, Edge, Firefox and Safari 26.2+ have the Navigation API, and in all
  // of them its `navigate` event fires WHILE the script that started the
  // navigation is still running. That lets this tag prove it was
  // ActiveCampaign's own response that sent the visitor to the thank-you page,
  // rather than inferring it from timing.
  var HAS_NAV_API = false;
  try {
    HAS_NAV_API = !!(window.navigation && typeof window.navigation.addEventListener === 'function');
  } catch (e) {
    HAS_NAV_API = false;
  }

  function now() { return new Date().getTime(); }

  // ============================================================
  // Which forms are ActiveCampaign forms, and which form is it?
  // ============================================================
  // ActiveCampaign renders a real <form> into the page for every style
  // (inline, modal, floating box, floating bar) and both embed options (the
  // Simple Embed script and the Full Embed paste). The stable identity across
  // all of them is the `_form _form_<id>` class pair plus a hidden input
  // `f=<id>` carrying the same number. The element id and the hidden `u` do
  // NOT carry the form id (they are a per-form hash on a Simple Embed and the
  // number on a Full Embed), so neither is used.

  // ActiveCampaign submits to https://<account>.activehosted.com/proc.php. On
  // the script path that address is followed by a query carrying everything
  // the visitor typed. Only the scheme, host and path of an address are ever
  // taken, and only through acEndpointOrigin below. The query and fragment
  // are never read, and no address is kept.
  function acEndpointOrigin(url) {
    try {
      if (typeof url !== 'string' || !url) return null;
      var u = new URL(url, document.baseURI);
      if (u.protocol !== 'https:' || u.pathname !== '/proc.php') return null;
      return u.origin;
    } catch (e) {
      return null;
    }
  }

  function classOf(el) {
    var cls = el && typeof el.className === 'string' ? el.className : '';
    if (!cls && el && el.getAttribute) {
      try { cls = el.getAttribute('class') || ''; } catch (e) { cls = ''; }
    }
    return cls;
  }

  function classFormId(formEl) {
    var cls = classOf(formEl);
    if (!/(^|\s)_form(\s|$)/.test(cls)) return null;
    var m = /(^|\s)_form_(\d+)(\s|$)/.exec(cls);
    return m ? m[2] : null;
  }

  function hiddenControlValue(formEl, name) {
    try {
      var el = formEl.querySelector('input[type="hidden"][name="' + name + '"]');
      if (!el) return null;
      // ActiveCampaign's hidden f/act controls are embed configuration, not
      // user fields. Read the literal source attribute only; never use the
      // live value property, which user controls can expose.
      return String(el.getAttribute ? (el.getAttribute('value') || '') : '');
    } catch (e) {
      return null;
    }
  }

  function numericHiddenF(formEl) {
    var f = hiddenControlValue(formEl, 'f');
    return (f !== null && /^\d+$/.test(f)) ? f : null;
  }

  // Returns { formId, host } only when the form's structural class ID agrees
  // with its configured hidden f/act controls. host is the account's
  // submission origin, taken from the form's action address (scheme, host and
  // path only); it is null when the action is not ActiveCampaign's proc.php.
  function describeForm(formEl) {
    if (!formEl || (formEl.tagName || '').toLowerCase() !== 'form') return null;
    var f = numericHiddenF(formEl);
    if (!f) return null;
    if (hiddenControlValue(formEl, 'act') !== 'sub') return null;
    if (classFormId(formEl) !== f) return null;
    var host = null;
    try { host = acEndpointOrigin(formEl.getAttribute('action') || ''); } catch (e) { host = null; }
    return { formId: f, host: host };
  }

  // ============================================================
  // Visibility and error helpers
  // ============================================================

  function isNodeHidden(el) {
    try {
      if (el.hidden) return true;
      if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return true;
      var view = el.ownerDocument && el.ownerDocument.defaultView;
      if (view && view.getComputedStyle) {
        var cs = view.getComputedStyle(el);
        if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return true;
      }
    } catch (e) {}
    return false;
  }

  // Hidden itself, or inside something hidden, up to but NOT including the
  // form. Whether the form itself is on screen (a modal the visitor closed
  // while the request was in flight, say) says nothing about the verdict.
  function isConcealed(el, form) {
    var node = el;
    var depth = 0;
    while (node && node.nodeType === 1 && node !== form && depth < 12) {
      if (isNodeHidden(node)) return true;
      node = node.parentNode;
      depth++;
    }
    return false;
  }

  // ActiveCampaign's two rejection displays. In-browser validation marks the
  // field `._has_error` and adds an `._error-inner` tooltip, and it does this
  // again as the visitor types, even after the data has been sent. A server
  // or network rejection inserts an `._error-inner._form_error` box above the
  // submit button, and ONLY ActiveCampaign's `_show_error` ever draws that.
  var ERROR_SELECTOR = '._has_error, ._error-inner';

  function collectErrorNodes(w) {
    var found = [];
    try {
      var nodes = w.form.querySelectorAll(ERROR_SELECTOR);
      for (var i = 0; i < nodes.length; i++) {
        if (!isConcealed(nodes[i], w.form)) found.push(nodes[i]);
      }
    } catch (e) {}
    return found;
  }

  function serverErrorNodes(w) {
    try { return w.form.querySelectorAll('._form_error'); } catch (e) { return []; }
  }

  function snapshotErrors(w) {
    var nodes = collectErrorNodes(w);
    w.errorsAtArm = nodes.slice ? nodes.slice() : [];
  }

  // A `._form_error` box that was not in the form when this attempt started
  // is the server's (or the network's) verdict on it. Visible or not: a site
  // can hide ActiveCampaign's error box with its own CSS, and the rejection
  // is just as real.
  function hasNewServerError(w) {
    var nodes = serverErrorNodes(w);
    for (var i = 0; i < nodes.length; i++) {
      var known = false;
      for (var j = 0; j < w.serverErrorsAtArm.length; j++) {
        if (w.serverErrorsAtArm[j] === nodes[i]) { known = true; break; }
      }
      if (!known) return true;
    }
    return false;
  }

  // An error that was already showing when this attempt started is not a
  // verdict on it. Once it goes away it is forgotten, so if it comes back it
  // counts as new (ActiveCampaign rebuilds its tooltips on every attempt).
  // Returns the visible error nodes that are new since the attempt started.
  function newErrorNodes(w) {
    var fresh = [];
    var current = collectErrorNodes(w);
    for (var i = 0; i < current.length; i++) {
      if (w.errorsAtArm.indexOf(current[i]) === -1) fresh.push(current[i]);
    }
    return fresh;
  }

  function isErrorElement(node) {
    if (!node || node.nodeType !== 1) return false;
    var cls = classOf(node);
    return /(^|\s)(?:_has_error|_error-inner|_form_error)(?:\s|$)/.test(cls);
  }

  function isInErrorTree(node, form) {
    var current = node;
    var depth = 0;
    while (current && current !== form && depth < 16) {
      if (isErrorElement(current)) return true;
      current = current.parentNode;
      depth++;
    }
    return false;
  }

  function isInNodeTree(node, ancestor) {
    var current = node;
    var depth = 0;
    while (current && depth < 16) {
      if (current === ancestor) return true;
      current = current.parentNode;
      depth++;
    }
    return false;
  }

  function noteStructuralMutations(w, records) {
    if (!records) return;
    for (var i = 0; i < records.length; i++) {
      var record = records[i];
      if (isInErrorTree(record.target, w.form)) w.errorMutated = true;
      if (w.thankYou && isInNodeTree(record.target, w.thankYou)) w.thankYouChanged = true;
      var added = record.addedNodes || [];
      for (var j = 0; j < added.length; j++) {
        if (isInErrorTree(added[j], w.form)) w.errorMutated = true;
        if (w.thankYou && isInNodeTree(added[j], w.thankYou)) w.thankYouChanged = true;
      }
    }
  }

  // ============================================================
  // Attempt tracking: one watcher per form, per submit
  // ============================================================

  var watchers = [];       // attempts still waiting for a verdict
  var replyRunning = null; // attempt whose fetch reply ActiveCampaign is running now
  var armCount = 0;
  // Counts replies and navigation starts in the order they happen. The clock
  // only has whole milliseconds, so two events in the same millisecond cannot
  // be ordered by time. This says which really came first.
  var eventCount = 0;
  var recentlyFired = [];  // forms that fired within RAPID_RESUBMIT_MS
  var beforeUnloadOn = false;

  function findWatcher(formEl) {
    for (var i = 0; i < watchers.length; i++) {
      if (watchers[i].form === formEl) return watchers[i];
    }
    return null;
  }

  function firedRecently(formEl) {
    var t = now();
    for (var i = recentlyFired.length - 1; i >= 0; i--) {
      if (t - recentlyFired[i].at >= RAPID_RESUBMIT_MS) { recentlyFired.splice(i, 1); continue; }
      if (recentlyFired[i].form === formEl) return true;
    }
    return false;
  }

  function safeCurrentScript() {
    try {
      var cs = document.currentScript;
      if (cs && cs.nodeType === 1 && (cs.tagName || '').toLowerCase() === 'script') return cs;
    } catch (e) {}
    return null;
  }

  // ---- Matching ActiveCampaign's response to the attempt that sent it ----
  //
  // ActiveCampaign submits by adding a script tag whose address is
  // https://<account>.activehosted.com/proc.php?...&f=<id>&act=sub&...&jsonp=true
  // Whatever that script does when it runs IS the server's verdict. It shows
  // the thank-you message, sends the visitor to a thank-you URL, or shows an
  // error.
  //
  // ActiveCampaign adds that script synchronously, inside the very submit
  // event it answers, so it belongs to the attempt that was armed in that same
  // event. A script is therefore matched only to an attempt armed in the
  // current task (the newest one for that account, on a form still in the
  // page). The form is known from that timing, so the script's query, which
  // also names the form, is never read. Every ActiveCampaign script this tag sees is marked the moment
  // it is seen, matched or not, so no later attempt can ever be credited with
  // an earlier reply. Once a reply has run, the mark is reduced to a plain
  // string and every reference to the script is dropped, because its address
  // carries everything the visitor typed.

  function claimOf(node) {
    try {
      var v = node[CLAIM_KEY];
      return (v && typeof v === 'object') ? v : null;
    } catch (e) {
      return null;
    }
  }

  function markNode(node, value) {
    try { node[CLAIM_KEY] = value; } catch (e) {}
  }

  // { host } for an ActiveCampaign submission script, judged by the scheme,
  // host and path of its address only.
  function isAcSubmitScript(node) {
    try {
      if (!node || node.nodeType !== 1 || (node.tagName || '').toLowerCase() !== 'script') return null;
      var origin = acEndpointOrigin(node.getAttribute('src') || '');
      return origin ? { host: origin } : null;
    } catch (e) {
      return null;
    }
  }

  function tryClaim(node) {
    try {
      if (!node || node[CLAIM_KEY] !== undefined) return claimOf(node);
    } catch (e) {
      return null;
    }
    var info = isAcSubmitScript(node);
    if (!info) return null;
    var owner = null;
    for (var i = 0; i < watchers.length; i++) {
      var w = watchers[i];
      if (!w.claimOpen || w.sent || !w.host || w.host !== info.host) continue;
      try { if (w.form.isConnected !== true) continue; } catch (e) { continue; }
      if (!owner || w.seq > owner.seq) owner = w;
    }
    if (!owner) {
      markNode(node, 'unowned');
      return null;
    }
    var claim = { node: node, watcher: owner, onLoad: null, onError: null };
    claim.onLoad = function () { onResponse(claim, 'load'); };
    claim.onError = function () { onResponse(claim, 'error'); };
    markNode(node, claim);
    owner.claim = claim;
    owner.sent = true;
    try {
      node.addEventListener('load', claim.onLoad, false);
      node.addEventListener('error', claim.onError, false);
    } catch (e) {}
    syncBeforeUnload();
    return claim;
  }

  function releaseClaim(claim, mark) {
    if (!claim || !claim.node) return;
    try {
      claim.node.removeEventListener('load', claim.onLoad, false);
      claim.node.removeEventListener('error', claim.onError, false);
    } catch (e) {}
    markNode(claim.node, mark);
    if (claim.watcher && claim.watcher.claim === claim) claim.watcher.claim = null;
    claim.node = null;
    claim.watcher = null;
  }

  function liveWatcherFor(node) {
    var claim = node ? tryClaim(node) : null;
    if (!claim || !claim.watcher || claim.watcher.done) return null;
    return claim.watcher;
  }

  function onResponse(claim, kind) {
    var w = claim && claim.watcher;
    releaseClaim(claim, 'answered');
    if (!w || w.done) return;
    if (kind === 'error') {
      // The request itself failed. ActiveCampaign shows "Sorry, your
      // submission failed" and nothing was submitted.
      finish(w);
      return;
    }
    // The response script has finished running. Anything it did (reveal the
    // thank-you, start a navigation, show an error, throw) has happened.
    w.responseAt = now();
    w.responseSeq = ++eventCount;
    evaluate(w);
    tryRedirectPath(w);
    syncBeforeUnload();
    if (!HAS_NAV_API) {
      try { setTimeout(syncBeforeUnload, NAV_TRUST_MS + 50); } catch (e) {}
    }
  }

  // ---- The thank-you signal (forms set to "Show thank you message") ----
  //
  // ActiveCampaign's `._form-thank-you` element is ALREADY in the form, empty
  // and hidden, before anyone submits. Its presence proves nothing. Success is
  // the change: hidden when this attempt started, then visible with the
  // message in it. It must still be this form's own thank-you element when we
  // look, and one that was already showing when the attempt started can never
  // count.

  function thankYouRevealed(w) {
    var node = w.thankYou;
    if (!node || !w.thankYouHiddenAtArm || w.thankYouLost) return false;
    var owned = false;
    try { owned = node.isConnected === true && w.form.querySelector('._form-thank-you') === node; } catch (e) { owned = false; }
    if (!owned) {
      w.thankYouLost = true;
      return false;
    }
    return w.thankYouChanged && !isConcealed(node, w.form);
  }

  function evaluate(w) {
    if (!w || w.done) return;
    if (thankYouRevealed(w)) {
      fire(w);
      return;
    }
    if (hasNewServerError(w)) {
      // The server (or the network) refused this attempt.
      finish(w);
      return;
    }
    if (w.responseAt && w.errorMutated) {
      finish(w);
      return;
    }
    var fresh = newErrorNodes(w);
    if (!fresh.length) return;
    if (!w.responseAt && w.sent) {
      // The request is already on its way and ActiveCampaign keeps validating
      // fields as the visitor types. A tooltip now is the visitor editing, not
      // the server's answer, so it is set aside and the response decides.
      snapshotErrors(w);
      return;
    }
    // Rejected in the browser: nothing was sent.
    finish(w);
  }

  // ---- The redirect signal (forms set to "Open URL") ----
  //
  // On success ActiveCampaign's reply sends the visitor to the thank-you URL.
  // A navigation counts only when it is proven to come from this attempt's
  // own reply: it started while that reply was running (the reply script is
  // document.currentScript, or the fetch reply below is being run), or, in
  // browsers without the Navigation API, it started after the reply and
  // within NAV_TRUST_MS of it.

  function identityStillValid(w) {
    try {
      if (!w.form || w.form.isConnected !== true) return false;
      if (numericHiddenF(w.form) !== w.formId) return false;
      return classFormId(w.form) === w.formId && numericHiddenF(w.form) === w.formId;
    } catch (e) {
      return false;
    }
  }

  function tryRedirectPath(w) {
    if (!w || w.done || !w.host || !w.responseAt || w.responseThrew) return;
    // Proof: the navigation started while this attempt's own reply was
    // running. Without the Navigation API, the fallback: a navigation that
    // starts AFTER the reply (in event order, not just by the clock), within
    // NAV_TRUST_MS of it.
    var proven = w.navByResponse;
    if (!proven && !HAS_NAV_API && w.navSeq > w.responseSeq &&
        w.navAt - w.responseAt <= NAV_TRUST_MS) {
      proven = true;
    }
    if (!proven) return;
    if (hasNewServerError(w) || newErrorNodes(w).length) {
      finish(w);
      return;
    }
    if (!identityStillValid(w)) return;
    fire(w);
  }

  // A navigation is starting. If ActiveCampaign's response script for an
  // attempt is the code running right now, that response IS the redirect.
  function onNavigationStart() {
    var cs = safeCurrentScript();
    var owner = cs ? liveWatcherFor(cs) : null;
    if (!owner && replyRunning && !replyRunning.done) owner = replyRunning;
    if (owner) {
      owner.navByResponse = true;
      // The reply is running right now, so it has arrived.
      if (!owner.responseAt) {
        owner.responseAt = now();
        owner.responseSeq = ++eventCount;
      }
    }
    var t = now();
    var seq = ++eventCount;
    var pending = watchers.slice();
    for (var i = 0; i < pending.length; i++) {
      pending[i].navAt = t;
      pending[i].navSeq = seq;
      tryRedirectPath(pending[i]);
    }
  }

  function needsBeforeUnload() {
    if (HAS_NAV_API) return false;
    var t = now();
    for (var i = 0; i < watchers.length; i++) {
      var w = watchers[i];
      if (!w.host || !w.sent) continue;
      if (!w.responseAt || t - w.responseAt <= NAV_TRUST_MS) return true;
    }
    return false;
  }

  // Only browsers without the Navigation API need `beforeunload`, and only
  // while a sent attempt could still turn out to be a redirect. It is removed
  // straight after, so it never lingers on the page.
  function syncBeforeUnload() {
    var want = needsBeforeUnload();
    if (want === beforeUnloadOn) return;
    try {
      if (want) window.addEventListener('beforeunload', onNavigationStart, true);
      else window.removeEventListener('beforeunload', onNavigationStart, true);
      beforeUnloadOn = want;
    } catch (e) {}
  }

  // ---- Firing, and tearing an attempt down ----

  function finish(w) {
    if (!w || w.done) return;
    w.done = true;
    try { if (w.observer) w.observer.disconnect(); } catch (e) {}
    w.observer = null;
    if (w.lifeTimer) {
      try { clearTimeout(w.lifeTimer); } catch (e) {}
      w.lifeTimer = null;
    }
    if (w.claim) releaseClaim(w.claim, 'answered');
    for (var i = watchers.length - 1; i >= 0; i--) {
      if (watchers[i] === w) watchers.splice(i, 1);
    }
    w.errorsAtArm = [];
    w.serverErrorsAtArm = [];
    w.thankYou = null;
    discardMethod2(w.formId, w.form);
    syncBeforeUnload();
  }

  function fire(w) {
    if (!w || w.done) return;
    var formId = w.formId;
    var formEl = w.form;
    var handled = false;
    try {
      if (typeof window.__converlyActivecampaignMethod2Emit === 'function') {
        handled = window.__converlyActivecampaignMethod2Emit(formId, formEl) === true;
      }
    } catch (e) {}
    finish(w);
    recentlyFired.push({ form: formEl, at: now() });
    if (!handled) window.dataLayer.push({ event: EVENT_NAME, form_id: formId });
  }

  // ActiveCampaign adds its script inside the submit event, so an attempt can
  // only be matched to a script during the task it was armed in. The window is
  // closed by a zero-delay timer, which runs after that task and after the
  // page observer has seen the script.
  function openClaimWindow(w) {
    w.claimOpen = true;
    try {
      setTimeout(function () { w.claimOpen = false; }, 0);
    } catch (e) {
      w.claimOpen = false;
    }
  }

  function arm(formEl, desc) {
    var w = {
      form: formEl,
      formId: desc.formId,
      host: desc.host,
      seq: ++armCount,
      armedAt: now(),
      claimOpen: false,
      claim: null,
      sent: false,
      responseAt: 0,
      responseSeq: 0,
      responseThrew: false,
      navAt: 0,
      navSeq: 0,
      navByResponse: false,
      viaFetch: false,
      done: false,
      observer: null,
      lifeTimer: null,
      errorsAtArm: [],
      serverErrorsAtArm: [],
      thankYou: null,
      thankYouHiddenAtArm: false,
      thankYouLost: false,
      thankYouChanged: false,
      errorMutated: false
    };
    snapshotErrors(w);
    var existingErrors = serverErrorNodes(w);
    for (var i = 0; i < existingErrors.length; i++) w.serverErrorsAtArm.push(existingErrors[i]);
    try { w.thankYou = formEl.querySelector('._form-thank-you'); } catch (e) { w.thankYou = null; }
    w.thankYouHiddenAtArm = !!w.thankYou && isConcealed(w.thankYou, formEl);
    watchers.push(w);
    openClaimWindow(w);
    // Nothing ActiveCampaign does takes anywhere near this long, so an attempt
    // still undecided after it is dropped, along with anything it holds.
    try { w.lifeTimer = setTimeout(function () { finish(w); }, WATCH_MS); } catch (e) {}
    try {
      w.observer = new MutationObserver(function (records) {
        noteStructuralMutations(w, records);
        evaluate(w);
      });
      w.observer.observe(formEl, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden', 'aria-hidden']
      });
    } catch (e) {
      w.observer = null;
    }
    syncBeforeUnload();
  }

  // Capture phase on the document, so this runs BEFORE ActiveCampaign's own
  // submit handler on the form. It never fires anything. It only notes that
  // an attempt started and what the form looked like at that moment.
  function handleSubmit(event) {
    try {
      var formEl = event.target;
      var desc = describeForm(formEl);
      if (!desc) return;
      if (firedRecently(formEl)) return;
      var existing = findWatcher(formEl);
      if (existing) {
        if (now() - existing.armedAt < RAPID_RESUBMIT_MS) {
          // The same attempt dispatched again (a double click, or a wrapper
          // re-sending the submit). Keep it, and let this dispatch's script
          // be matched to it if the first one sent nothing.
          beginMethod2(desc.formId, formEl);
          if (!existing.sent) openClaimWindow(existing);
          return;
        }
        // Settle the old attempt on what the page shows right now before
        // replacing it, so a success it already earned is not lost.
        evaluate(existing);
        if (!existing.done) finish(existing);
        else if (firedRecently(formEl)) return;
      }
      beginMethod2(desc.formId, formEl);
      arm(formEl, desc);
    } catch (e) {
      // Never throw back into ActiveCampaign's own form handling.
    }
  }

  function beginMethod2(formId, formEl) {
    try {
      if (typeof window.__converlyActivecampaignMethod2Begin === 'function') {
        window.__converlyActivecampaignMethod2Begin(formId, formEl);
      }
    } catch (e) {}
  }

  function discardMethod2(formId, formEl) {
    try {
      if (typeof window.__converlyActivecampaignMethod2Discard === 'function') {
        window.__converlyActivecampaignMethod2Discard(formId, formEl);
      }
    } catch (e) {}
  }

  // ---- The fetch path ----
  //
  // Some ActiveCampaign forms submit with fetch instead of a script: a POST to
  // https://<account>.activehosted.com/proc.php?jsonp=true (that address
  // carries no answers; the answers are in the body, which is never read),
  // then the reply's code is run with eval a few microtasks after its JSON
  // arrives. A POST to the attempt's own proc.php made during the submit event
  // is that attempt's request. When its reply arrives, the attempt is marked
  // as replying until the next task, which is when ActiveCampaign runs the
  // reply's code. The response itself and its body are never read.

  function claimFetch(url) {
    var origin = acEndpointOrigin(url);
    if (!origin) return null;
    var owner = null;
    for (var i = 0; i < watchers.length; i++) {
      var w = watchers[i];
      if (!w.claimOpen || w.sent || !w.host || w.host !== origin) continue;
      try { if (w.form.isConnected !== true) continue; } catch (e) { continue; }
      if (!owner || w.seq > owner.seq) owner = w;
    }
    if (owner) {
      owner.sent = true;
      owner.viaFetch = true;
    }
    return owner;
  }

  function onFetchReply(w) {
    if (!w || w.done) return;
    w.responseAt = now();
    w.responseSeq = ++eventCount;
    replyRunning = w;
    syncBeforeUnload();
    try {
      setTimeout(function () {
        if (replyRunning === w) replyRunning = null;
        evaluate(w);
        tryRedirectPath(w);
        syncBeforeUnload();
        if (!HAS_NAV_API) {
          try { setTimeout(syncBeforeUnload, NAV_TRUST_MS + 50); } catch (e) {}
        }
      }, 0);
    } catch (e) {
      replyRunning = null;
    }
  }

  function watchFetchReply(promise, w) {
    try {
      promise.then(function (res) {
        try {
          if (!res || typeof res.json !== 'function') return;
          var originalJson = res.json;
          res.json = function () {
            var p = originalJson.apply(this, arguments);
            try {
              p.then(function () { onFetchReply(w); }, function () { onFetchReply(w); });
            } catch (e) {}
            return p;
          };
        } catch (e) {}
      }, function () {
        // The request failed. ActiveCampaign shows its error; evaluate decides.
        onFetchReply(w);
      });
    } catch (e) {}
  }

  function wrapFetch() {
    var original = window.fetch;
    if (typeof original !== 'function') return;
    var wrapped = function (input, init) {
      var w = null;
      try {
        if (watchers.length) {
          var method = (init && init.method) || (input && typeof input === 'object' && input.method) || 'GET';
          var url = typeof input === 'string' ? input : (input && typeof input === 'object' ? (input.url || input.href || '') : '');
          if (String(method).toUpperCase() === 'POST') w = claimFetch(String(url));
        }
      } catch (e) {
        w = null;
      }
      var result = original.apply(this, arguments);
      if (w) watchFetchReply(result, w);
      return result;
    };
    try { window.fetch = wrapped; } catch (e) {}
  }

  // ============================================================
  // Page-level listeners, installed once
  // ============================================================

  document.addEventListener('submit', handleSubmit, true);
  wrapFetch();

  // Replies to submissions made before this tag loaded belong to nobody.
  try {
    var existingScripts = document.getElementsByTagName('script');
    for (var s = 0; s < existingScripts.length; s++) {
      if (isAcSubmitScript(existingScripts[s])) markNode(existingScripts[s], 'unowned');
    }
  } catch (e) {}

  // Match response scripts the moment ActiveCampaign adds them to the page.
  try {
    var headObserver = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes || [];
        for (var j = 0; j < added.length; j++) tryClaim(added[j]);
      }
    });
    headObserver.observe(document.head || document, { childList: true, subtree: true });
  } catch (e) {}

  // Backstop for a response script that was not matched on insertion.
  function onScriptEvent(event) {
    try {
      var claim = tryClaim(event.target);
      if (claim) onResponse(claim, event.type === 'error' ? 'error' : 'load');
    } catch (e) {}
  }
  document.addEventListener('load', onScriptEvent, true);
  document.addEventListener('error', onScriptEvent, true);

  // A response script that THROWS is never read as a redirect. That is what
  // happens when ActiveCampaign rejects a submission but cannot draw its error
  // box (for example the page has replaced the submit button). The rejection
  // is real, and nothing on screen shows it.
  window.addEventListener('error', function () {
    try {
      var w = liveWatcherFor(safeCurrentScript());
      if (w) w.responseThrew = true;
    } catch (e) {}
  }, true);

  if (HAS_NAV_API) {
    try { window.navigation.addEventListener('navigate', onNavigationStart); } catch (e) {}
  }

  // The page is going away. Browsers without the Navigation API and without
  // `beforeunload` (iOS Safari) get their last chance to see the redirect
  // here, then every attempt still waiting ends with the page.
  window.addEventListener('pagehide', function () {
    try {
      if (!HAS_NAV_API) onNavigationStart();
      var pending = watchers.slice();
      for (var i = 0; i < pending.length; i++) finish(pending[i]);
    } catch (e) {}
  }, true);
})();
