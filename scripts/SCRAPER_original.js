/* ====================================================================
   Gurugram interim orders - eCourts bulk downloader
   Case: CNR HRGR010070222019 | COMA/5/2019
         SFIO vs Adarsh Buildestate Ltd & 186 others
         District & Sessions Court, Gurugram - Court 26 (ADJ)
   Total orders published by the court: 434

   -------------------------------------------------------------------
   HOW TO RUN
   -------------------------------------------------------------------
   1. Open Chrome:  https://services.ecourts.gov.in/ecourtindia_v6/
   2. CNR Number search -> enter  HRGR010070222019
      -> type the captcha yourself -> Search
      -> wait until the case history with the "Interim Orders" table shows
   3. F12 -> Console tab -> paste this ENTIRE file -> Enter
   4. Leave the tab alone. Progress prints every 10 orders.

   It downloads a zip named  gurugram_orders_<n>.zip  when it finishes,
   and ALSO whenever it has to stop early - nothing is ever lost.

   -------------------------------------------------------------------
   IT RESUMES. YOU NEVER REDO WORK.
   -------------------------------------------------------------------
   Every file it fetches is recorded in this browser's localStorage.
   Entries 1-49 and 51-184 are pre-marked as already collected, so on a
   fresh machine it starts at entry 50, then 185 onward - 251 to fetch.

   If it stops early (captcha expired, rate limit, anything):
      reload the page -> redo the captcha -> paste this file again.
   It continues from exactly where it stopped.

   To start completely from scratch:  localStorage.removeItem("gurugram_done")

   -------------------------------------------------------------------
   IMPORTANT - eCourts WILL BLOCK YOU IF YOU GO FAST
   -------------------------------------------------------------------
   Requesting faster than about one order per second trips a rate limiter.
   It then returns HTTP 405 "Welcome User Search Page not Found here" for
   EVERY request from your IP - including the homepage - for a couple of
   hours. PACE below is set to stay under it. Do not lower it.
   If you see that message in the browser, you are blocked: stop, wait,
   and resume later. Running more scripts extends the block.
   ==================================================================== */

