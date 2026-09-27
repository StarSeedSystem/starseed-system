// Radio nativa en el navegador (Ola 375 · RDV11): pide al Mando local lo que la Mac ve por
// su Wi-Fi y su Bluetooth. `/api/mando/radio-local` solo existe servido en la propia Mac
// (en producción da 404), así que fuera de localhost NO se hace ninguna petición.
import type { RadioLocal } from "@/lib/mando/radio-local-tipos";

const VIGENCIA_MS = 60_000;
/** Un 404/403 o un fallo de red se recuerda 10 min: no se insiste. */
const OLVIDO_FALLO_MS = 10 * 60_000;
const LOCALES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

let cache: RadioLocal | null = null;
let cacheEn = 0;
let falloEn: number | null = null;
let enVuelo: Promise<RadioLocal | null> | null = null;

export function esOrigenLocal(host?: string): boolean {
  const h = host ?? (typeof location !== "undefined" ? location.hostname : "");
  return LOCALES.has(h);
}

/** Lo último que se leyó (o null), sin pedir nada. */
export function radioLocalEnCache(): RadioLocal | null {
  return cache;
}

/** Radio de la Mac con caché de 60 s; null fuera de localhost o si el Mando no la sirve. */
export async function obtenerRadioLocal(opts?: { ahora?: number; host?: string }): Promise<RadioLocal | null> {
  const ahora = opts?.ahora ?? Date.now();
  if (!esOrigenLocal(opts?.host)) return null;
  if (cache && ahora - cacheEn < VIGENCIA_MS) return cache;
  if (falloEn !== null && ahora - falloEn < OLVIDO_FALLO_MS) return cache;
  if (enVuelo) return enVuelo;
  enVuelo = (async () => {
    try {
      const r = await fetch("/api/mando/radio-local", { cache: "no-store" });
      if (!r.ok) {
        falloEn = ahora;
        return cache;
      }
      const cuerpo = (await r.json()) as { ok?: boolean; radio?: RadioLocal };
      if (cuerpo?.ok && cuerpo.radio) {
        cache = cuerpo.radio;
        cacheEn = ahora;
        falloEn = null;
        return cache;
      }
      falloEn = ahora;
      return cache;
    } catch {
      falloEn = ahora;
      return cache;
    } finally {
      enVuelo = null;
    }
  })();
  return enVuelo;
}

/** Solo para pruebas: vuelve al estado inicial. */
export function reiniciarRadioLocalCliente(): void {
  cache = null;
  cacheEn = 0;
  falloEn = null;
  enVuelo = null;
}
