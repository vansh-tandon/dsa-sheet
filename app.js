/* DSA Sheet: router and views. Data comes from window.SHEET (plain data.js when developing locally, or
 * decrypted by unlock.js on the deployed site); pure logic from logic.js. unlock.js calls SheetBoot(). */
window.SheetBoot = function (opts) {
  "use strict";
  opts = opts || {};
  var S = window.SHEET;
  var L = window.SheetLogic;
  var app = document.getElementById("app");
  var today = L.localISO(new Date());
  var ui = { chip: "all", open: {} };

  var BADGE_TEXT = { retry: "🚨 Retry", tryagain: "🔄 Try again", star: "⭐", thumbs: "👍", solved: "✅", skipped: "⏭" };

  /* ---------- tiny DOM helpers (text only goes through textContent) ---------- */
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "text") el.textContent = v;
      else if (k === "class") el.className = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    });
    [].concat(kids || []).forEach(function (c) {
      if (c == null || c === false) return;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return el;
  }
  function badge(item) {
    if (!item.badge || item.badge === "none") return null;
    return h("span", { class: "pill " + item.badge, text: BADGE_TEXT[item.badge] || item.badgeLabel });
  }
  function ext(url, label) {
    return url ? h("a", { class: "ext", href: url, target: "_blank", rel: "noopener", "aria-label": label, text: "↗" }) : null;
  }
  function editLink(path, text) {
    return h("a", { class: "edit", href: L.editUrl(S.config, path), target: "_blank", rel: "noopener", text: text || "Edit on GitHub" });
  }
  function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }
  function bar(p) { return h("div", { class: "bar", role: "presentation" }, h("i", { style: "width:" + p + "%" })); }

  /* ---------- index ---------- */
  var itemsById = {};
  S.topics.forEach(function (t) {
    t.sections.forEach(function (s) { s.items.forEach(function (i) { itemsById[i.id] = { item: i, topic: t, section: s }; }); });
  });
  window.SheetIndex = itemsById;

  var conceptsById = {};
  S.concepts.forEach(function (c) { conceptsById[c.id] = c; });

  var TOPIC_GUIDES = {
    recursion: [
      "intuitions--the-4-universal-flavours-of-recursion-mental-framework",
      "intuitions--recursion-backtracking-patterns-print-all-print-any-one-boolean-short-circuit-and-count",
      "intuitions--all-indices-in-array-two-way-recursion-dynamic-array-allocation-masterclass",
      "java-cheatsheet--arraylist"
    ]
  };

  /* ---------- Sheet ---------- */
  var CHIPS = [["all", "All"], ["retry", "🚨 Must retry"], ["tryagain", "🔄 Try again"], ["due", "Due"], ["notstarted", "Not started"]];

  function itemRow(i) {
    return h("div", { class: "row" }, [
      h("span", { class: "check" + (i.done ? " on" : ""), "aria-label": i.done ? "Done" : "Not done", text: i.done ? "✓" : "" }),
      h("a", { class: "name", href: "#p-" + i.id, text: i.name }),
      h("span", { class: "meta" }, [i.difficulty ? h("span", { class: "diff-" + i.difficulty, text: i.difficulty }) : null, badge(i)]),
      ext(i.url, "Open problem")
    ]);
  }

  function viewSheet() {
    var p = S.progress;
    var frag = [
      h("section", { class: "summary" }, [
        h("div", {}, [h("span", { class: "big num", text: p.done + " / " + p.total }), " ",
          h("span", { class: "muted", text: "solved · " + pct(p.done, p.total) + "%" })]),
        bar(pct(p.done, p.total))
      ]),
      h("div", { class: "chips", role: "group", "aria-label": "Filter" }, CHIPS.map(function (c) {
        return h("button", { class: "chip", type: "button", "aria-pressed": String(ui.chip === c[0]),
          onclick: function () { ui.chip = c[0]; render(); }, text: c[1] });
      }))
    ];
    var list = h("div", { class: "topics" });
    var shown = 0;
    S.topics.forEach(function (t) {
      var c = L.countDone(t);
      var filtering = ui.chip !== "all";
      var sections = t.sections.map(function (s) {
        return { s: s, items: L.filterItems(s.items, ui.chip, {}, today) };
      }).filter(function (x) { return x.items.length; });
      if (filtering && !sections.length) return;
      shown++;
      var open = filtering || !!ui.open[t.id];
      var guideIds = TOPIC_GUIDES[t.id] || [];
      if (!Array.isArray(guideIds)) guideIds = [guideIds];
      var topicGuides = guideIds.map(function (gid) {
        var gc = conceptsById[gid];
        if (!gc) return null;
        return h("div", { class: "topic-guide-card" }, [
          h("div", { class: "topic-guide-info" }, [
            h("span", { class: "topic-guide-badge", text: "🧠 Concept" }),
            h("a", { class: "topic-guide-title", href: "#c-" + gc.id, text: gc.title })
          ]),
          h("a", { class: "btn small primary", href: "#c-" + gc.id, text: "Read ›" })
        ]);
      }).filter(Boolean);
      var bodyItems = topicGuides.concat(sections.map(function (x) {
        return h("div", {}, [x.s.name ? h("div", { class: "sub", text: x.s.name }) : null].concat(x.items.map(itemRow)));
      })).concat([h("div", { style: "padding-top:8px" }, editLink("roadmap.md", "Edit roadmap.md on GitHub"))]);
      var body = open ? h("div", { class: "topic-body" }, bodyItems) : null;
      list.appendChild(h("div", { class: "topic" }, [
        h("button", { class: "topic-head", type: "button", "aria-expanded": String(open),
          onclick: function () { ui.open[t.id] = !ui.open[t.id]; render(); } }, [
          h("span", { class: "topic-name", text: t.name }),
          h("span", { class: "muted num small", text: c.done + "/" + c.total }),
          bar(pct(c.done, c.total))
        ]),
        body
      ]));
    });
    if (!shown) list.appendChild(h("p", { class: "empty", text: "Nothing matches this filter." }));
    frag.push(list);
    return frag;
  }

  /* ---------- Progress ---------- */
  function viewProgress() {
    var p = S.progress;
    var months = Object.keys(p.byMonth).sort();
    var max = Math.max.apply(null, months.map(function (m) { return p.byMonth[m]; }).concat([1]));
    var MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    if (months.length) {
      var y = +months[0].slice(0, 4), mo = +months[0].slice(5, 7), last = months[months.length - 1], all = [];
      while (true) {
        var key = y + "-" + (mo < 10 ? "0" : "") + mo;
        all.push(key);
        if (key >= last) break;
        mo++; if (mo > 12) { mo = 1; y++; }
      }
      months = all;
    }
    return [
      h("h1", { text: "Progress" }),
      h("div", { class: "stats" }, [
        h("div", {}, [h("span", { class: "big num", style: "font-size:26px;font-weight:600", text: String(p.done) }),
          h("span", { class: "muted", text: " of " + p.total + " solved" })]),
        h("div", { class: "muted", text: p.topicsStarted + " of " + S.topics.length + " topics started" })
      ]),
      h("div", { class: "label", text: "Logged in tracker, by month" }),
      h("div", { class: "months", role: "img", "aria-label": "Tracker entries per month" }, months.map(function (m) {
        var n = p.byMonth[m] || 0;
        return h("div", { class: "month" }, [
          h("span", { class: "num", text: n ? String(n) : "" }),
          h("div", { class: "col", style: n ? "height:" + Math.max(2, Math.round((n / max) * 100)) + "%" : "height:0;min-height:0" }),
          h("span", { text: MONTH[+m.slice(5, 7) - 1] })
        ]);
      })),
      h("div", { class: "label", text: "Milestones" }),
      p.milestones.length ? h("div", { class: "list" }, p.milestones.map(function (m) {
        return h("div", {}, [h("span", { text: "✓ " + m.name }), h("span", { class: "muted small num", text: m.date || "" })]);
      })) : h("p", { class: "muted", text: "Finish a whole topic or sub-section to see it here." }),
      h("div", { class: "label", text: "Badges in the tracker" }),
      h("div", { class: "badges" }, ["star", "thumbs", "solved", "retry", "tryagain", "skipped"].filter(function (k) {
        return p.badges[k];
      }).map(function (k) {
        return h("span", { class: "pill " + k, text: (BADGE_TEXT[k] || k) + " " + p.badges[k] });
      }))
    ];
  }

  /* ---------- markdown ---------- */
  function md(text) {
    var box = h("div", { class: "md" });
    // marked does not sanitise its output, so every rendered note goes through DOMPurify.
    if (window.marked && typeof window.marked.parse === "function" && window.DOMPurify) {
      box.innerHTML = window.DOMPurify.sanitize(window.marked.parse(text || "", { gfm: true, breaks: false }));
      box.querySelectorAll("a[href^='http']").forEach(function (a) { a.target = "_blank"; a.rel = "noopener"; });
      box.querySelectorAll("table").forEach(function (t) {
        var w = h("div", { class: "scroll-x" }); t.parentNode.insertBefore(w, t); w.appendChild(t);
      });
      if (window.hljs) box.querySelectorAll("pre code").forEach(function (c) { window.hljs.highlightElement(c); });
    } else {
      box.appendChild(h("pre", { class: "plain", text: text || "" }));
    }
    return box;
  }

  /* ---------- Concepts ---------- */

  function viewConcepts() {
    return [h("h1", { text: "Concepts" }), h("p", { class: "muted small", text: "Notes that aren't tied to one problem." })]
      .concat(L.groupConcepts(S.concepts).map(function (g) {
        return h("section", {}, [
          h("div", { class: "label", text: g.label }),
          h("div", { class: "topic" }, h("div", { class: "topic-body", style: "padding-top:4px" }, g.concepts.map(function (c) {
            return h("div", { class: "row concept-row" }, [
              h("a", { class: "name", href: "#c-" + c.id, text: c.title }),
              h("span", { class: "muted small num", text: c.problems.length ? c.problems.length + " problem" + (c.problems.length > 1 ? "s" : "") : "" })
            ]);
          })))
        ]);
      }));
  }

  function viewConcept(id) {
    var c = conceptsById[id];
    if (!c) return [h("p", { class: "empty", text: "That concept isn't in the notes any more." }), h("a", { href: "#concepts", text: "‹ All concepts" })];
    return [
      h("a", { class: "back", href: "#concepts", text: "‹ Concepts" }),
      h("h1", { text: c.title }),
      h("p", { class: "muted small" }, ["From " + c.source + " · ", editLink(c.source)]),
      md(c.md),
      c.problems.length ? h("div", {}, [h("div", { class: "label", text: "Used in" }), h("div", { class: "list" }, c.problems.map(function (pid) {
        var x = itemsById[pid];
        return h("div", {}, [h("a", { href: "#p-" + pid, text: x ? x.item.name : pid }), x ? badge(x.item) : null]);
      }))]) : null
    ];
  }

  /* ---------- Problem screen ---------- */
  var store = L.makeStore((function () { try { return window.localStorage; } catch (e) { return undefined; } })());
  var COUNTDOWN = { FLASH: 1, SKELETON: 3, CODE: 8 };
  var timers = [];
  var rungOpen = {};

  var expectedOwner = (S.config && S.config.repo) ? S.config.repo.split("/")[0] : "vansh-tandon";

  // The GitHub token is only needed for Sync. It lives in sessionStorage (this tab only), never
  // localStorage: every *.github.io page of the same account shares one localStorage.
  var session = L.makeStore((function () { try { return window.sessionStorage; } catch (e) { return undefined; } })());
  try { SheetGitHub.clearLegacyToken(window.localStorage); } catch (e) { /* storage blocked */ }
  function getToken() { return session.get("sheet:github:pat", "") || ""; }
  function setToken(t, user) { session.set("sheet:github:pat", t); session.set("sheet:github:user", user || null); }
  function clearToken() { session.set("sheet:github:pat", ""); session.set("sheet:github:user", null); }

  function tierName(t) { return { CODE: "🟥 CODE", SKELETON: "🟨 SKELETON", FLASH: "🟩 FLASH" }[t] || ""; }
  function lastGrade(key) { var g = store.get("sheet:grade:" + key, null); return g ? g.grade : null; }
  function fieldMd(f) {
    if (!f || !f.md) return null;
    var box = h("div", {}, [md(f.md)]);
    if (f.source === "assistant") box.appendChild(h("span", { class: "pill tag", text: "assistant-written" }));
    return box;
  }

  function rungList(item, part) {
    var l = part.ladder || {};
    var code = part.code.length ? h("div", {}, part.code.map(function (c) {
      return h("div", {}, [h("div", { class: "sub", text: c.title }), md(c.md)]);
    })) : null;
    var concepts = item.concepts.length ? h("div", {}, [
      h("p", { class: "small", style: "margin-bottom:8px" }, [
        h("a", { class: "btn small primary", href: "#p-" + item.id + "/concepts", text: "📖 View Concepts & Blueprint tab (" + item.concepts.length + ") ›" })
      ]),
      h("div", { class: "list" }, item.concepts.map(function (cid) {
        var c = conceptsById[cid];
        return h("div", {}, [
          h("a", { href: "#p-" + item.id + "/concepts", text: c ? c.title : cid }),
          h("span", { class: "muted small", style: "margin-left:8px" }, [
            h("a", { href: "#c-" + cid, class: "muted", text: "full-screen ↗" })
          ])
        ]);
      }))
    ]) : null;
    return [
      { id: "trigger", title: "Trigger · what in the statement gives it away", body: fieldMd(l.trigger) },
      { id: "idea", title: "Idea in one line", body: fieldMd(l.idea) },
      { id: "traps", title: "Traps I hit before", body: part.traps.length ? md(part.traps.join("\n\n")) : null },
      { id: "dryrun", title: "Dry run", body: fieldMd(l.dryrun) },
      { id: "skeleton", title: "Skeleton · the lines that matter", body: fieldMd(l.skeleton) },
      { id: "code", title: "Full code", body: code },
      { id: "notes", title: "Intuition from my tracker notes", body: part.intuition.length ? md(part.intuition.join("\n\n")) : null },
      { id: "concepts", title: "Concepts", body: concepts },
    ].filter(function (r) { return r.body; });
  }

  function rungEl(key, r, enabled, onOpen) {
    var openKey = key + "|" + r.id;
    var isOpen = !!rungOpen[openKey];
    return h("div", { class: "rung" + (isOpen ? " open" : "") + (enabled ? "" : " locked") }, [
      h("button", { class: "rung-head", type: "button", disabled: !enabled, "aria-expanded": String(isOpen),
        onclick: function () { rungOpen[openKey] = !isOpen; if (onOpen && !isOpen) onOpen(r.id); render(); } }, [
        h("span", { text: r.title }), h("span", { class: "muted", text: enabled ? (isOpen ? "▾" : "▸") : "🔒" })
      ]),
      isOpen ? h("div", { class: "rung-body" }, r.body) : null
    ]);
  }

  function ladderSequence(key, rungs, onOpen) {
    // Each rung unlocks once the one before it has been opened.
    var out = [], prevOpened = true;
    rungs.forEach(function (r) {
      out.push(rungEl(key, r, prevOpened, onOpen));
      prevOpened = !!rungOpen[key + "|" + r.id];
    });
    return out;
  }

  function gradeBlock(key, part, opened, mode) {
    var label = part.revision ? part.revision.label : part.label;
    var saved = store.get("sheet:grade:" + key, null);
    var savedToday = saved && saved.date === today ? saved.grade : null;
    var choice = { v: savedToday != null ? savedToday : L.suggestFor(mode, opened) };
    var save;
    var buttons = [0, 1, 2, 3].map(function (g) {
      return h("button", { type: "button", class: "grade-btn", "aria-pressed": String(choice.v === g),
        onclick: function (e) {
          choice.v = g;
          save.disabled = false;
          e.currentTarget.parentNode.querySelectorAll("button").forEach(function (b, i) { b.setAttribute("aria-pressed", String(i === g)); });
        }, text: ["0 blank", "1 fumbled", "2 hesitated", "3 clean"][g] });
    });
    var revRows = Object.keys(S.revision).map(function (k) { return S.revision[k]; });
    var queueInfo = L.dueQueue(revRows, today);
    var pRevKey = part.revision ? part.revision.key : null;
    var qIndex = pRevKey ? queueInfo.tonight.findIndex(function (r) { return r.key === pRevKey; }) : -1;
    var inLater = false;
    if (qIndex === -1 && pRevKey) {
      qIndex = queueInfo.later.findIndex(function (r) { return r.key === pRevKey; });
      if (qIndex !== -1) inLater = true;
    }
    var activeQ = inLater ? queueInfo.later : queueInfo.tonight;
    var nextRev = (qIndex !== -1 && qIndex < activeQ.length - 1) ? activeQ[qIndex + 1] : null;
    var nextId = nextRev ? itemByRevKey[nextRev.key] : null;

    var nextNavBtn = (qIndex !== -1 && nextId)
      ? h("a", { class: "btn primary", style: "display:inline-block;margin-top:10px", href: "#p-" + nextId, text: "Next in queue: " + nextRev.label + " ›" })
      : (qIndex !== -1
          ? h("a", { class: "btn", style: "display:inline-block;margin-top:10px", href: "#revise", text: "Queue completed! View Revise tab ›" })
          : null);

    var msg = savedToday != null ? h("div", { style: "margin-top:6px" }, [
      h("p", { class: "small", text: savedToday <= 1
        ? "Re-solve once more tonight before it drops to Box 1."
        : "Saved. It's in tonight's log on the Revise tab." }),
      nextNavBtn
    ]) : null;
    return h("div", { class: "grade" }, [
      h("div", { class: "label", text: "How did it go?" }),
      h("p", { class: "muted small", text: mode === "gated"
        ? "Suggested from how far you had to open the ladder. Change it if it's wrong."
        : "Pick the grade that matches how it went: 0 blank · 1 fumbled · 2 hesitated · 3 clean." }),
      h("div", { class: "grade-row" }, buttons),
      (save = h("button", { type: "button", class: "primary", disabled: choice.v == null, text: savedToday != null ? "Update grade" : "Save grade", onclick: function () {
        store.set("sheet:grade:" + key, { date: today, grade: choice.v });
        var logKey = "sheet:log:" + today;
        var lines = store.get(logKey, []).filter(function (l) { return l.indexOf(" · " + label + " · ") === -1; });
        lines.push(L.logLine(today, label, choice.v, opened));
        store.set(logKey, lines);
        render();
      } })),
      msg
    ]);
  }

  function countdownEl(key, tier) {
    var mins = COUNTDOWN[tier] || COUNTDOWN.SKELETON;
    var startKey = "sheet:start:" + today + ":" + key;
    var start = store.get(startKey, null);
    if (!start) { start = Date.now(); store.set(startKey, start); }
    var el = h("div", { class: "countdown" }, [h("span", { class: "cd-label", text: "Suggested " + mins + " min to think" }), h("span", { class: "cd-time num" })]);
    function tick() {
      var left = Math.max(0, mins * 60 - Math.floor((Date.now() - start) / 1000));
      el.lastChild.textContent = left ? Math.floor(left / 60) + ":" + ("0" + (left % 60)).slice(-2) : "time's up, check when ready";
    }
    tick();
    timers.push(setInterval(tick, 1000));
    return el;
  }

  function partFlow(item, part) {
    var key = item.id + "/" + part.id;
    var mode = L.gateMode(part, item, lastGrade(key));
    var dayKey = today + ":" + key;
    var opened = new Set(store.get("sheet:opened:" + dayKey, []));
    var checked = store.get("sheet:checked:" + dayKey, false);
    var rungs = rungList(item, part);
    function record(id) { opened.add(id); store.set("sheet:opened:" + dayKey, Array.from(opened)); }
    var tier = part.revision && part.revision.tier;
    var head = [
      part.revision ? h("div", { class: "meta-line small muted" }, [tierName(tier), part.revision.box != null ? " · Box " + part.revision.box : " · not graded yet",
        part.revision.next ? " · next " + part.revision.next : ""]) : null,
      h("div", { class: "label", text: "Problem" }),
      part.statement ? h("div", { class: "statement" }, md(part.statement))
        : h("p", { class: "muted small", text: "No statement saved yet. Use the Problem ↗ button." })
    ];

    if (mode === "light") {
      return head.concat([
        h("p", { class: "hint small", text: "Add a one-line idea to sheet/ladder.md to turn on the gate." }),
        h("div", { class: "rungs" }, rungs.map(function (r) { return rungEl(key, r, true, record); })),
        part.revision ? gradeBlock(key, part, opened, mode) : null
      ]);
    }

    if (mode === "quick") {
      return head.concat([
        h("div", { class: "label", text: "Ladder" }),
        h("div", { class: "rungs" }, ladderSequence(key, rungs, record)),
        gradeBlock(key, part, opened, mode)
      ]);
    }

    // gated
    var pre = rungs.filter(function (r) { return r.id === "trigger" || r.id === "idea"; });
    var post = rungs.filter(function (r) { return r.id !== "trigger" && r.id !== "idea"; });
    if (!checked) {
      var area = h("textarea", { id: "typed-" + key.replace(/[^a-z0-9]/g, "-"), class: "typed", rows: "4",
        placeholder: "Which pattern? What stays true at every step? What do you return?" });
      area.value = store.get("sheet:typed:" + dayKey, "");
      var btn = h("button", { type: "button", class: "primary", disabled: !L.canCheck(area.value), text: "Check my idea",
        onclick: function () { store.set("sheet:checked:" + dayKey, true); render(); } });
      var count = h("span", { class: "muted small num" });
      var skip = h("button", { type: "button", class: "skip", text: "Skip — show me the answer",
        onclick: function () { record("skipped"); store.set("sheet:checked:" + dayKey, true); render(); } });
      function sync() {
        var n = L.wordCount(area.value);
        btn.disabled = n < L.MIN_WORDS;
        count.textContent = n < L.MIN_WORDS ? (L.MIN_WORDS - n) + " more word" + (L.MIN_WORDS - n === 1 ? "" : "s") : "";
      }
      area.addEventListener("input", function () { store.set("sheet:typed:" + dayKey, area.value); sync(); });
      sync();
      return head.concat([
        h("label", { class: "label", for: area.id, text: "Your approach · pattern + key invariant" }),
        area,
        h("div", { class: "check-row" }, [btn, count]),
        countdownEl(key, tier),
        h("div", { class: "skip-row" }, [skip, h("span", { class: "muted small", text: "Counts as grade 0 unless you change it." })]),
        pre.length ? h("div", { class: "label", text: "Stuck? Opening these counts toward your grade" }) : null,
        h("div", { class: "rungs" }, pre.map(function (r) {
          return rungEl(key, r, true, record);
        }))
      ]);
    }
    var idea = rungs.filter(function (r) { return r.id === "idea"; })[0];
    var skipped = opened.has("skipped");
    var typed = store.get("sheet:typed:" + dayKey, "");
    var feedback = pre.filter(function (r) { return r.id === "trigger"; }).concat(post);
    return head.concat([
      skipped ? h("p", { class: "hint small", text: "You skipped to the answer, so everything below is open." }) : null,
      !skipped || typed ? h("div", { class: "label", text: "You wrote" }) : null,
      !skipped || typed ? h("div", { class: "mine" }, typed) : null,
      idea ? h("div", { class: "label", text: "Your notes say" }) : null,
      idea ? h("div", { class: "ref" }, idea.body) : null,
      h("div", { class: "label", text: "Now, as feedback" }),
      h("div", { class: "rungs" }, skipped
        ? feedback.map(function (r) { return rungEl(key, r, true); })
        : ladderSequence(key, feedback)),
      gradeBlock(key, part, opened, mode)
    ]);
  }

    var itemByRevKey = {};
  S.topics.forEach(function (t) { t.sections.forEach(function (s) { s.items.forEach(function (i) {
    i.parts.forEach(function (p) { if (p.revision && !itemByRevKey[p.revision.key]) itemByRevKey[p.revision.key] = i.id; });
  }); }); });

  function viewProblem(id, tab) {
    var x = itemsById[id];
    if (!x) return [h("p", { class: "empty", text: "That problem isn't on the roadmap any more." }), h("a", { href: "#sheet", text: "‹ Sheet" })];
    var i = x.item;
    ui.open[x.topic.id] = true;
    var videoLabel = i.videoKind === "topic" ? "Striver topic video ↗" : "Striver video ↗";

    var revRows = Object.keys(S.revision).map(function (k) { return S.revision[k]; });
    var queueInfo = L.dueQueue(revRows, today);
    var pRevKey = (i.parts && i.parts[0] && i.parts[0].revision) ? i.parts[0].revision.key : null;
    var qIndex = pRevKey ? queueInfo.tonight.findIndex(function (r) { return r.key === pRevKey; }) : -1;
    var inLater = false;
    if (qIndex === -1 && pRevKey) {
      qIndex = queueInfo.later.findIndex(function (r) { return r.key === pRevKey; });
      if (qIndex !== -1) inLater = true;
    }
    var activeQ = inLater ? queueInfo.later : queueInfo.tonight;
    var qLabel = inLater ? "Later queue" : "Tonight's queue";
    var prevRev = (qIndex > 0) ? activeQ[qIndex - 1] : null;
    var nextRev = (qIndex !== -1 && qIndex < activeQ.length - 1) ? activeQ[qIndex + 1] : null;
    var prevId = prevRev ? itemByRevKey[prevRev.key] : null;
    var nextId = nextRev ? itemByRevKey[nextRev.key] : null;

    var queueNav = qIndex !== -1 ? h("div", { class: "queue-nav" }, [
      prevId ? h("a", { class: "small", href: "#p-" + prevId, text: "‹ " + prevRev.label }) : h("a", { class: "small muted", href: "#revise", text: "‹ Revise tab" }),
      h("span", { class: "small muted num", text: qLabel + ": " + (qIndex + 1) + " of " + activeQ.length }),
      nextId ? h("a", { class: "small", href: "#p-" + nextId, text: nextRev.label + " ›" }) : h("a", { class: "small", href: "#revise", text: "Revise summary ›" })
    ]) : null;

    var hasConcepts = i.concepts && i.concepts.length > 0;
    var isConceptsTab = hasConcepts && tab === "concepts";

    var tabBar = hasConcepts ? h("div", { class: "problem-tabs" }, [
      h("a", {
        class: "problem-tab-btn" + (!isConceptsTab ? " active" : ""),
        href: "#p-" + id,
        text: "🪜 Practice & Ladder"
      }),
      h("a", {
        class: "problem-tab-btn" + (isConceptsTab ? " active" : ""),
        href: "#p-" + id + "/concepts",
        text: "📖 Concepts & Blueprint (" + i.concepts.length + ")"
      })
    ]) : null;

    var out = [
      queueNav,
      h("a", { class: "back", href: "#sheet", text: "‹ " + x.topic.name + (x.section.name ? " · " + x.section.name : "") }),
      h("h1", { text: i.name }),
      h("div", { class: "meta-line" }, [
        i.badgeLabel ? h("span", { class: "pill " + i.badge, text: i.badgeLabel }) : null,
        i.difficulty ? h("span", { class: "pill diff-" + i.difficulty, text: i.difficulty }) : null,
        i.date ? h("span", { class: "muted small", text: "Logged " + i.date }) : null
      ]),
      h("div", { class: "actions" }, [
        i.url ? h("a", { class: "btn", href: i.url, target: "_blank", rel: "noopener", text: "Problem ↗" }) : null,
        i.video ? h("a", { class: "btn", href: i.video, target: "_blank", rel: "noopener", text: videoLabel }) : null
      ]),
      tabBar
    ];

    if (isConceptsTab) {
      var conceptBoxes = i.concepts.map(function (cid) {
        var c = conceptsById[cid];
        if (!c) return h("p", { class: "empty", text: "Concept " + cid + " not found." });
        return h("div", { class: "inline-concept-box" }, [
          h("div", { class: "inline-concept-head" }, [
            h("h2", { class: "inline-concept-title", text: c.title }),
            h("div", { class: "inline-concept-actions" }, [
              h("span", { class: "pill tag", text: "From " + c.source }),
              h("a", { class: "small muted", href: "#c-" + cid, text: "Open full-screen ↗" })
            ])
          ]),
          md(c.md)
        ]);
      });
      var backToPractice = h("div", { style: "margin: 20px 0" }, [
        h("a", { class: "btn primary", href: "#p-" + id, text: "‹ Back to Practice & Ladder" })
      ]);
      return out.concat(conceptBoxes).concat([backToPractice, h("p", { class: "small" }, editLink("practice-tracker.md", "Edit practice-tracker.md on GitHub"))]);
    }
    function partLinks(p) {
      if (i.parts.length < 2 || (!p.url && !p.video)) return null;
      return h("div", { class: "actions" }, [
        p.url ? h("a", { class: "btn", href: p.url, target: "_blank", rel: "noopener", text: "Problem ↗" }) : null,
        p.video ? h("a", { class: "btn", href: p.video, target: "_blank", rel: "noopener",
          text: p.videoKind === "topic" ? "Striver topic video ↗" : "Striver video ↗" }) : null
      ]);
    }
    if (!i.done) {
      return out.concat([h("p", { class: "muted", text: "Not attempted yet." })].concat(i.parts.length > 1 ? i.parts.map(function (p) {
        return h("section", { class: "part" }, [h("h2", { text: p.label }), partLinks(p)]);
      }) : []));
    }
    i.parts.forEach(function (p) {
      out.push(h("section", { class: "part" }, [i.parts.length > 1 ? h("h2", { text: p.label }) : null, partLinks(p)].concat(partFlow(i, p))));
    });
    out.push(h("p", { class: "small" }, editLink("practice-tracker.md", "Edit practice-tracker.md on GitHub")));
    return out;
  }

  /* ---------- Revise ---------- */

  function revName(r) {
    var id = itemByRevKey[r.key];
    return id ? h("a", { class: "name", href: "#p-" + id, text: r.label }) : h("span", { class: "name", text: r.label });
  }

  function viewRevise() {
    var rows = Object.keys(S.revision).map(function (k) { return S.revision[k]; });
    var q = L.dueQueue(rows, today);
    var fams = L.familiesUngraded(rows);
    var lines = store.get("sheet:log:" + today, []);
    var logBox = h("pre", { class: "logbox", tabindex: "0", text: lines.join("\n") || "Nothing graded yet tonight." });
    var copyMsg = h("span", { class: "muted small", role: "status" });
    return [
      h("h1", { text: "Revise" }),
      h("p", { class: "muted small", text: "Tonight's cap: " + L.capMinutes(today) + " min. Recall first, look later." }),
      h("div", { class: "label", text: "Tonight" }),
      q.tonight.length ? h("div", { class: "topic" }, h("div", { class: "topic-body", style: "padding-top:4px" }, q.tonight.map(function (r) {
        return h("div", { class: "row rev-row" }, [revName(r), h("span", { class: "muted small num", text: "due " + r.next })]);
      }))) : h("p", { class: "muted", text: "Nothing due tonight." }),
      q.later.length ? h("details", { class: "fold" }, [h("summary", { text: "Later (" + q.later.length + ")" }),
        h("div", {}, q.later.map(function (r) { return h("div", { class: "row rev-row" }, [revName(r), h("span", { class: "muted small num", text: "due " + r.next })]); }))]) : null,
      h("div", { class: "label", text: "Not graded yet" }),
      h("div", { class: "folds" }, fams.map(function (f) {
        return h("details", { class: "fold" }, [
          h("summary", {}, [f.family + " · " + f.familyName + " ", h("span", { class: "muted small", text: "(" + f.rows.length + ")" })]),
          h("div", {}, f.rows.map(function (r) {
            return h("div", { class: "row rev-row" }, [revName(r), h("span", { class: "muted small", text: tierName(r.tier) || "not revision" })]);
          }))
        ]);
      })),
      h("div", { class: "label", text: "Tonight's log" }),
      logBox,
      (function () {
        var syncMsg = h("span", { class: "small", role: "status", style: "margin-left:4px" });
        var syncBtn = h("button", {
          type: "button",
          class: "primary",
          disabled: !lines.length,
          text: "⚡ Sync to GitHub",
          onclick: async function () {
            var pat = getToken();
            if (!pat) {
              syncMsg.textContent = "Connect GitHub first (below).";
              syncMsg.style.color = "var(--hard)";
              return;
            }
            syncBtn.disabled = true;
            syncBtn.textContent = "Syncing...";
            syncMsg.textContent = "Connecting to GitHub API...";
            syncMsg.style.color = "var(--muted)";
            var repo = (S.config && S.config.repo) || "vansh-tandon/DSA";
            var branch = (S.config && S.config.branch) || "main";
            var res = await SheetGitHub.syncRevisionToGitHub(pat, repo, branch, lines, today);
            syncBtn.disabled = false;
            syncBtn.textContent = "⚡ Sync to GitHub";
            if (!res.ok) {
              syncMsg.textContent = "Couldn't sync: " + res.error;
              syncMsg.style.color = "var(--hard)";
            } else {
              var parts = [];
              if (res.applied.length) parts.push("✅ Applied " + res.applied.length);
              if (res.already.length) parts.push("already synced " + res.already.length);
              if (res.unmatched.length) parts.push("not found " + res.unmatched.length);
              syncMsg.textContent = (parts.join(" · ") || "Nothing to sync") +
                (res.commitSha ? " · commit " + res.commitSha.slice(0, 7) + ", site rebuilding" : "");
              syncMsg.style.color = res.unmatched.length ? "var(--medium)" : "var(--accent)";
              if (res.unmatched.length) {
                syncMsg.appendChild(h("span", { class: "sync-unmatched", text:
                  " Not in REVISION.md: " + res.unmatched.map(function (l) { return (SheetGitHub.parseLogLine(l) || {}).label || l; }).join("; ") +
                  ". Add these rows to REVISION.md or fix the label." }));
              }
            }
          }
        });

        var copyBtn = h("button", { type: "button", class: "btn", disabled: !lines.length, text: "Copy log", onclick: function () {
          var text = lines.join("\n");
          function selectIt() {
            var r = document.createRange(); r.selectNodeContents(logBox);
            var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
            copyMsg.textContent = "Selected. Copy it with your keyboard or the share menu.";
          }
          try {
            navigator.clipboard.writeText(text).then(function () { copyMsg.textContent = "Copied."; }, selectIt);
          } catch (e) { selectIt(); }
        } });

        return h("div", { class: "check-row", style: "gap:8px;flex-wrap:wrap" }, [
          syncBtn,
          copyBtn,
          copyMsg,
          syncMsg
        ]);
      })(),
      githubPanel(),
      h("p", { class: "small" }, ["Or paste it to your assistant, or ", editLink("REVISION.md", "edit REVISION.md on GitHub"), "."]),
      h("div", { class: "label", text: "Key" }),
      h("div", { class: "list small" }, [
        h("div", {}, [h("span", { text: "🟥 CODE · full solution, no run button" }), h("span", { class: "muted", text: "12–20 min" })]),
        h("div", {}, [h("span", { text: "🟨 SKELETON · the 3–6 lines that matter" }), h("span", { class: "muted", text: "4–6 min" })]),
        h("div", {}, [h("span", { text: "🟩 FLASH · say it out loud" }), h("span", { class: "muted", text: "1 min" })]),
        h("div", {}, [h("span", { text: "Boxes · 1 → 2 d, 2 → 6 d, 3 → 14 d, 4 → 30 d, 5 → 60 d, 6 retired" })]),
        h("div", {}, [h("span", { text: "Grades · 2–3 move up a box, 0–1 re-solve tonight then back to Box 1" })])
      ]),
      h("p", { class: "muted small", text: "Snapshot as of " + S.snapshot + "." })
    ];
  }

  /* ---------- GitHub connection (Sync only) ---------- */
  function githubPanel() {
    var token = getToken();
    if (token) {
      var user = session.get("sheet:github:user", null) || { login: expectedOwner };
      return h("p", { class: "small muted" }, ["Connected to GitHub as @" + user.login + " for this tab. ",
        h("button", { type: "button", class: "skip", text: "Disconnect", onclick: function () { clearToken(); render(); } })]);
    }
    var patInput = h("input", { type: "password", class: "auth-input", id: "github-token",
      placeholder: "Paste a GitHub fine-grained token", autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
    var statusEl = h("div", { class: "auth-status", role: "status" });
    var btn = h("button", { type: "button", class: "primary", text: "Connect", onclick: async function () {
      var val = (patInput.value || "").trim();
      if (!val) { statusEl.textContent = "Paste your token first."; statusEl.className = "auth-status error"; return; }
      btn.disabled = true; statusEl.textContent = "Checking with GitHub…"; statusEl.className = "auth-status info";
      var res = await SheetGitHub.validateToken(val, expectedOwner);
      btn.disabled = false;
      if (!res.ok) { statusEl.textContent = res.error || "GitHub didn't accept that token."; statusEl.className = "auth-status error"; return; }
      setToken(val, res.user);
      render();
    } });
    var repoName = (S.config && S.config.repo) || "vansh-tandon/DSA";
    return h("details", { class: "fold" }, [
      h("summary", { text: "Connect GitHub to sync" }),
      h("div", { class: "small", style: "padding:8px 0 12px;display:grid;gap:8px" }, [
        h("label", { for: "github-token", class: "muted", text: "Token (kept only for this browser tab session; closing the tab forgets it)" }),
        h("div", { class: "auth-input-wrap" }, [patInput]),
        h("div", {}, [btn]),
        statusEl,
        h("ol", { class: "muted", style: "padding-left:18px;margin:4px 0" }, [
          h("li", {}, ["GitHub → ", h("a", { href: "https://github.com/settings/personal-access-tokens/new", target: "_blank", rel: "noopener", text: "new fine-grained token ↗" })]),
          h("li", {}, ["Repository access: only ", h("code", { text: repoName })]),
          h("li", {}, ["Permissions: Contents → Read and write. Nothing else."]),
          h("li", {}, ["Expiration: 30 days."])
        ])
      ])
    ]);
  }

  /* ---------- router ---------- */
  var views = { sheet: viewSheet, progress: viewProgress, concepts: viewConcepts, concept: viewConcept, problem: viewProblem, revise: viewRevise };
  window.SheetViews = views;
  window.SheetUI = { h: h, badge: badge, ext: ext, editLink: editLink, bar: bar, pct: pct, today: today, ui: ui, render: function () { render(); } };

  function render() {
    timers.forEach(clearInterval);
    timers = [];
    var route = L.parseRoute(location.hash);
    var navView = route.view === "problem" ? "sheet" : route.view === "concept" ? "concepts" : route.view;
    document.querySelectorAll(".seg a").forEach(function (a) {
      if (a.dataset.view === navView) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    var view = views[route.view] || viewSheet;
    app.replaceChildren.apply(app, [].concat(view(route.id, route.tab) || []).filter(function (n) { return n != null && n !== false; }));
  }

  document.getElementById("foot").textContent = "Snapshot as of " + S.snapshot + " · built from the repo's markdown";
  var seg = document.querySelector(".seg");
  if (seg) seg.hidden = false;
  var topAuth = document.getElementById("topbar-auth");
  if (topAuth && opts.lock) {
    topAuth.replaceChildren(h("button", { type: "button", class: "topbar-logout", text: "Lock",
      title: "Forget the password on this device", onclick: opts.lock }));
  }
  window.addEventListener("hashchange", function () { render(); window.scrollTo(0, 0); });
  render();
};
