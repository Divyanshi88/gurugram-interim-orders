/* Full-text search over the order texts: BM25 on overlapping chunks, max-pooled to
   orders, with spelling tolerance, legal-vocabulary synonyms and date awareness.
   Runs entirely in the browser; no server, nothing sent anywhere.
   Mirrors the evaluated Python pipeline (scratch eval2.py) - keep them in step. */
(function (root) {
  "use strict";

  const STOP = new Set(("a an the of to and or in on at for by with from is was were be been as that this " +
    "these those it its he she his her they them their which who whom shall may has have had not no " +
    "are am i we you sh smt shri dated vide said into than then also any all such upon").split(" "));
  const SUFFIX = ["ings", "ing", "ied", "ies", "ed", "es", "s", "ly"];

  function normAcc(t) {
    // A-149 / A 149 / A149 / accused No.149 / accused 149 -> a149
    return t
      .replace(/\bA\s*-\s*(\d{1,3})\b/g, " a$1 ")
      .replace(/\bA(\d{1,3})\b/g, " a$1 ")
      .replace(/\baccused\s*(?:no\.?\s*)?(\d{1,3})\b/gi, " accused a$1 ");
  }
  function stem(w) {
    for (const s of SUFFIX)
      if (w.length > s.length + 3 && w.endsWith(s)) return w.slice(0, -s.length);
    return w;
  }
  function toks(t) {
    const m = normAcc(String(t || "")).toLowerCase().match(/[a-z0-9]+/g) || [];
    const out = [];
    for (const w of m) if (!STOP.has(w) && w.length > 1) out.push(stem(w));
    return out;
  }

  function lev(a, b, cap) {
    if (Math.abs(a.length - b.length) > cap) return cap + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let rowMin = i;
      for (let j = 1; j <= b.length; j++) {
        const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0));
        cur.push(v); if (v < rowMin) rowMin = v;
      }
      if (rowMin > cap) return cap + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  const skel = w => w[0] + w.slice(1).replace(/[aeiouyh]/g, "");

  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const cmp = (a, b) => a[0] - b[0] || a[1] - b[1];
  function dateWindow(q) {
    const ql = q.toLowerCase();
    const y0 = ql.match(/\b(20[12]\d)\b/);
    if (!y0) return null;
    const y = +y0[1];
    let lo = [y, 1], hi = [y, 12];
    const m = ql.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/);
    if (m) { const mm = MONTHS[m[1]]; lo = [y, Math.max(1, mm - 1)]; hi = [y, Math.min(12, mm + 1)]; }
    else if (/\b(early|start|beginning)\b/.test(ql)) hi = [y, 5];
    else if (/\b(mid|middle)\b/.test(ql)) { lo = [y, 4]; hi = [y, 9]; }
    else if (/\b(late|end)\b/.test(ql)) lo = [y, 8];
    if (/\b(around|about|circa|roughly)\b/.test(ql)) { lo = [y - 1, 7]; hi = [y + 1, 6]; }
    return [lo, hi];
  }

  function build(orders, searchData, opts) {
    const k1 = 1.2, b = 0.75;
    const bySl = new Map(orders.map(o => [o.sl, o]));
    const chunks = [];                       // {sl, text, len, tf}
    for (const so of searchData.orders) {
      for (const c of so.chunks) chunks.push({ sl: so.sl, text: c });
    }
    for (const o of orders) {                // curated index text is one more chunk per order
      chunks.push({ sl: o.sl, card: true,
        text: `Order dated ${o.date}. Judge ${o.judge}. ${o.defendants}. ${o.summary} ${o.contentions || ""}` });
    }
    const df = new Map(), post = new Map();
    let total = 0;
    chunks.forEach((c, i) => {
      const t = toks(c.text); c.len = t.length; total += t.length;
      const tf = new Map();
      for (const w of t) tf.set(w, (tf.get(w) || 0) + 1);
      for (const [w, f] of tf) {
        df.set(w, (df.get(w) || 0) + 1);
        if (!post.has(w)) post.set(w, []);
        post.get(w).push(i, f);
      }
    });
    const N = chunks.length, avg = total / N;
    const vocab = [...df.keys()].sort();
    const SK = new Map();
    for (const v of vocab) if (/^[a-z]+$/.test(v) && v.length >= 4) {
      const k = skel(v); if (!SK.has(k)) SK.set(k, new Set()); SK.get(k).add(v);
    }
    const synT = (searchData.synonyms || []).map(g => g.map(p => toks(p)));
    const idf = w => { const n = df.get(w) || 0; return Math.log(1 + (N - n + 0.5) / (n + 0.5)); };

    function fuzzyTerms(w) {
      if (df.has(w) || /^\d+$/.test(w) || w.length < 4) return [];
      const cap = w.length >= 7 ? 2 : 1;
      const out = new Set();
      for (const v of vocab) if (v[0] === w[0] && lev(w, v, cap) <= cap) out.add(v);
      for (const v of SK.get(skel(w)) || []) out.add(v);
      return [...out].sort((a, c) => (df.get(c) - df.get(a)) || (a < c ? -1 : a > c ? 1 : 0)).slice(0, 4);
    }

    function expand(q) {
      const qt = toks(q), terms = new Map(), qs = new Set(qt);
      for (const w of qt) if (!terms.has(w)) terms.set(w, 1.0);
      for (const w of qt) for (const v of fuzzyTerms(w)) if (!terms.has(v)) terms.set(v, 0.8);
      for (const g of synT) {
        if (g.some(p => p.length && p.every(t => qs.has(t))))
          for (const p of g) for (const t of p) if (!terms.has(t)) terms.set(t, 0.4);
      }
      return terms;
    }

    // "quoted words" must appear together, in order, within one chunk
    function phrases(q) {
      return [...q.replace(/[“”]/g, '"').matchAll(/"([^"]+)"/g)]
        .map(m => ({ raw: m[1].trim(), norm: toks(m[1]).join(" ") })).filter(p => p.norm);
    }
    const chunkNorm = i => chunks[i]._n || (chunks[i]._n = " " + toks(chunks[i].text).join(" ") + " ");

    // sem (optional, "search by meaning"): {vec: Float32Array query embedding, E: Int8Array of
    // N x dim chunk embeddings}. Fused with the keyword ranking by reciprocal rank (k = 60).
    function search(q, limit, sem) {
      const terms = expand(q);
      const s = new Float64Array(N);
      for (const [w, wt] of terms) {
        const p = post.get(w); if (!p) continue;
        const id = idf(w);
        for (let j = 0; j < p.length; j += 2) {
          const i = p[j], f = p[j + 1];
          s[i] += wt * id * f * (k1 + 1) / (f + k1 * (1 - b + b * chunks[i].len / avg));
        }
      }
      const ph = phrases(q);
      if (ph.length) for (let i = 0; i < N; i++)
        if (s[i] > 0 && !ph.every(p => chunkNorm(i).includes(" " + p.norm + " "))) s[i] = 0;

      const best = new Map();                  // sl -> {score, chunk}
      for (let i = 0; i < N; i++) {
        if (s[i] <= 0) continue;
        const cur = best.get(chunks[i].sl);
        if (!cur || s[i] > cur.score) best.set(chunks[i].sl, { score: s[i], chunk: i });
      }
      const win = ph.length ? null : dateWindow(q);
      const inWin = o => {
        if (!win) return false;
        const ym = [+o.date.slice(0, 4), +o.date.slice(5, 7)];
        return cmp(win[0], ym) <= 0 && cmp(ym, win[1]) <= 0;
      };
      const res = [];
      if (sem && !ph.length) {
        const dim = sem.vec.length, E = sem.E, v = sem.vec, eb = new Map();
        for (let i = 0; i < N; i++) {
          let d = 0; const o = i * dim;
          for (let k = 0; k < dim; k++) d += E[o + k] * v[k];
          const cur = eb.get(chunks[i].sl);
          if (!cur || d > cur.score) eb.set(chunks[i].sl, { score: d, chunk: i });
        }
        const lexRank = new Map([...best].sort((x, y) => y[1].score - x[1].score || x[0] - y[0]).map(([sl], i) => [sl, i + 1]));
        const semRank = new Map([...eb].sort((x, y) => y[1].score - x[1].score || x[0] - y[0]).map(([sl], i) => [sl, i + 1]));
        const miss = lexRank.size + 1;           // orders with no keyword match share the next rank
        for (const o of orders) {
          const lr = lexRank.get(o.sl) || miss, sr = semRank.get(o.sl);
          const lx = best.get(o.sl);
          res.push({ sl: o.sl, score: 1 / (60 + lr) + 1 / (60 + sr), inWindow: inWin(o),
                     chunk: lx ? lx.chunk : eb.get(o.sl).chunk, keyword: !!lx });
        }
      } else {
        for (const [sl, r] of best) {
          const o = bySl.get(sl);
          res.push({ sl, score: r.score, inWindow: inWin(o), chunk: r.chunk, keyword: true });
        }
      }
      // orders inside a date the query names come first, then by text relevance
      res.sort((a, c) => (c.inWindow - a.inWindow) || (c.score - a.score) || (a.sl - c.sl));
      return { results: limit ? res.slice(0, limit) : res, terms, window: win, phrases: ph.map(p => p.raw) };
    }

    // ~40-word excerpt of the best chunk around the densest run of matched words
    function snippet(r, terms, words) {
      words = words || 40;
      const c = chunks[r.chunk];
      const ws = c.text.split(" ");
      const hit = ws.map(w => { const t = toks(w); return t.length && t.some(x => terms.has(x)) ? terms.get(t.find(x => terms.has(x))) : 0; });
      let bestI = 0, bestV = -1;
      for (let i = 0; i < ws.length; i++) {
        let v = 0; for (let j = i; j < Math.min(ws.length, i + words); j++) v += hit[j];
        if (v > bestV) { bestV = v; bestI = i; }
      }
      const start = Math.max(0, Math.min(bestI - 4, ws.length - words));
      return {
        card: !!c.card,
        lead: start > 0, tail: start + words < ws.length,
        words: ws.slice(start, start + words).map((w, k) => ({ w, hit: hit[start + k] }))
      };
    }

    // fingerprint of the chunk texts, so embeddings built for a different index are refused
    function chunkHash() {
      let h = 2166136261 >>> 0;
      for (const c of chunks) for (let i = 0; i < c.text.length; i++) {
        h ^= c.text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0;
      }
      return h.toString(16);
    }

    return { search, snippet, toks, expand, dateWindow, chunkHash,
             chunkTexts: () => chunks.map(c => c.text), stats: { chunks: N, vocab: vocab.length } };
  }

  const api = { build, toks, dateWindow };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OrderSearch = api;
})(typeof window !== "undefined" ? window : this);
