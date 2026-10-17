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
 *
 * S1010-ES2 (2026-10-17): el canal de internet dice por qué no conecta. Guarda el último estado
 * de la suscripción y el motivo (saneado: sin direcciones, claves ni el tema de la estación) y,
 * si en 10 s no llega SUBSCRIBED, pasa a «error» con ese motivo en vez de quedarse en
 * «conectando» para siempre. `FotoSesion` (sesion-en-vivo.ts) solo copia tipo, etiqueta y
 * abierto, así que el panel lee el estado vivo del canal de la pestaña con `estadoCanalInternet()`.
 */

import { temaPrivado, temaPublico } from "./cripto-estacion";
import type { CanalEstacion } from "./sesion-en-vivo";

const PREFIJO_SOBRE = '{"t":"est"';

export type FaseCanal = "conectando" | "abierto" | "error" | "cerrado";
export interface EstadoCanalEstacion {
  fase: FaseCanal;
  motivo: string | null;
}
/** Canal que además sabe decir en qué fase está y por qué (método opcional para los demás). */
export type CanalConEstado = CanalEstacion & { estado(): EstadoCanalEstacion };

export interface OpcionesCanalInternet {
  /** Espera máxima a SUBSCRIBED antes de dar el canal por caído (10 s por defecto). */
  esperaMs?: number;
  poner?: (fn: () => void, ms: number) => unknown;
  quitar?: (h: unknown) => void;
}

export const ESPERA_SUSCRIPCION_MS = 10_000;
const MAX_MOTIVO = 160;

/** Lectores del estado de los canales de internet vivos en esta pestaña (el último manda). */
const vivosInternet = new Set<() => EstadoCanalEstacion>();

/** Estado del canal de internet vivo de esta pestaña; null si no hay ninguno. */
export function estadoCanalInternet(): EstadoCanalEstacion | null {
  const lectores = Array.from(vivosInternet);
  const ultimo = lectores[lectores.length - 1];
  return ultimo ? ultimo() : null;
}

function mensajeDe(err: unknown): string | null {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    return typeof m === "string" ? m : null;
  }
  return null;
}

/** El mensaje del error, sin el tema, direcciones, claves ni datos largos. Null si no dice nada. */
export function motivoSeguro(err: unknown, tema: string): string | null {
  let t = mensajeDe(err);
  if (!t) return null;
  if (tema) t = t.split(tema).join("(tema de la estación)");
  t = t
    .replace(/\b(?:https?|wss?):\/\/\S+/gi, "(dirección oculta)")
    .replace(/\b[\w-]+\.supabase\.(?:co|in|net)\S*/gi, "(dirección oculta)")
    .replace(/\beyJ[\w-]*\.[\w-]+\.[\w-]*/g, "(clave oculta)")
    .replace(/\bsb_[a-z]+_[\w-]+/gi, "(clave oculta)")
    .replace(/\b[\w-]{32,}\b/g, "(dato oculto)")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;
  return t.length > MAX_MOTIVO ? `${t.slice(0, MAX_MOTIVO - 1)}…` : t;
}

function claveTab(): string {
  try {
    return globalThis.crypto?.randomUUID?.() ?? `tab-${Math.random().toString(36).slice(2)}`;
  } catch {
    return `tab-${Math.random().toString(36).slice(2)}`;
  }
}

/** Canal de difusión de Supabase para una estación. Null si no hay cliente (sin red o sin config). */
export async function crearCanalInternet(
  id: string,
  token: string | null,
  op: OpcionesCanalInternet = {},
): Promise<CanalConEstado | null> {
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
  // Se llaman sin receptor: el setTimeout del navegador exige `this` = window (OPD1010).
  const poner = op.poner ?? ((fn: () => void, ms: number) => globalThis.setTimeout(fn, ms));
  const quitar = op.quitar ?? ((h: unknown) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>));
  const esperaMs = op.esperaMs ?? ESPERA_SUSCRIPCION_MS;
  let fase: FaseCanal = "conectando";
  let motivo: string | null = null;
  let ultimoEstado: string | null = null;
  let espera: unknown = null;
  let cerradoPorNos = false;
  const soltarEspera = () => {
    if (espera !== null) quitar(espera);
    espera = null;
  };
  const leer = (): EstadoCanalEstacion => ({ fase, motivo });
  vivosInternet.add(leer);
  espera = poner(() => {
    espera = null;
    if (fase !== "conectando") return;
    fase = "error";
    motivo = `sin respuesta de Supabase Realtime en ${Math.round(esperaMs / 1000)} s`;
  }, esperaMs);
  canal.subscribe((estado: string, err?: unknown) => {
    if (cerradoPorNos) return; // el CLOSED de removeChannel lo pedimos nosotros
    ultimoEstado = estado;
    if (estado === "SUBSCRIBED") {
      soltarEspera();
      suscrito = true;
      fase = "abierto";
      motivo = null;
      void canal.track({ k: yo }).catch(() => undefined);
      for (const cb of Array.from(alAbrir)) cb();
    } else if (estado === "CLOSED" || estado === "CHANNEL_ERROR" || estado === "TIMED_OUT") {
      suscrito = false;
      const dicho = motivoSeguro(err, tema);
      if (estado === "CLOSED") {
        fase = "cerrado";
        motivo = dicho ?? "Supabase Realtime cerró el canal";
      } else {
        fase = "error";
        motivo = `${dicho ?? (estado === "TIMED_OUT" ? "Supabase Realtime no contestó a tiempo" : "error del canal de Supabase Realtime")} (${ultimoEstado})`;
      }
    }
  });
  return {
    estado: leer,
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
      cerradoPorNos = true;
      soltarEspera();
      vivosInternet.delete(leer);
      fase = "cerrado";
      motivo = null;
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
