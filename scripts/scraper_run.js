/* Gurugram interim orders - eCourts bulk downloader
   SCRAPER.js with ONE change: it flushes a zip every FLUSH successes instead of
   only at the very end, and only marks entries done in localStorage once their
   zip has actually been written. Everything that touches eCourts is byte-for-byte
   the original: PACE 1600, rotating anti-bot headers read off ajaxCall, single-use
   app_token chain, 3-try retry, HTTP 405 bailout, 1-49 / 51-184 pre-seed.
   Reason for the change: the original marks an entry done the moment it is fetched
   but only writes files at saveZip, so a tab crash mid-run loses PDFs that
   localStorage already claims are collected. */
(function () {
  if (window.__RUNNING) { console.log("GURU already running - reload the page first."); return; }
  window.__RUNNING = true;

  const B = "/ecourtindia_v6";
  const PACE = 1600;                 // ms between orders - do not lower
  const FLUSH = 40;                  // write a zip every N successes
  const STORE = "gurugram_done";
  const PRESEEDED = "1-49,51-184";

  let HDR = { delimeter: "dg26rfer", D73edg: "dg26rfer" };
  try {
    const src = ajaxCall.toString();
    const val = src.match(/var\s+delimeter\s*=\s*"([^"]+)"/);
    const keys = [...src.matchAll(/"([A-Za-z0-9_]{4,14})"\s*:\s*delimeter/g)].map((m) => m[1]);
    if (val && keys.length) { HDR = {}; keys.forEach((k) => (HDR[k] = val[1])); }
    console.log("GURU headers " + JSON.stringify(HDR));
  } catch (e) { console.log("GURU header fallback " + JSON.stringify(HDR)); }

  const doneNames = new Set(JSON.parse(localStorage.getItem(STORE) || "[]"));
  const doneEntries = new Set();
  PRESEEDED.split(",").forEach(function (r) {
    const p = r.split("-").map(Number);
    for (let i = p[0]; i <= (p[1] === undefined ? p[0] : p[1]); i++) doneEntries.add(i);
  });

  const jobs = [];
  let total = 0;
  document.querySelectorAll("tr").forEach(function (tr) {
    const a = tr.querySelector('[onclick*="displayPdf"]');
    if (!a) return;
    const m = a.getAttribute("onclick").match(
      /displayPdf\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/);
    if (!m) return;
    total++;
    const cells = [...tr.querySelectorAll("td,th")].map((c) => c.textContent.replace(/ /g, " ").trim());
    const entry = /^\d+$/.test(cells[0]) ? parseInt(cells[0], 10) : total;
    let date = "unknown";
    for (const c of cells) {
      const d = c.match(/\b(\d{2})-(\d{2})-(\d{4})\b/);
      if (d) { date = d[3] + "-" + d[2] + "-" + d[1]; break; }
    }
    const name = String(entry).padStart(3, "0") + "_" + date + ".pdf";
    if (!doneEntries.has(entry) && !doneNames.has(name)) jobs.push({ name: name, args: m.slice(1, 6) });
  });

  const H = (window.__H = { ok: 0, miss: [], done: 0, total: jobs.length, seen: total,
                            state: "running", zips: [], last: "" });
  if (!total) { H.state = "no-table"; console.log("GURU no orders on this page - is the case history open?"); window.__RUNNING = false; return; }
  if (!jobs.length) { H.state = "nothing-to-do"; console.log("GURU nothing left - all " + total + " already collected."); window.__RUNNING = false; return; }

  const T = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
  const crc32 = function (b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

  function saveZip(files) {
    if (!files.length) return null;
    const enc = new TextEncoder(), parts = [], central = [];
    let off = 0;
    for (const f of files) {
      const nm = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, sz, true);
      lh.setUint32(22, sz, true); lh.setUint16(26, nm.length, true);
      parts.push(new Uint8Array(lh.buffer), nm, f.data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, sz, true); ch.setUint32(24, sz, true);
      ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), nm);
      off += 30 + nm.length + sz;
    }
    const cs = central.reduce((a, b) => a + b.length, 0);
    const eo = new DataView(new ArrayBuffer(22));
    eo.setUint32(0, 0x06054b50, true);
    eo.setUint16(8, files.length, true); eo.setUint16(10, files.length, true);
    eo.setUint32(12, cs, true); eo.setUint32(16, off, true);
    const blob = new Blob([...parts, ...central, new Uint8Array(eo.buffer)], { type: "application/zip" });
    const first = parseInt(files[0].name, 10), lastn = parseInt(files[files.length - 1].name, 10);
    const fn = "guru_" + String(first).padStart(3, "0") + "-" + String(lastn).padStart(3, "0") + "_" + files.length + ".zip";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = fn;
    document.body.appendChild(a); a.click(); a.remove();
    console.log("GURU wrote " + fn + "  " + (blob.size / 1048576).toFixed(1) + " MB");
    return fn;
  }

  let pending = [];
  function flush() {
    const fn = saveZip(pending);
    if (fn) {
      H.zips.push(fn);
      for (const f of pending) doneNames.add(f.name);
      localStorage.setItem(STORE, JSON.stringify([...doneNames]));
      pending = [];
    }
  }

  console.log("GURU " + jobs.length + " to fetch, starting at entry " + parseInt(jobs[0].name, 10));

  (async function () {
    let blocked = 0;
    for (const job of jobs) {
      let got = null, sawBlock = false;
      for (let k = 0; k < 3 && !got; k++) {
        try {
          const token = document.getElementById("app_token").value;
          const body = "&normal_v=" + job.args[0] + "&case_val=" + job.args[1] +
            "&court_code=" + job.args[2] + "&filename=" + job.args[3] +
            "&appFlag=" + job.args[4] + "&ajax_req=true&app_token=" + token;
          const r = await fetch(B + "/?p=home/display_pdf", {
            method: "POST",
            headers: Object.assign({ "Content-Type": "application/x-www-form-urlencoded",
                                     "X-Requested-With": "XMLHttpRequest" }, HDR),
            body: body,
          });
          if (r.status === 405) { sawBlock = true; break; }
          const j = await r.json();
          if (j.app_token) document.getElementById("app_token").value = j.app_token;
          if (j.order) {
            const p = await fetch(B + "/" + j.order.replace(/^\//, ""));
            const buf = new Uint8Array(await p.arrayBuffer());
            if (buf[0] === 0x25 && buf[1] === 0x50) got = buf;
          }
        } catch (e) { /* retry */ }
        if (!got) await new Promise((r) => setTimeout(r, 2500 + k * 2000));
      }

      if (got) { pending.push({ name: job.name, data: got }); H.ok++; H.last = job.name; blocked = 0; }
      else { H.miss.push(job.name); if (sawBlock) blocked++; }

      H.done++;
      if (pending.length >= FLUSH) flush();
      if (H.done % 10 === 0) console.log("GURU " + H.done + "/" + H.total + "  ok " + H.ok + "  miss " + H.miss.length);

      if (blocked >= 3) { H.state = "rate-limited"; console.log("GURU RATE LIMITED (HTTP 405) - stopping."); break; }
      await new Promise((r) => setTimeout(r, PACE));
    }
    flush();
    if (H.state === "running") H.state = "finished";
    window.__RUNNING = false;
    console.log("GURU " + H.state + " - ok " + H.ok + "/" + H.total + ", missed " + H.miss.length + ", zips " + H.zips.length);
  })();
})();
