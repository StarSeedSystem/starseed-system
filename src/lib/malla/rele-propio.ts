/**
 * rele-propio — adaptador de relé en TU servidor para trozos sellados (PTA1108C · 2026-11-08).
 * Contrato: `architecture/red-sin-dependencias.md` §5.2. Lleva exactamente lo mismo que el relé de StarSeed (texto cifrado,
 * envuelto con el remitente para que la vuelta funcione) por un servidor que el dueño configura: el A1/Coolify de
 * `architecture/*`, un Supabase autoalojado, cualquier servicio que cumpla este contrato HTTP:
 *
 *   POST {url}/v1/rele/enviar            {id, para, de: {rele, uid?}, p}      → 200 {ok:true}
 *   GET  {url}/v1/rele/recibir?yo=<rele>&desde=<cursor>   → 200 {mensajes: [{id, de: {rele, uid?}, p}], sig}
 *   Autorización opcional: `Authorization: Bearer <token>`. Cada mensaje ≤ 160 KiB; el servidor no necesita leerlo.
 *
 * El `fetch` que se inyecta es el de la malla (`fetchConPuerta`): si tu servidor está en tu red local y esta neurona no está en
 * ella, la petición sale por una neurona tuya que sí llega (capa «servidor propio», `puerta/capas.ts`).
 * HECHO: el adaptador, su configuración y su prueba. PENDIENTE: el servicio del lado del servidor (no existe en el repo) y probarlo
 * con un servidor real.
 */

import { MAX_ENVOLTORIO, leerReleEnvuelto, type RemitenteRele } from "@/lib/malla/rele-bidireccional";

export const CLAVE_RELE_PROPIO = "starseed.archivos.rele-propio.v1";

export interface ConfigRelePropio {
  url: string;
  token?: string;
}

type Almacen = Pick<Storage, "getItem" | "setItem">;

/** Una URL sirve si es https, o http hacia un host privado (tu servidor en casa). Nada de credenciales en la URL. */
export function urlRelePropioValida(url: unknown): url is string {
  if (typeof url !== "string" || url.length > 300) return false;
  try {
    const u = new URL(url);
    if (u.username || u.password || u.search || u.hash) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|.*\.(local|lan|home|internal)$)/i.test(u.hostname);
  } catch {
    return false;
  }
}

export function leerConfigRelePropio(almacen?: Almacen | null): ConfigRelePropio | null {
  try {
    const s = almacen ?? (typeof localStorage !== "undefined" ? localStorage : null);
    const o = JSON.parse(s?.getItem(CLAVE_RELE_PROPIO) ?? "null") as Record<string, unknown> | null;
    if (!o || !urlRelePropioValida(o.url)) return null;
    return { url: o.url.replace(/\/$/, ""), ...(typeof o.token === "string" && o.token.length > 0 && o.token.length <= 512 ? { token: o.token } : {}) };
  } catch {
    return null;
  }
}

export function guardarConfigRelePropio(c: ConfigRelePropio | null, almacen?: Almacen | null): boolean {
  try {
    const s = almacen ?? (typeof localStorage !== "undefined" ? localStorage : null);
    if (!s) return false;
    s.setItem(CLAVE_RELE_PROPIO, JSON.stringify(c && urlRelePropioValida(c.url) ? c : null));
    return true;
  } catch {
    return false;
  }
}

export interface MensajeRelePropio {
  id: string;
  de: RemitenteRele;
  p: string;
}

export interface ClienteRelePropio {
  enviar(id: string, para: string, de: RemitenteRele, p: string): Promise<boolean>;
  recibir(yo: string, desde: string | null): Promise<{ mensajes: MensajeRelePropio[]; sig: string | null }>;
}

export function crearClienteRelePropio(cfg: ConfigRelePropio, fetchFn: typeof fetch = (i, n) => fetch(i, n)): ClienteRelePropio {
  const cab = (): Record<string, string> => ({ "content-type": "application/json", ...(cfg.token ? { authorization: `Bearer ${cfg.token}` } : {}) });
  return {
    async enviar(id, para, de, p) {
      if (!para || p.length > MAX_ENVOLTORIO) return false;
      try {
        const r = await fetchFn(`${cfg.url}/v1/rele/enviar`, { method: "POST", headers: cab(), body: JSON.stringify({ id, para, de, p }), cache: "no-store" });
        return r.ok;
      } catch {
        return false;
      }
    },
    async recibir(yo, desde) {
      try {
        const q = `yo=${encodeURIComponent(yo)}${desde ? `&desde=${encodeURIComponent(desde)}` : ""}`;
        const r = await fetchFn(`${cfg.url}/v1/rele/recibir?${q}`, { method: "GET", headers: cab(), cache: "no-store" });
        if (!r.ok) return { mensajes: [], sig: desde };
        const j = (await r.json()) as { mensajes?: unknown; sig?: unknown };
        const mensajes: MensajeRelePropio[] = [];
        for (const m of Array.isArray(j.mensajes) ? j.mensajes.slice(0, 64) : []) {
          const o = m as Record<string, unknown>;
          const env = typeof o?.p === "string" ? o.p : null;
          const de = o?.de as Record<string, unknown> | undefined;
          if (typeof o?.id !== "string" || !env || !de || typeof de.rele !== "string" || !de.rele || env.length > MAX_ENVOLTORIO) continue;
          mensajes.push({ id: o.id.slice(0, 80), de: { rele: de.rele.slice(0, 128), ...(typeof de.uid === "string" && de.uid ? { uid: de.uid.slice(0, 128) } : {}) }, p: env });
        }
        return { mensajes, sig: typeof j.sig === "string" ? j.sig.slice(0, 200) : desde };
      } catch {
        return { mensajes: [], sig: desde };
      }
    },
  };
}

/**
 * Bucle de recepción: pregunta al servidor cada `cadaMs` y entrega cada trozo (ya sin envoltorio de servidor) a `alMensaje`.
 * `p` puede traer el envoltorio bidireccional; `alMensaje` recibe el texto tal cual para decidir con `leerReleEnvuelto`.
 */
export function iniciarRecepcionRelePropio(o: {
  cliente: ClienteRelePropio;
  yo: () => Promise<string | null> | string | null;
  alMensaje: (m: MensajeRelePropio) => void;
  cadaMs?: number;
  esperar?: (ms: number) => Promise<void>;
}): () => void {
  let vivo = true;
  let cursor: string | null = null;
  const esperar = o.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  void (async () => {
    while (vivo) {
      try {
        const yo = await o.yo();
        if (yo) {
          const r = await o.cliente.recibir(yo, cursor);
          cursor = r.sig;
          for (const m of r.mensajes) {
            // Solo lo que de verdad es un trozo de esta capa.
            if (leerReleEnvuelto(m.p) || m.p.startsWith('{"t":"archivo.')) o.alMensaje(m);
          }
        }
      } catch {
        /* se reintenta en el siguiente turno */
      }
      await esperar(o.cadaMs ?? 5000);
    }
  })();
  return () => {
    vivo = false;
  };
}
