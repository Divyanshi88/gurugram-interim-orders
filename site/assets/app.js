let ALL = [], view = [];
const $ = s => document.querySelector(s);

const esc = s => String(s == null ? "" : s)
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

function hl(text, q){
  const t = esc(text);
  if (!q) return t;
  const parts = q.split(/\s+/).filter(w => w.length > 1)
                 .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!parts.length) return t;
  return t.replace(new RegExp("(" + parts.join("|") + ")", "gi"), "<mark>$1</mark>");
}

function render(){
  const q = $("#q").value.trim();
  const onlyC = $("#contested").classList.contains("on");
  const ql = q.toLowerCase();
  view = ALL.filter(o => {
    if (onlyC && !o.contested) return false;
    if (!ql) return true;
    return (o.sl + " " + o.date + " " + o.judge + " " + o.defendants + " " +
            o.summary + " " + o.contentions + " " + o.entries).toLowerCase().includes(ql);
  });
  $("#count").textContent = view.length === ALL.length
    ? ALL.length + " orders"
    : view.length + " of " + ALL.length + " orders";

  $("#tbody").innerHTML = view.map(o => {
    const long = o.summary.length > 300;
    const head = long ? o.summary.slice(0, 300) + "…" : o.summary;
    return `<tr>
      <td class="sl" data-l="No."><div class="rowhead"><span>${o.sl}</span></div></td>
      <td class="date" data-l="Date of order">${esc(o.date)}</td>
      <td class="judge" data-l="Judge">${hl(o.judge, q)}</td>
      <td data-l="Order document">
        <a class="dl" href="${esc(o.file)}" download>Download PDF</a>
        <span class="pg">${o.pages} page${o.pages === 1 ? "" : "s"} &middot; entr${o.n_entries === 1 ? "y" : "ies"} ${esc(o.entries)}</span>
      </td>
      <td class="def" data-l="Defendants concerned">${hl(o.defendants, q)}</td>
      <td class="sum" data-l="Summary">
        <span class="tag ${o.contested ? "c" : ""}">${o.contested ? "contested" : "procedural"}</span><br>
        <span class="s-short">${hl(head, q)}</span>
        ${long ? `<span class="s-full hidden">${hl(o.summary, q)}</span>
                  <button class="more" type="button">show more</button>` : ""}
      </td>
    </tr>`;
  }).join("");

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
  $("#q").oninput = render;
  $("#contested").onclick = e => { e.currentTarget.classList.toggle("on"); render(); };
  $("#clear").onclick = () => {
    $("#q").value = ""; $("#contested").classList.remove("on"); render();
  };
}).catch(e => {
  $("#tbody").innerHTML = `<tr><td colspan="6">Could not load the order list (${esc(e.message)}).</td></tr>`;
});
