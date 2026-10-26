/**
 * Latido para redibujar el lienzo mientras se graba.
 * Un `setInterval` de la página se frena (≥ 1 s) cuando la pestaña queda en segundo plano, y grabar
 * la pantalla es justo lo que obliga a cambiar de pestaña o de ventana. Un Worker no se frena: el
 * ticker vive allí (`worker-src blob:` está permitido en la CSP del OS) y avisa a la página. Si no
 * hay Worker, cae al `setInterval` de siempre.
 */

export interface DepsLatido {
  Worker?: (new (url: string) => { onmessage: ((e: unknown) => void) | null; terminate(): void }) | null;
  crearUrl?: (blob: Blob) => string;
  revocarUrl?: (url: string) => void;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (id: unknown) => void;
}

export function crearLatido(cb: () => void, fps: number, deps: DepsLatido = {}): () => void {
  const ms = Math.max(1, Math.round(1000 / Math.max(1, fps)));
  const W = deps.Worker === undefined ? (typeof Worker === "function" ? (Worker as unknown as NonNullable<DepsLatido["Worker"]>) : null) : deps.Worker;
  const crearUrl = deps.crearUrl ?? (typeof URL !== "undefined" ? (b: Blob) => URL.createObjectURL(b) : undefined);
  const revocarUrl = deps.revocarUrl ?? (typeof URL !== "undefined" ? (u: string) => URL.revokeObjectURL(u) : undefined);

  if (W && crearUrl && typeof Blob === "function") {
    let url: string | null = null;
    try {
      url = crearUrl(new Blob([`setInterval(function(){postMessage(0)},${ms})`], { type: "text/javascript" }));
      const worker = new W(url);
      worker.onmessage = () => cb();
      const aRevocar = url;
      return () => {
        try {
          worker.terminate();
        } catch {
          /* ya parado */
        }
        try {
          revocarUrl?.(aRevocar);
        } catch {
          /* */
        }
      };
    } catch {
      try {
        if (url) revocarUrl?.(url);
      } catch {
        /* */
      }
      /* sin Worker utilizable: ticker normal */
    }
  }
  const si = deps.setInterval ?? ((fn: () => void, t: number) => setInterval(fn, t));
  const ci = deps.clearInterval ?? ((id: unknown) => clearInterval(id as ReturnType<typeof setInterval>));
  const id = si(cb, ms);
  return () => ci(id);
}
