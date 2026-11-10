/**
 * preparacion-archivo — prepara un archivo para ofrecerlo SIN bloquear la interfaz (ARC1110A · 2026-11-10).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Antes, `enviarArchivo` calculaba el SHA-256 de TODO el archivo en el hilo principal antes de mandar la oferta: con un
 * vídeo de decenas de MB en el WebView de la tablet, el otro aparato veía el mensaje del archivo al instante y la
 * ventana para aceptarlo minutos después (Prueba.29 y Prueba.32). Ahora:
 *   · el cálculo va en un Worker (`preparacion-archivo.worker.ts`), leyendo el archivo en bloques, con avance;
 *   · si no hay Worker (pruebas, un WebView sin él) o no arranca en `PLAZO_ARRANQUE_WORKER_MS`, el mismo cálculo corre en el
 *     hilo principal CEDIENDO el turno entre bloques (la interfaz sigue viva);
 *   · se puede cancelar; el resultado es la misma raíz de siempre (`calcularHashLista`), así que la verificación del
 *     receptor no cambia.
 * Nunca lanza.
 */

import { hashearPorBloques, type ResultadoHash } from "@/lib/malla/preparacion-archivo-nucleo";

export const PLAZO_ARRANQUE_WORKER_MS = 4_000;

export interface OpcionesPreparacion {
  alProgreso?: (pct: number) => void;
  cancelado?: () => boolean;
  /** false = nunca Worker (pruebas del camino de hilo). */
  usarWorker?: boolean;
}

export type ResultadoPreparacion = ({ ok: true; raiz: string } | { ok: false; cancelado: boolean; motivo: string }) & { via: "worker" | "hilo"; ms: number };

/**
 * Cede el turno al hilo principal SIN depender de `setTimeout` (que el navegador frena a ≥4 s en segundo plano y las
 * pruebas con relojes falsos congelan): `setImmediate` donde existe (Node/pruebas), si no un `MessageChannel`.
 */
let canalCeder: MessageChannel | null = null;
const ceder = (): Promise<void> =>
  new Promise((res) => {
    if (typeof setImmediate === "function") {
      setImmediate(res);
      return;
    }
    try {
      if (typeof MessageChannel !== "undefined") {
        if (!canalCeder) canalCeder = new MessageChannel();
        const c = canalCeder;
        c.port1.onmessage = () => res();
        c.port2.postMessage(0);
        return;
      }
    } catch {
      /* cae a setTimeout */
    }
    setTimeout(res, 0);
  });
const ahora = (): number => {
  try {
    return performance.now();
  } catch {
    return Date.now();
  }
};

async function enHilo(archivo: Blob, tamTrozo: number, trozos: number, o: OpcionesPreparacion): Promise<ResultadoHash> {
  return hashearPorBloques(archivo, tamTrozo, trozos, { alProgreso: o.alProgreso, cancelado: o.cancelado, ceder });
}

function enWorker(archivo: Blob, tamTrozo: number, trozos: number, o: OpcionesPreparacion): Promise<ResultadoHash | null> {
  return new Promise((resolve) => {
    let w: Worker;
    try {
      w = new Worker(new URL("./preparacion-archivo.worker.ts", import.meta.url), { type: "module" });
    } catch {
      resolve(null);
      return;
    }
    let hecho = false;
    let vivo = false;
    const fin = (r: ResultadoHash | null): void => {
      if (hecho) return;
      hecho = true;
      clearTimeout(arranque);
      clearInterval(vigia);
      try {
        w.terminate();
      } catch {
        /* ya cerrado */
      }
      resolve(r);
    };
    const arranque = setTimeout(() => {
      if (!vivo) fin(null); // el Worker no arrancó: que lo haga el hilo
    }, PLAZO_ARRANQUE_WORKER_MS);
    const vigia = setInterval(() => {
      if (o.cancelado?.()) {
        try {
          w.postMessage({ t: "cancelar" });
        } catch {
          /* noop */
        }
        fin({ ok: false, cancelado: true, motivo: "cancelado" });
      }
    }, 250);
    w.onmessage = (e: MessageEvent) => {
      const d = e.data as { t?: string; pct?: number; raiz?: string; cancelado?: boolean; motivo?: string } | null;
      if (!d) return;
      vivo = true;
      if (d.t === "progreso" && typeof d.pct === "number") {
        try {
          o.alProgreso?.(d.pct);
        } catch {
          /* informativo */
        }
      } else if (d.t === "listo" && typeof d.raiz === "string") fin({ ok: true, raiz: d.raiz });
      else if (d.t === "error") fin(d.cancelado ? { ok: false, cancelado: true, motivo: "cancelado" } : null);
    };
    w.onerror = () => fin(null);
    try {
      w.postMessage({ t: "preparar", archivo, tamTrozo, trozos });
    } catch {
      fin(null);
    }
  });
}

/** Raíz SHA-256 por trozos de `archivo`, fuera del hilo principal si se puede. Nunca lanza. */
export async function prepararArchivo(archivo: Blob, tamTrozo: number, trozos: number, o: OpcionesPreparacion = {}): Promise<ResultadoPreparacion> {
  const t0 = ahora();
  if (o.usarWorker !== false && typeof Worker !== "undefined") {
    const r = await enWorker(archivo, tamTrozo, trozos, o).catch(() => null);
    if (r) return { ...r, via: "worker", ms: Math.round(ahora() - t0) };
  }
  const r = await enHilo(archivo, tamTrozo, trozos, o);
  return { ...r, via: "hilo", ms: Math.round(ahora() - t0) };
}
