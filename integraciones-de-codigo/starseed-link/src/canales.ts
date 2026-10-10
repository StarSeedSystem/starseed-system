/**
 * canales — por dónde viaja una estación en vivo desde una app (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Los MISMOS canales que usa el OS (`src/lib/estaciones/canales-estacion.ts`):
 *   · internet → Supabase Realtime, difusión del tema de la estación (`estacion-vivo:<id>` o, si
 *     es privada, `estacion-p:<hash>`, que solo calcula quien tiene el token), evento «m» con
 *     `{ x: <sobre> }`, y presencia para contar conectados. Sin tablas nuevas.
 *   · local    → cada enlace emparejado SIN internet que esté abierto (`emparejar.ts`). Coste cero
 *     y ida y vuelta de pocos ms.
 */

import { temaPrivado, temaPublico } from "./cripto";
import { alCambiarEnlacesLocales, enlacesLocales, type EnlaceLocal } from "./emparejar";
import type { CanalEstacion } from "./sesion";
import type { CanalRealtime, ClienteSupabase } from "./supabase";

export const PREFIJO_SOBRE_ESTACION = '{"t":"est"';

function claveTab(): string {
  try {
    return globalThis.crypto?.randomUUID?.() ?? `tab-${Math.random().toString(36).slice(2)}`;
  } catch {
    return `tab-${Math.random().toString(36).slice(2)}`;
  }
}

/** Canal de internet de una estación con el cliente de la app. Null sin cliente. */
export async function canalInternet(cliente: ClienteSupabase | null | undefined, id: string, token: string | null): Promise<CanalEstacion | null> {
  if (!cliente) return null;
  const tema = token ? await temaPrivado(id, token) : temaPublico(id);
  const yo = claveTab();
  const oyentes = new Set<(t: string) => void>();
  const alAbrir = new Set<() => void>();
  let suscrito = false;
  let conectados: number | null = null;
  let canal: CanalRealtime;
  try {
    canal = cliente.channel(tema, { config: { broadcast: { self: false, ack: false }, presence: { key: yo } } }) as CanalRealtime;
  } catch {
    return null;
  }
  canal.on("broadcast", { event: "m" }, (m: { payload?: { x?: unknown } }) => {
    const x = m?.payload?.x;
    if (typeof x !== "string" || !x.startsWith(PREFIJO_SOBRE_ESTACION)) return;
    for (const cb of Array.from(oyentes)) cb(x);
  });
  canal.on("presence", { event: "sync" }, () => {
    try {
      conectados = Math.max(0, Object.keys(canal.presenceState() ?? {}).length - 1);
    } catch {
      conectados = null;
    }
  });
  canal.subscribe((estado: string) => {
    if (estado === "SUBSCRIBED") {
      suscrito = true;
      void canal.track({ k: yo }).catch(() => undefined);
      for (const cb of Array.from(alAbrir)) cb();
    } else if (estado === "CLOSED" || estado === "CHANNEL_ERROR" || estado === "TIMED_OUT") {
      suscrito = false;
    }
  });
  return {
    tipo: "internet",
    etiqueta: "Internet (Supabase Realtime)",
    enviar(texto) {
      if (!suscrito) return;
      void canal.send({ type: "broadcast", event: "m", payload: { x: texto } }).catch(() => undefined);
    },
    alRecibir(cb) {
      oyentes.add(cb);
      return () => {
        oyentes.delete(cb);
      };
    },
    abierto: () => suscrito,
    oyentes: () => conectados,
    alAbrir(cb) {
      alAbrir.add(cb);
      return () => {
        alAbrir.delete(cb);
      };
    },
    cerrar() {
      suscrito = false;
      oyentes.clear();
      alAbrir.clear();
      try {
        void Promise.resolve(cliente.removeChannel(canal)).catch(() => undefined);
      } catch {
        /* nada */
      }
    },
  };
}

/** Un enlace local como canal de estación (solo deja pasar sobres de estación). */
export function canalDeEnlaceLocal(e: EnlaceLocal): CanalEstacion {
  return {
    tipo: "local",
    etiqueta: `Enlace local · ${e.par?.nombre || "aparato emparejado"}`,
    enviar: (t) => {
      try {
        e.enviar(t);
      } catch {
        /* nada */
      }
    },
    alRecibir: (cb) => e.alMensaje((d) => (d.startsWith(PREFIJO_SOBRE_ESTACION) ? cb(d) : undefined)),
    abierto: () => {
      try {
        return e.abierto();
      } catch {
        return false;
      }
    },
    oyentes: () => 1,
    cerrar: () => undefined, // el enlace no es de la estación: solo se deja de escuchar
  };
}

/** Engancha la sesión a todos los enlaces locales abiertos y a los que se abran. Devuelve la baja. */
export function engancharEnlacesLocales(poner: (c: CanalEstacion) => void, quitar: (c: CanalEstacion) => void): () => void {
  const envueltos = new Map<string, CanalEstacion>();
  const revisar = () => {
    const vivos = new Map(enlacesLocales().map((e) => [e.id, e] as const));
    for (const [id, e] of vivos) {
      if (envueltos.has(id)) continue;
      const c = canalDeEnlaceLocal(e);
      envueltos.set(id, c);
      poner(c);
    }
    for (const [id, c] of Array.from(envueltos.entries())) {
      if (!vivos.has(id)) {
        envueltos.delete(id);
        quitar(c);
      }
    }
  };
  revisar();
  const baja = alCambiarEnlacesLocales(revisar);
  return () => {
    baja();
    for (const c of envueltos.values()) quitar(c);
    envueltos.clear();
  };
}