(function () {
  if (window.__RUNNING) {
    console.log("%cAlready running in this tab. Reload the page first.",
      "color:#c00;font-size:15px");
    return;
  }
  window.__RUNNING = true;

  const B = "/ecourtindia_v6";
  const PACE = 1600;                    // ms between orders - do not lower
  const STORE = "gurugram_done";
  const PRESEEDED = "1-49,51-184";      // already collected outside this script

  /* eCourts requires two anti-bot headers whose NAMES rotate between
     deployments. Read them off the live page rather than hard-coding. */
  let HDR = { delimeter: "dg26rfer", D73edg: "dg26rfer" };
  try {
    const src = ajaxCall.toString();
    const val = src.match(/var\s+delimeter\s*=\s*"([^"]+)"/);
    const keys = [...src.matchAll(/"([A-Za-z0-9_]{4,14})"\s*:\s*delimeter/g)]
      .map((m) => m[1]);
    if (val && keys.length) {
      HDR = {};
      keys.forEach((k) => (HDR[k] = val[1]));
    }
    console.log("anti-bot headers:", JSON.stringify(HDR));
  } catch (e) {
    console.log("could not read headers, using fallback:", JSON.stringify(HDR));
  }

  /* ---- what is already done ---- */
  const doneNames = new Set(JSON.parse(localStorage.getItem(STORE) || "[]"));
  const doneEntries = new Set();
  PRESEEDED.split(",").forEach(function (r) {
    const p = r.split("-").map(Number);
    for (let i = p[0]; i <= (p[1] === undefined ? p[0] : p[1]); i++) doneEntries.add(i);
  });

  /* ---- read the order table ---- */
  const jobs = [];
  let total = 0;
  document.querySelectorAll("tr").forEach(function (tr) {
    const a = tr.querySelector('[onclick*="displayPdf"]');
    if (!a) return;
    const m = a.getAttribute("onclick").match(
      /displayPdf\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/);
    if (!m) return;
    total++;
    const cells = [...tr.querySelectorAll("td,th")].map(
      (c) => c.textContent.replace(/ /g, " ").trim());
    const entry = /^\d+$/.test(cells[0]) ? parseInt(cells[0], 10) : total;
    let date = "unknown";
    for (const c of cells) {
      const d = c.match(/\b(\d{2})-(\d{2})-(\d{4})\b/);
      if (d) { date = d[3] + "-" + d[2] + "-" + d[1]; break; }
    }
    const name = String(entry).padStart(3, "0") + "_" + date + ".pdf";
    if (!doneEntries.has(entry) && !doneNames.has(name))
      jobs.push({ name: name, args: m.slice(1, 6) });
  });

  if (!total) {
    console.log("%cNo orders on this page. Is the case history actually open?",
      "color:#c00;font-size:15px");
    window.__RUNNING = false;
    return;
  }
  if (!jobs.length) {
    console.log("%cNothing left - all " + total + " orders already collected.",
      "color:#080;font-size:16px");
    window.__RUNNING = false;
    return;
  }

  const H = (window.__H = { files: [], miss: [], done: 0, total: jobs.length });
  console.log("%c" + jobs.length + " to fetch, starting at entry " +
    parseInt(jobs[0].name, 10) + ". About " +
    Math.ceil((jobs.length * (PACE + 900)) / 60000) + " minutes. Leave the tab alone.",
    "color:#080;font-size:15px");

  /* ---- zip writer (store only - PDFs are already compressed) ---- */
  function saveZip() {
    if (!H.files.length) { console.log("nothing new to save"); return; }
    const T = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      T[n] = c >>> 0;
    }
    const crc32 = function (b) {
      let c = 0xffffffff;
      for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 0xff] ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    };
    const enc = new TextEncoder(), parts = [], central = [];
    let off = 0;
    for (const f of H.files) {
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
    eo.setUint16(8, H.files.length, true); eo.setUint16(10, H.files.length, true);
    eo.setUint32(12, cs, true); eo.setUint32(16, off, true);
    const blob = new Blob([...parts, ...central, new Uint8Array(eo.buffer)],
      { type: "application/zip" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "gurugram_orders_" + H.files.length + "_" +
      new Date().toISOString().slice(11, 19).replace(/:/g, "") + ".zip";
    document.body.appendChild(a);
    a.click();
    console.log("%cSaved " + a.download + "  -  " + H.files.length +
      " PDFs, " + (blob.size / 1048576).toFixed(1) + " MB",
      "color:#080;font-size:16px");
  }

  /* ---- main loop ---- */
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
            headers: Object.assign({
              "Content-Type": "application/x-www-form-urlencoded",
              "X-Requested-With": "XMLHttpRequest",
            }, HDR),
            body: body,
          });
          if (r.status === 405) { sawBlock = true; break; }
          const j = await r.json();
          // the app_token is single use - write each rotation back to the page
          if (j.app_token) document.getElementById("app_token").value = j.app_token;
          if (j.order) {
            const p = await fetch(B + "/" + j.order.replace(/^\//, ""));
            const buf = new Uint8Array(await p.arrayBuffer());
            if (buf[0] === 0x25 && buf[1] === 0x50) got = buf;   // "%P"
          }
        } catch (e) { /* retry */ }
        if (!got) await new Promise((r) => setTimeout(r, 2500 + k * 2000));
      }

      if (got) {
        H.files.push({ name: job.name, data: got });
        doneNames.add(job.name);
        localStorage.setItem(STORE, JSON.stringify([...doneNames]));
        blocked = 0;
      } else {
        H.miss.push(job.name);
        if (sawBlock) blocked++;
      }
      H.done++;
      if (H.done % 10 === 0)
        console.log(H.done + " / " + H.total + "    ok " + H.files.length +
          "    missed " + H.miss.length);

      if (blocked >= 3) {
        console.log("%cRATE LIMITED by eCourts (HTTP 405). Stopping and saving.\n" +
          "Your IP is blocked for a while. Wait, then reload, redo the captcha " +
          "and paste this again - it resumes.", "color:#c60;font-size:15px");
        break;
      }
      await new Promise((r) => setTimeout(r, PACE));
    }

    window.__RUNNING = false;
    saveZip();
    const left = H.total - H.files.length;
    console.log(left > 0
      ? "%cNOT FINISHED - " + left + " still missing. Reload, redo captcha, paste again."
      : "%cALL DONE - every order collected.",
      left > 0 ? "color:#c60;font-size:16px" : "color:#080;font-size:18px");
  })();
})();
