/* "Search by meaning": loads a small embedding model (all-MiniLM-L6-v2, quantized) into the
   browser on first use, and blends it with keyword search. Everything is served from this
   site (assets/vendor, models/, data/emb_minilm.*); nothing is sent to any other server.
   The model is cached by the browser after the first load. */
const Meaning = (() => {
  "use strict";
  const base = document.baseURI;
  const url = p => new URL(p, base).href;
  let state = "off", embedFn = null, E = null, loading = null;

  async function load(engine, onProgress) {
    if (embedFn) return;
    if (loading) return loading;
    loading = (async () => {
      const [{ env, pipeline }, meta, bin] = await Promise.all([
        import(url("assets/vendor/transformers.min.js")),
        fetch(url("data/emb_minilm.json")).then(r => { if (!r.ok) throw new Error("embeddings " + r.status); return r.json(); }),
        fetch(url("data/emb_minilm.bin")).then(r => { if (!r.ok) throw new Error("embeddings " + r.status); return r.arrayBuffer(); })
      ]);
      if (meta.chunkHash !== engine.chunkHash() || bin.byteLength !== meta.n * meta.dim)
        throw new Error("embeddings were built for a different search index");
      env.allowRemoteModels = false;
      env.allowLocalModels = true;
      env.localModelPath = url("models/");
      env.backends.onnx.wasm.wasmPaths = {
        mjs: url("assets/vendor/ort-wasm-simd-threaded.jsep.js"),
        wasm: url("assets/vendor/ort-wasm-simd-threaded.jsep.wasm")
      };
      env.backends.onnx.wasm.numThreads = 1;
      const files = {};
      const pipe = await pipeline("feature-extraction", meta.model, {
        dtype: meta.dtype, device: "wasm",
        progress_callback: p => {
          if (p.status === "progress" && p.total) {
            files[p.file] = [p.loaded, p.total];
            const v = Object.values(files), l = v.reduce((a, x) => a + x[0], 0), t = v.reduce((a, x) => a + x[1], 0);
            onProgress && onProgress(l / t);
          }
        }
      });
      E = new Int8Array(bin);
      embedFn = async q => (await pipe(q, { pooling: "mean", normalize: true })).data;
      await embedFn("warm up");
    })();
    try { await loading; } catch (e) { loading = null; throw e; }
  }

  return {
    load,
    ready: () => !!embedFn,
    get state() { return state; }, set state(s) { state = s; },
    async sem(q) { return { vec: await embedFn(q), E }; }
  };
})();
