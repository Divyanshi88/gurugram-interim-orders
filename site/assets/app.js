let ALL = [], view = [], ENGINE = null, HITS = new Map(), TERMS = null;
const $ = s => document.querySelector(s);

const esc = s => String(s == null ? "" : s)
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

// plain substring highlighting - only used if the search index failed to load
function hlPlain(text, q){
  const t = esc(text);
  if (!q) return t;
  const parts = q.split(/\s+/).filter(w => w.length > 1)
                 .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!parts.length) return t;
  return t.replace(new RegExp("(" + parts.join("|") + ")", "gi"), "<mark>$1</mark>");
}

// highlight whole words whose search token was part of the (expanded) query
function hl(text, q){
  if (!ENGINE || !TERMS) return hlPlain(text, q);
  return String(text == null ? "" : text).split(/(\s+)/).map(w => {
    const t = ENGINE.toks(w);
    const wt = t.length ? Math.max(...t.map(x => TERMS.get(x) || 0)) : 0;
    return wt >= 0.8 ? `<mark>${esc(w)}</mark>` : wt > 0 ? `<mark class="syn">${esc(w)}</mark>` : esc(w);
  }).join("");
}

function snippetHtml(o){
  const h = HITS.get(o.sl);
  if (!h) return "";
  const sn = ENGINE.snippet(h, TERMS, 38);
  if (sn.card) return "";                       // matched the summary itself, already shown
  const body = sn.words.map(x => x.hit >= 0.8 ? `<mark>${esc(x.w)}</mark>`
                               : x.hit > 0 ? `<mark class="syn">${esc(x.w)}</mark>` : esc(x.w)).join(" ");
  const lab = h.keyword ? "In the order text" : "Closest passage by meaning";
  return `<div class="snip"><span class="snip-l">${lab}</span>${sn.lead ? "… " : ""}${body}${sn.tail ? " …" : ""}</div>`;
}

const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const ym = a => MON[a[1] - 1] + " " + a[0];

let SEQ = 0;
const MEANING_N = 30;               // meaning mode ranks every order; show the closest ones
function render(){
  const q = $("#q").value.trim();
  const seq = ++SEQ;
  if (q && ENGINE && Meaning.state === "on" && Meaning.ready() && !/["“”]/.test(q)) {
    Meaning.sem(q).then(sem => { if (seq === SEQ) draw(q, sem); })
                  .catch(err => { console.warn(err); if (seq === SEQ) draw(q, null); });
    return;
  }
  draw(q, null);
}

function draw(q, sem){
  const onlyC = $("#contested").classList.contains("on");
  const byDate = $("#sort").value === "date";
  let note = "";
  HITS = new Map(); TERMS = null;

  if (!q) {
    view = ALL.filter(o => !onlyC || o.contested);
  } else if (ENGINE) {
    const r = ENGINE.search(q, sem ? MEANING_N : 0, sem);
    TERMS = r.terms;
    const bySl = new Map(ALL.map(o => [o.sl, o]));
    view = r.results.map(x => { HITS.set(x.sl, x); return bySl.get(x.sl); })
                    .filter(o => !onlyC || o.contested);
    if (byDate) view.sort((a, b) => a.sl - b.sl);
    if (r.window && !byDate)
      note = `Orders from ${ym(r.window[0])} to ${ym(r.window[1])} are listed first.`;
    if (r.phrases.length) note = `Exact wording: “${r.phrases.join("”, “")}”.`;
  } else {
    const ql = q.toLowerCase();
    view = ALL.filter(o => (!onlyC || o.contested) &&
      (o.sl + " " + o.date + " " + o.judge + " " + o.defendants + " " +
       o.summary + " " + o.contentions + " " + o.entries).toLowerCase().includes(ql));
  }
  $("#count").textContent = !q
    ? (view.length === ALL.length ? ALL.length + " orders" : view.length + " of " + ALL.length + " orders")
    : sem
      ? view.length + " closest orders by words and meaning" + (byDate ? " · by date" : "")
      : view.length + " matching order" + (view.length === 1 ? "" : "s") +
        (ENGINE ? (byDate ? " · by date" : " · best match first") : "");
  $("#qnote").textContent = note;
  $("#qnote").hidden = !note;

  $("#tbody").innerHTML = view.map(o => {
    const long = o.summary.length > 300;
    const head = long ? o.summary.slice(0, 300) + "…" : o.summary;
    return `<tr>
      <td class="sl" data-l="No."><div class="rowhead"><span>${o.sl}</span></div></td>
      <td class="date" data-l="Date of order">${esc(o.date)}</td>
      <td class="judge" data-l="Judge">${hl(o.judge, q)}</td>
      <td data-l="Order document">
        <div class="acts">
          <button class="btn-v" type="button" data-view="${o.sl}">View</button>
          <a class="dl" href="${esc(o.file)}" download>Download</a>
        </div>
        <span class="pg">${o.pages} page${o.pages === 1 ? "" : "s"} &middot; entr${o.n_entries === 1 ? "y" : "ies"} ${esc(o.entries)}</span>
      </td>
      <td class="def" data-l="Defendants concerned">${hl(o.defendants, q)}</td>
      <td class="sum" data-l="Summary">
        <span class="tag ${o.contested ? "c" : ""}">${o.contested ? "contested" : "procedural"}</span><br>
        <span class="s-short">${hl(head, q)}</span>
        ${long ? `<span class="s-full hidden">${hl(o.summary, q)}</span>
                  <button class="more" type="button">show more</button>` : ""}
        ${q && ENGINE ? snippetHtml(o) : ""}
      </td>
    </tr>`;
  }).join("") || `<tr><td colspan="6" class="empty">No order matches “${esc(q)}”.
      Try fewer words, or describe it differently.</td></tr>`;

  document.querySelectorAll("[data-view]").forEach(b => {
    b.onclick = () => openView(Number(b.dataset.view));
  });

  document.querySelectorAll(".more").forEach(b => b.onclick = () => {
    const td = b.closest("td");
    const sh = td.querySelector(".s-short"), fu = td.querySelector(".s-full");
    const open = fu.classList.contains("hidden");
    fu.classList.toggle("hidden", !open);
    sh.classList.toggle("hidden", open);
    b.textContent = open ? "show less" : "show more";
  });
}

fetch("data/orders.json").then(r => r.json()).then(d => {
  ALL = d;
  $("#n-orders").textContent = d.length;
  $("#n-dates").textContent  = new Set(d.map(o => o.date)).size;
  $("#n-cont").textContent   = d.filter(o => o.contested).length;
  $("#n-judges").textContent = new Set(d.map(o => o.judge)).size;
  render();
  let t = 0;
  $("#q").oninput = () => { clearTimeout(t); t = setTimeout(render, 120); };
  $("#sort").onchange = render;
  $("#meaning").onclick = toggleMeaning;
  $("#contested").onclick = e => { e.currentTarget.classList.toggle("on"); render(); };
  $("#clear").onclick = () => {
    $("#q").value = ""; $("#contested").classList.remove("on"); render();
  };
  // full-text index: if it fails, the page keeps working with plain filtering
  fetch("data/search.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(sd => {
      ENGINE = OrderSearch.build(ALL, sd); document.body.classList.add("ft");
      $("#meaning").hidden = false; render();
      let pref = null; try { pref = localStorage.getItem("meaning"); } catch (e) {}
      if (pref === "on") toggleMeaning();          // model is cached after the first time
    })
    .catch(err => console.warn("Full-text search unavailable, using plain filter:", err));
}).catch(e => {
  $("#tbody").innerHTML = `<tr><td colspan="6">Could not load the order list (${esc(e.message)}).</td></tr>`;
});


