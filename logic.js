/* Pure functions behind the DSA Sheet UI. Works as a browser global (SheetLogic) and in Node tests. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SheetLogic = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var MIN_WORDS = 8;
  var CAP_MINUTES = { FLASH: 1, SKELETON: 5, CODE: 15 };

  function allItems(topic) {
    var out = [];
    topic.sections.forEach(function (s) { out = out.concat(s.items); });
    return out;
  }

  function countDone(topic) {
    var items = allItems(topic);
    return { done: items.filter(function (i) { return i.done; }).length, total: items.length };
  }

  function isDue(row, today) {
    return !!row && row.box != null && row.next != null && row.next <= today;
  }

  function filterItems(items, chip, state, today) {
    return items.filter(function (i) {
      switch (chip) {
        case "retry": return i.badge === "retry";
        case "tryagain": return i.badge === "tryagain";
        case "notstarted": return !i.done;
        case "due": return i.parts.some(function (p) { return isDue(p.revision, today); });
        default: return true;
      }
    });
  }

  var VIEWS = { sheet: 1, concepts: 1, revise: 1, progress: 1 };

  function parseRoute(hash) {
    var h = String(hash || "").replace(/^#/, "");
    if (VIEWS[h]) return { view: h };
    var m = /^(p|c)-([a-z0-9-]+)(?:\/([a-z0-9-]+))?$/.exec(h);
    if (m) {
      var res = { view: m[1] === "p" ? "problem" : "concept", id: m[2] };
      if (m[3]) res.tab = m[3];
      return res;
    }
    return { view: "sheet" };
  }

  function editUrl(config, path) {
    return "https://github.com/" + config.repo + "/edit/" + config.branch + "/" + path;
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function localISO(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  return {
    allItems: allItems, countDone: countDone, isDue: isDue, filterItems: filterItems,
    parseRoute: parseRoute, editUrl: editUrl, localISO: localISO,
    groupConcepts: groupConcepts,
    gateMode: gateMode, wordCount: wordCount, canCheck: canCheck, suggestGrade: suggestGrade,
    logLine: logLine, makeStore: makeStore, MIN_WORDS: MIN_WORDS, suggestFor: suggestFor,
    dueQueue: dueQueue, familiesUngraded: familiesUngraded, capMinutes: capMinutes,
  };


  function capMinutes(today) {
    var p = today.split("-").map(Number);
    var day = new Date(p[0], p[1] - 1, p[2]).getDay();
    return day === 0 || day === 6 ? 60 : 30;
  }

  function dueQueue(rows, today) {
    var due = rows.filter(function (r) { return isDue(r, today); });
    var byDate = {};
    due.forEach(function (r) { (byDate[r.next] = byDate[r.next] || []).push(r); });
    var ordered = [];
    Object.keys(byDate).sort().forEach(function (d) {
      // Within one date, order family by family in sequence (F1 -> F2 -> F3...)
      // and in REVISION.md row order so anchors precede deltas.
      var list = byDate[d].slice().sort(function (a, b) {
        var fDiff = famOrder(a.family, b.family);
        if (fDiff !== 0) return fDiff;
        var sA = a.seq != null ? a.seq : 0;
        var sB = b.seq != null ? b.seq : 0;
        return sA !== sB ? sA - sB : (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
      });
      ordered = ordered.concat(list);
    });
    var cap = capMinutes(today), used = 0, tonight = [], later = [];
    ordered.forEach(function (r) {
      var m = CAP_MINUTES[r.tier] || 5;
      if (!tonight.length || (used + m <= cap && !later.length)) { tonight.push(r); used += m; }
      else later.push(r);
    });
    return { tonight: tonight, later: later };
  }

  function famOrder(a, b) { return parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10); }

  function familiesUngraded(rows) {
    var fams = {};
    rows.filter(function (r) { return r.box == null; }).forEach(function (r) {
      (fams[r.family] = fams[r.family] || { family: r.family, familyName: r.familyName, rows: [] }).rows.push(r);
    });
    return Object.keys(fams).sort(famOrder).map(function (k) {
      var obj = fams[k];
      obj.rows.sort(function (a, b) {
        var sA = a.seq != null ? a.seq : 0;
        var sB = b.seq != null ? b.seq : 0;
        return sA !== sB ? sA - sB : (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
      });
      return obj;
    });
  }


  function gateMode(part, item, lastGrade) {
    if (!part || part.mode !== "ladder") return "light";
    var rev = part.revision;
    if (item.badge === "retry" || item.badge === "tryagain") return "gated";
    if (!rev || rev.box == null || rev.box <= 2) return "gated";
    if (lastGrade === 0 || lastGrade === 1) return "gated";
    return "quick";
  }

  function wordCount(text) {
    var t = String(text || "").trim();
    return t ? t.split(/\s+/).length : 0;
  }

  function canCheck(text) { return wordCount(text) >= MIN_WORDS; }

  function suggestGrade(opened) {
    if (opened.has("skipped")) return 0;
    if (opened.has("idea")) return 1;
    if (opened.has("trigger")) return 2;
    return 3;
  }

  // Only the gated flow measures hints before an attempt, so only it can suggest a grade honestly.
  function suggestFor(mode, opened) { return mode === "gated" ? suggestGrade(opened) : null; }

  function logLine(dateISO, label, grade, opened) {
    var hints = opened.has("skipped") ? "skipped" : opened.has("idea") ? "idea" : opened.has("trigger") ? "trigger" : "none";
    return dateISO + " · " + label + " · grade " + grade + " · hints: " + hints;
  }

  function makeStore(storage) {
    var mem = {};
    return {
      get: function (key, fallback) {
        if (Object.prototype.hasOwnProperty.call(mem, key)) return mem[key];
        try {
          var raw = storage ? storage.getItem(key) : null;
          return raw == null ? fallback : JSON.parse(raw);
        } catch (e) { return fallback; }
      },
      set: function (key, value) {
        mem[key] = value;
        try { if (storage) storage.setItem(key, JSON.stringify(value)); } catch (e) { /* memory copy still works */ }
      },
    };
  }

  function groupConcepts(concepts) {
    var order = [["patterns", "Patterns & intuitions"], ["guides", "Topic guides"], ["howto", "How I code"]];
    return order.map(function (g) {
      return { group: g[0], label: g[1], concepts: concepts.filter(function (c) { return c.group === g[0]; }) };
    }).filter(function (g) { return g.concepts.length; });
  }
});
