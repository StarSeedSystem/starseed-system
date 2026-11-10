/**
 * Worker de preparación de archivos (ARC1110A): calcula el SHA-256 por trozos FUERA del hilo principal.
 * Recibe `{ t: "preparar", archivo, tamTrozo, trozos }` y contesta `progreso`, `listo` o `error`.
 * `{ t: "cancelar" }` lo detiene entre bloques. Ver `preparacion-archivo.ts`.
 */
import { hashearPorBloques } from "@/lib/malla/preparacion-archivo-nucleo";

interface Contexto {
  postMessage(m: unknown): void;
  onmessage: ((e: { data: unknown }) => void) | null;
}
const ctx = self as unknown as Contexto;

let cancelar = false;

ctx.onmessage = (e) => {
  const d = e.data as { t?: string; archivo?: Blob; tamTrozo?: number; trozos?: number } | null;
  if (!d) return;
  if (d.t === "cancelar") {
    cancelar = true;
    return;
  }
  if (d.t !== "preparar" || !d.archivo || typeof d.tamTrozo !== "number" || typeof d.trozos !== "number") return;
  ctx.postMessage({ t: "vivo" });
  void hashearPorBloques(d.archivo, d.tamTrozo, d.trozos, {
    alProgreso: (pct) => ctx.postMessage({ t: "progreso", pct }),
    cancelado: () => cancelar,
  }).then((r) => {
    if (r.ok) ctx.postMessage({ t: "listo", raiz: r.raiz });
    else ctx.postMessage({ t: "error", cancelado: r.cancelado, motivo: r.motivo });
  });
};