/* ---------- search by meaning ---------- */
const MEANING_LABEL = "Search by meaning";
function setMeaningBtn(text, on, busy){
  const b = $("#meaning");
  b.textContent = text; b.classList.toggle("on", !!on); b.disabled = !!busy;
  b.setAttribute("aria-pressed", on ? "true" : "false");
}
function toggleMeaning(){
  const save = v => { try { localStorage.setItem("meaning", v); } catch (e) {} };
  if (Meaning.state === "on") {
    Meaning.state = "off"; save("off"); setMeaningBtn(MEANING_LABEL, false); render(); return;
  }
  Meaning.state = "loading";
  setMeaningBtn("Loading model…", false, true);
  $("#mnote").hidden = false;
  $("#mnote").textContent = "Downloading the meaning model (about 44 MB, first time only; it is kept by your browser afterwards).";
  Meaning.load(ENGINE, f => setMeaningBtn("Loading model… " + Math.round(f * 100) + "%", false, true))
    .then(() => {
      Meaning.state = "on"; save("on");
      setMeaningBtn(MEANING_LABEL + " ✓", true);
      $("#mnote").textContent = "Meaning search is on: results also include orders that describe the same thing in different words. " +
        "For an exact line you remember, keyword search (button off) is more precise.";
      render();
    })
    .catch(err => {
      console.warn("Meaning search failed to load:", err);
      Meaning.state = "off"; save("off");
      setMeaningBtn(MEANING_LABEL, false);
      $("#mnote").textContent = "Meaning search could not be loaded in this browser (" + err.message + "). Keyword search still works.";
    });
}

/* ---------- PDF preview ---------- */
function openView(sl){
  const o = ALL.find(x => x.sl === sl);
  if (!o) return;
  // iframe PDF rendering is unreliable on small screens - open natively instead
  if (window.matchMedia("(max-width: 860px)").matches){
    window.open(o.file, "_blank", "noopener");
    return;
  }
  $("#ov-title").textContent = "Order " + o.sl + " \u2014 " + o.date;
  $("#ov-meta").textContent =
    o.judge + "  \u00b7  " + o.pages + " page" + (o.pages === 1 ? "" : "s") +
    "  \u00b7  entr" + (o.n_entries === 1 ? "y " : "ies ") + o.entries;
  $("#ov-frame").data = o.file + "#view=FitH";
  $("#ov-dl").href = o.file;
  $("#ov-tab").href = o.file;
  const ov = $("#ov");
  ov.hidden = false;
  document.body.style.overflow = "hidden";
  $("#ov-close").focus();
}
function closeView(){
  const ov = $("#ov");
  ov.hidden = true;
  $("#ov-frame").removeAttribute("data");   // stop the embedded viewer
  document.body.style.overflow = "";
}
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !$("#ov").hidden) closeView();
});
document.addEventListener("DOMContentLoaded", () => {
  $("#ov-close").onclick = closeView;
  $("#ov").addEventListener("click", e => { if (e.target.id === "ov") closeView(); });
});
