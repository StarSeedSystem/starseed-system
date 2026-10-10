"use client";

/**
 * canales-estacion — los canales REALES por los que viaja una estación en vivo (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════
 * SOP: `architecture/estaciones-en-vivo-parametricas.md` (§4.2).
 *
 *   · internet → Supabase Realtime, canal de difusión del tema de la estación (`temaPublico` o,
 *     si es privada, `temaPrivado`, que solo calcula quien tiene el token). Presencia para contar
 *     conectados. Sin sondeo y sin tablas nuevas. Cuesta mensajes de Realtime: ver el SOP §6.
 *   · local    → cada enlace P2P emparejado SIN internet que esté vivo en esta pestaña
 *     (`registro-enlaces-locales.ts`, el mismo registro que usa el transporte universal). Por ahí
 *     la ida y vuelta es de pocos ms, así que el reloj común baja a ±1 ms. Coste cero.
 *
 * Los dos se importan perezosos: este módulo solo baja cuando alguien sintoniza una estación.
 */

import { temaPrivado, temaPublico } from "./cripto-estacion";
import type { CanalEstacion } from "./sesion-en-vivo";

const PREFIJO_SOBRE = '{"t":"est"';

function claveTab(): string {
  try {
    return globalThis.crypto?.randomUUID?.() ?? `tab-${Math.random().toString(36).slice(2)}`;
  } catch {
    return `tab-${Math.random().toString(36).slice(2)}`;
  }
}

/** Canal de difusión de Supabase para una estación. Null si no hay cliente (sin red o sin config). */
export async function crearCanalInternet(id: string, token: string | null): Promise<CanalEstacion | null> {
  let cliente: ReturnType<typeof import("@/utils/supabase/client").createClient>;
  try {
    const { createClient } = await import("@/utils/supabase/client");
    cliente = createClient();
  } catch {
    return null;
  }
  const tema = token ? await temaPrivado(id, token) : temaPublico(id);
  const yo = claveTab();
  const oyentes = new Set<(t: string) => void>();
  const alAbrir = new Set<() => void>();
  let suscrito = false;
  let conectados: number | null = null;
  const canal = cliente.channel(tema, {
    config: { broadcast: { self: false, ack: false }, presence: { key: yo } },
  });
  canal.on("broadcast", { event: "m" }, (m: { payload?: { x?: unknown } }) => {
    const x = m?.payload?.x;
    if (typeof x !== "string" || !x.startsWith(PREFIJO_SOBRE)) return;
    for (const cb of Array.from(oyentes)) cb(x);
  });
  canal.on("presence", { event: "sync" }, () => {
    try {
      const n = Object.keys(canal.presenceState() ?? {}).length;
      conectados = Math.max(0, n - 1);
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
        void cliente.removeChannel(canal);
      } catch {
        /* nada */
      }
    },
  };
}

/**
 * Engancha la sesión a todos los enlaces locales (sin internet) vivos y a los que se abran
 * después. `poner`/`quitar` reciben el canal envuelto. Devuelve la baja.
 */
export async function engancharEnlacesLocales(
  poner: (c: CanalEstacion) => void,
  quitar: (c: CanalEstacion) => void,
): Promise<() => void> {
  let reg: typeof import("@/lib/malla/registro-enlaces-locales");
  try {
    reg = await import("@/lib/malla/registro-enlaces-locales");
  } catch {
    return () => undefined;
  }
  const envueltos = new Map<string, CanalEstacion>();
  const envolver = (e: import("@/lib/malla/registro-enlaces-locales").EnlaceLocalVivo) => {
    if (envueltos.has(e.id)) return;
    const c: CanalEstacion = {
      tipo: "local",
      etiqueta: `Enlace local · ${e.par?.nombre || "aparato emparejado"}`,
      enviar: (texto) => {
        try {
          e.enviar(texto);
        } catch {
          /* nada */
        }
      },
      alRecibir: (cb) =>
        e.alMensaje((data) => {
          if (typeof data === "string" && data.startsWith(PREFIJO_SOBRE)) cb(data);
        }),
      abierto: () => {
        try {
          return e.abierto();
        } catch {
          return false;
        }
      },
      oyentes: () => 1,
      cerrar: () => undefined, // el enlace no es nuestro: solo dejamos de escucharlo
    };
    envueltos.set(e.id, c);
    poner(c);
  };
  const bajaAlta = reg.alRegistrarEnlaceLocal(envolver);
  const bajaCambio = reg.suscribirEnlacesLocales(() => {
    const vivos = new Set(reg.enlacesLocalesVivos().map((x) => x.id));
    for (const [id, c] of Array.from(envueltos.entries())) {
      if (!vivos.has(id)) {
        envueltos.delete(id);
        quitar(c);
      }
    }
  });
  return () => {
    bajaAlta();
    bajaCambio();
    for (const c of envueltos.values()) quitar(c);
    envueltos.clear();
  };
}
