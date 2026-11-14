/* Password lock for DSA Sheet: AES-256-GCM with a key derived from the password by PBKDF2-SHA256.
 * Same code runs in the browser (window.SheetCrypto) and in Node >= 19 (tests, tools/encrypt_site.mjs).
 * Payload: {"v":1,"alg":"AES-GCM","kdf":"PBKDF2-SHA256","iter":N,"salt":b64,"iv":b64,"ct":b64}
 * where ct is the ciphertext with the 16-byte GCM tag appended (WebCrypto's layout). */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SheetCrypto = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULT_ITER = 600000;

  function subtle() {
    var c = (typeof globalThis !== "undefined" && globalThis.crypto) || null;
    if (!c || !c.subtle) throw new Error("This browser can't unlock the sheet (Web Crypto is unavailable).");
    return c;
  }

  function toB64(bytes) {
    var bin = "";
    var u8 = new Uint8Array(bytes);
    for (var i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    return btoa(bin);
  }

  function fromB64(b64) {
    var bin = atob(String(b64 || ""));
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  async function deriveKey(password, saltB64, iter) {
    var c = subtle();
    var base = await c.subtle.importKey("raw", new TextEncoder().encode(String(password)), "PBKDF2", false, ["deriveKey"]);
    return c.subtle.deriveKey(
      { name: "PBKDF2", salt: fromB64(saltB64), iterations: iter || DEFAULT_ITER, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  }

  async function encryptPayload(plaintext, password, saltB64, iter) {
    var c = subtle();
    var n = iter || DEFAULT_ITER;
    var key = await deriveKey(password, saltB64, n);
    var iv = c.getRandomValues(new Uint8Array(12));
    var ct = await c.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, new TextEncoder().encode(String(plaintext)));
    return { v: 1, alg: "AES-GCM", kdf: "PBKDF2-SHA256", iter: n, salt: saltB64, iv: toB64(iv), ct: toB64(ct) };
  }

  async function decryptPayload(payload, key) {
    var c = subtle();
    var pt = await c.subtle.decrypt({ name: "AES-GCM", iv: fromB64(payload.iv) }, key, fromB64(payload.ct));
    return new TextDecoder().decode(pt);
  }

  async function exportKey(key) {
    return toB64(await subtle().subtle.exportKey("raw", key));
  }

  async function importKey(b64) {
    return subtle().subtle.importKey("raw", fromB64(b64), { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
  }

  // Never throws: a wrong password, a corrupt payload or a missing Web Crypto all come back as {ok:false}.
  async function tryUnlock(payload, password, saltB64, iter) {
    try {
      var key = await deriveKey(password, saltB64, iter);
      return { ok: true, key: key, text: await decryptPayload(payload, key) };
    } catch (e) {
      return { ok: false };
    }
  }

  // Same, with a key remembered on this device (base64 raw). A stale key (password changed) fails cleanly.
  async function tryUnlockWithKey(payload, keyB64) {
    try {
      var key = await importKey(keyB64);
      return { ok: true, key: key, text: await decryptPayload(payload, key) };
    } catch (e) {
      return { ok: false };
    }
  }

  return {
    DEFAULT_ITER: DEFAULT_ITER,
    tryUnlock: tryUnlock,
    tryUnlockWithKey: tryUnlockWithKey,
    deriveKey: deriveKey,
    encryptPayload: encryptPayload,
    decryptPayload: decryptPayload,
    exportKey: exportKey,
    importKey: importKey,
  };
});
