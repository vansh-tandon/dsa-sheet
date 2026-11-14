/* GitHub API integration & Leitner sync engine for DSA Sheet.
 * Works in Node tests and as window.SheetGitHub in browser.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SheetGitHub = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var INTERVALS = { 1: 2, 2: 6, 3: 14, 4: 30, 5: 60 };
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function b64DecodeUnicode(str) {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(str, "base64").toString("utf8");
    }
    var binary = atob(String(str || "").replace(/\s/g, ""));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder("utf-8").decode(bytes);
  }

  function b64EncodeUnicode(str) {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(str, "utf8").toString("base64");
    }
    var bytes = new TextEncoder().encode(str);
    var binary = "";
    for (var i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function addDays(isoDateStr, numDays) {
    var parts = String(isoDateStr || "").split("-").map(function (p) { return parseInt(p, 10); });
    if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
      return null;
    }
    var d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    d.setUTCDate(d.getUTCDate() + numDays);
    return d;
  }

  function formatNextDate(dateObj) {
    if (!dateObj) return "";
    return MONTHS[dateObj.getUTCMonth()] + " " + dateObj.getUTCDate();
  }

  function parseLogLine(line) {
    // Format: "YYYY-MM-DD · <Label> · grade <G> · hints: <H>"
    var parts = String(line || "").split(" · ");
    if (parts.length < 4) return null;
    var date = parts[0].trim();
    var label = parts[1].trim();
    var gradeMatch = /grade\s+(\d+)/.exec(parts[2]);
    var grade = gradeMatch ? parseInt(gradeMatch[1], 10) : null;
    var hintsMatch = /hints:\s*(\w+)/.exec(parts[3]);
    var hints = hintsMatch ? hintsMatch[1].trim() : "none";
    if (grade == null) return null;
    return { date: date, label: label, grade: grade, hints: hints };
  }

  function cleanCellLabel(cellText) {
    var head = String(cellText || "").split(" — ")[0];
    return head.replace(/[*]|🚨|🔄|⏭/g, "").replace(/\s+/g, " ").trim();
  }

  // Same rule as tools/sheet/text.py::slug, so the site and the Python build agree on row keys.
  function slug(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  var LEDGER_HEADING = "## 7. Applied log";
  var FAMILY_RE = /^### F\d+ · /;

  // A problem is graded once per day: the ledger key is date + row key, not the whole line, so
  // changing the grade (or hints) after a sync, or logging it on a second device, can't promote twice.
  function eventKey(log) { return log.date + "|" + slug(log.label); }

  function ledgerLines(lines) {
    var at = lines.indexOf(LEDGER_HEADING);
    var done = {};
    if (at === -1) return done;
    for (var i = at + 1; i < lines.length && !/^#{1,6} /.test(lines[i]); i++) {
      var m = /^- (.+)$/.exec(lines[i]);
      var log = m ? parseLogLine(m[1].trim()) : null;
      if (log) done[eventKey(log)] = true;
    }
    return done;
  }

  function nextFor(log, curBox, todayDate) {
    if (log.grade >= 2) {
      var box = curBox + 1;
      if (box >= 6) return { box: 6, next: "" };
      return { box: box, next: formatNextDate(addDays(log.date || todayDate, INTERVALS[box] || 2)) };
    }
    return { box: 1, next: formatNextDate(addDays(log.date || todayDate, 2)) };
  }

  /* Apply tonight's log lines to REVISION.md.
   * - Rows are matched by exact slug(label), only inside "### F<n> · " family tables.
   * - Every applied line is recorded under "## 7. Applied log"; a line already recorded there is never
   *   applied again, so re-syncing (from any device) is a no-op.
   * Returns {md, applied, already, unmatched}. */
  function applyLogToRevision(revisionMd, logLines, todayDate) {
    var lines = String(revisionMd || "").split("\n");
    var done = ledgerLines(lines);
    var result = { md: String(revisionMd || ""), applied: [], already: [], unmatched: [] };
    var pending = [];
    (logLines || []).forEach(function (raw) {
      var line = String(raw || "").trim();
      var log = parseLogLine(line);
      if (!log) return;
      if (done[eventKey(log)]) result.already.push(line);
      else {
        done[eventKey(log)] = true; // two lines for the same problem and day in one batch: first wins
        pending.push({ line: line, log: log, key: slug(log.label), hit: false });
      }
    });
    if (!pending.length) return result;

    var inFamily = false;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (/^#{1,6} /.test(l)) { inFamily = FAMILY_RE.test(l); continue; }
      if (!inFamily || l.indexOf("|") !== 0) continue;
      var cells = l.split("|");
      if (cells.length < 6) continue;
      var key = slug(cleanCellLabel(cells[1]));
      for (var j = 0; j < pending.length; j++) {
        var p = pending[j];
        if (p.hit || p.key !== key) continue;
        var cur = /^\d+$/.test(cells[3].trim()) ? parseInt(cells[3].trim(), 10) : 0;
        var nx = nextFor(p.log, cur, todayDate);
        cells[3] = " " + nx.box + " ";
        cells[4] = nx.next ? " " + nx.next + " " : "   ";
        lines[i] = cells.join("|");
        p.hit = true;
        break;
      }
    }

    pending.forEach(function (p) { (p.hit ? result.applied : result.unmatched).push(p.line); });
    if (!result.applied.length) return result;

    var at = lines.indexOf(LEDGER_HEADING);
    var add = result.applied.map(function (x) { return "- " + x; });
    if (at === -1) {
      while (lines.length && lines[lines.length - 1] === "") lines.pop();
      lines = lines.concat(["", LEDGER_HEADING], add, [""]);
    } else {
      var end = at + 1;
      while (end < lines.length && !/^#{1,6} /.test(lines[end])) end++;
      var last = end;
      while (last > at + 1 && lines[last - 1].trim() === "") last--;
      lines.splice.apply(lines, [last, 0].concat(add));
    }
    result.md = lines.join("\n");
    return result;
  }

  async function validateToken(token, expectedOwner, fetchImpl) {
    var f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
    if (!f) return { ok: false, error: "No fetch implementation available" };
    if (!token || !token.trim()) return { ok: false, error: "Token is required" };

    try {
      var userRes = await f("https://api.github.com/user", {
        headers: {
          Authorization: "Bearer " + token.trim(),
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "DSA-Sheet-Auth"
        }
      });
      if (!userRes.ok) {
        var errBody = await userRes.json().catch(function () { return {}; });
        return { ok: false, error: errBody.message || ("GitHub API returned status " + userRes.status) };
      }
      var user = await userRes.json();
      if (expectedOwner && user.login.toLowerCase() !== expectedOwner.toLowerCase()) {
        return {
          ok: false,
          error: "Token belongs to @" + user.login + ", but this sheet belongs to @" + expectedOwner + "."
        };
      }

      // Also verify repository access if expectedOwner provided
      if (expectedOwner) {
        var repoRes = await f("https://api.github.com/repos/" + expectedOwner + "/DSA", {
          headers: {
            Authorization: "Bearer " + token.trim(),
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "DSA-Sheet-Auth"
          }
        });
        if (!repoRes.ok) {
          return { ok: false, error: "Token does not have access to repository " + expectedOwner + "/DSA." };
        }
      }

      return {
        ok: true,
        user: {
          login: user.login,
          name: user.name || user.login,
          avatar_url: user.avatar_url
        }
      };
    } catch (e) {
      return { ok: false, error: e.message || "Network error while connecting to GitHub API" };
    }
  }

  var LEGACY_KEYS = ["sheet:github:pat", "sheet:github:user"];

  /* Earlier builds kept the token in localStorage, which every *.github.io page of the same
   * account can read. Remove it. Returns true if anything was removed; never throws. */
  function clearLegacyToken(storage) {
    var removed = false;
    if (!storage) return false;
    LEGACY_KEYS.forEach(function (k) {
      try {
        if (storage.getItem(k) != null) { storage.removeItem(k); removed = true; }
      } catch (e) { /* storage blocked: nothing to clear */ }
    });
    return removed;
  }

  var MAX_ATTEMPTS = 3;

  function isConflict(status, message) {
    return status === 409 || (status === 422 && /sha/i.test(String(message || "")));
  }

  /* GET REVISION.md, apply the log, PUT it back with the file's sha.
   * If GitHub says the file changed meanwhile (409, or 422 about the sha), re-read and re-apply,
   * up to MAX_ATTEMPTS times. Because applied lines are recorded in the file's Applied log,
   * re-applying never double-promotes. */
  async function syncRevisionToGitHub(token, repo, branch, logLines, todayDate, fetchImpl) {
    var f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
    if (!f) return { ok: false, error: "No fetch implementation available", attempts: 0 };
    if (!token) return { ok: false, error: "Not connected to GitHub", attempts: 0 };
    if (!logLines || !logLines.length) return { ok: false, error: "Nothing in tonight's log to sync", attempts: 0 };
    var ref = branch || "main";
    var headers = {
      Authorization: "Bearer " + String(token).trim(),
      Accept: "application/vnd.github.v3+json"
    };
    var last = null;

    for (var attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        var getRes = await f("https://api.github.com/repos/" + repo + "/contents/REVISION.md?ref=" + encodeURIComponent(ref),
          { headers: headers, cache: "no-store" });
        if (!getRes.ok) {
          var getErr = await getRes.json().catch(function () { return {}; });
          return { ok: false, attempts: attempt, error: getErr.message || ("Couldn't read REVISION.md (HTTP " + getRes.status + ")") };
        }
        var fileData = await getRes.json();
        var result = applyLogToRevision(b64DecodeUnicode(fileData.content), logLines, todayDate);
        last = result;
        if (!result.applied.length) {
          return { ok: true, noop: true, attempts: attempt, applied: [], already: result.already, unmatched: result.unmatched };
        }
        var putRes = await f("https://api.github.com/repos/" + repo + "/contents/REVISION.md", {
          method: "PUT",
          headers: Object.assign({ "Content-Type": "application/json" }, headers),
          body: JSON.stringify({
            message: "Revise log: " + todayDate + " (" + result.applied.length + " applied via DSA Sheet)",
            content: b64EncodeUnicode(result.md),
            sha: fileData.sha,
            branch: ref
          })
        });
        if (putRes.ok) {
          var putData = await putRes.json();
          return {
            ok: true, attempts: attempt,
            applied: result.applied, already: result.already, unmatched: result.unmatched,
            commitSha: putData.commit ? putData.commit.sha : null,
            commitUrl: putData.commit ? putData.commit.html_url : null
          };
        }
        var putErr = await putRes.json().catch(function () { return {}; });
        if (!isConflict(putRes.status, putErr.message)) {
          return { ok: false, attempts: attempt, error: putErr.message || ("Couldn't save REVISION.md (HTTP " + putRes.status + ")") };
        }
      } catch (e) {
        return { ok: false, attempts: attempt, error: e.message || "Network error while syncing to GitHub" };
      }
    }
    return {
      ok: false, attempts: MAX_ATTEMPTS,
      error: "REVISION.md kept changed on GitHub while syncing. Try again in a minute.",
      applied: [], already: last ? last.already : [], unmatched: last ? last.unmatched : []
    };
  }

  return {
    INTERVALS: INTERVALS,
    MONTHS: MONTHS,
    b64DecodeUnicode: b64DecodeUnicode,
    b64EncodeUnicode: b64EncodeUnicode,
    addDays: addDays,
    formatNextDate: formatNextDate,
    parseLogLine: parseLogLine,
    cleanCellLabel: cleanCellLabel,
    slug: slug,
    LEDGER_HEADING: LEDGER_HEADING,
    clearLegacyToken: clearLegacyToken,
    applyLogToRevision: applyLogToRevision,
    validateToken: validateToken,
    syncRevisionToGitHub: syncRevisionToGitHub
  };
});
