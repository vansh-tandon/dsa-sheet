/* DSA Sheet lock screen.
 * - Local development: data.js defines window.SHEET, so the app boots straight away.
 * - Deployed site: only data.enc.json exists. A key remembered on this device unlocks it silently;
 *   otherwise the password screen asks once. A remembered key that stops working (password changed)
 *   is deleted and the password screen is shown again. */
(function () {
  "use strict";
  var KEY = "sheet:unlock:key";

  function storage() { try { return window.localStorage; } catch (e) { return null; } }
  function getKey() { try { var s = storage(); return s ? s.getItem(KEY) : null; } catch (e) { return null; } }
  function setKey(v) {
    try {
      var s = storage();
      if (!s) return;
      if (v) s.setItem(KEY, v); else s.removeItem(KEY);
    } catch (e) { /* storage blocked: the password will be asked each visit */ }
  }

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "class") n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }

  function lockDevice() { setKey(null); location.reload(); }

  function boot(text, locked) {
    try {
      if (text != null) window.SHEET = JSON.parse(text);
      window.SheetBoot(locked ? { lock: lockDevice } : {});
    } catch (e) {
      // e.g. a cached older app.js paired with newer data right after a deploy. Never leave a blank page.
      showMessage("Couldn't open the sheet. Reload in a minute; if it keeps failing, forget this device and unlock again.",
        locked ? [el("button", { type: "button", class: "primary", text: "Reload" }, []),
                  el("button", { type: "button", class: "topbar-logout", text: "Forget this device" }, [])] : null);
      if (window.console) console.error(e);
    }
  }

  function setNavHidden(hidden) {
    var seg = document.querySelector(".seg");
    if (seg) seg.hidden = hidden;
  }

  function showMessage(text, buttons) {
    setNavHidden(true);
    var box = el("div", { class: "auth-box" }, [el("h1", { text: "DSA Sheet" }), el("p", { class: "muted small", text: text })]);
    if (buttons) {
      buttons[0].addEventListener("click", function () { location.reload(); });
      buttons[1].addEventListener("click", lockDevice);
      box.appendChild(el("div", { class: "check-row" }, buttons));
    }
    document.getElementById("app").replaceChildren(box);
  }

  function showLock(payload) {
    setNavHidden(true);
    var input = el("input", { type: "password", id: "unlock-password", class: "auth-input",
      autocomplete: "current-password", autocapitalize: "off", spellcheck: "false", required: "" });
    var remember = el("input", { type: "checkbox", id: "unlock-remember" });
    remember.checked = true;
    var status = el("div", { class: "auth-status", role: "status" });
    var button = el("button", { type: "submit", class: "primary auth-submit-btn", text: "Unlock" });
    var form = el("form", { class: "auth-box", novalidate: "" }, [
      el("h1", { text: "DSA Sheet" }),
      el("label", { for: "unlock-password", class: "muted small", text: "Password" }),
      el("div", { class: "auth-input-wrap" }, [input]),
      el("label", { class: "small unlock-remember" }, [remember, document.createTextNode(" Remember this device")]),
      button,
      status
    ]);
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!input.value) { status.textContent = "Type your password."; status.className = "auth-status error"; return; }
      button.disabled = true;
      status.textContent = "Unlocking…";
      status.className = "auth-status info";
      var r = await window.SheetCrypto.tryUnlock(payload, input.value, payload.salt, payload.iter);
      if (!r.ok) {
        button.disabled = false;
        status.textContent = "That password didn't work.";
        status.className = "auth-status error";
        input.select();
        return;
      }
      if (remember.checked) {
        try { setKey(await window.SheetCrypto.exportKey(r.key)); } catch (err) { /* remember is best-effort */ }
      }
      boot(r.text, true);
    });
    document.getElementById("app").replaceChildren(form);
    input.focus();
  }

  async function main() {
    // Older builds kept the GitHub token in localStorage (shared by every *.github.io page of the
    // account). Remove it on every load, before anything else, even if this device never unlocks.
    try { if (window.SheetGitHub) window.SheetGitHub.clearLegacyToken(window.localStorage); } catch (e) { /* blocked */ }
    if (window.SHEET) { boot(null, false); return; }
    var payload;
    try {
      var res = await fetch("data.enc.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      payload = await res.json();
    } catch (e) {
      showMessage("Couldn't load the sheet. Check your connection and reload.");
      return;
    }
    var remembered = getKey();
    if (remembered) {
      var r = await window.SheetCrypto.tryUnlockWithKey(payload, remembered);
      if (r.ok) { boot(r.text, true); return; }
      setKey(null);
    }
    showLock(payload);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", main);
  else main();
})();
