/**
 * transporte — `transporte.enviar()`: mensajes de la app entre los medios de la MISMA cuenta por el
 * camino más directo disponible, también sin internet (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Sobre de mensaje y acuse IGUALES a los del transporte universal del OS
 * (`src/lib/malla/transporte-universal.ts`): `{t:"tu.msg", v:1, id, c, b, de}` y `{t:"tu.ack", id}`.
 * Caminos, en este orden:
 *   1. local    → cada enlace emparejado sin internet (`emparejar.ts`), con acuse;
 *   2. pestañas → `BroadcastChannel` (otras pestañas o la PWA de la misma app en este aparato);
 *   3. cuenta   → Supabase Realtime, tema privado de la cuenta y la app
 *                 (`link:<sha256(app:token)>`, el token de presencia de la cuenta: nadie de fuera
 *                 lo calcula). Llega a todos los medios de la cuenta con la app abierta.
 * Cada envío dice por qué caminos salió y cuántos acuses volvieron. Lo que llega dos veces (por
 * dos caminos) se entrega una sola. Lo que llega NUNCA se ejecuta: son datos para la app.
 * Nunca lanza.
 */

import { enlacesLocales, alCambiarEnlacesLocales, type EnlaceLocal } from "./emparejar";
import type { CanalRealtime, ClienteSupabase } from "./supabase";

export interface SobreMensaje {
  t: "tu.msg";
  v: 1;
  id: string;
  /** Canal de aplicación: «presets», «estacion», «nota»… (≤ 40). */
  c: string;
  b: unknown;
  de?: { s?: string; n?: string };
}

export interface SobreAcuse {
  t: "tu.ack";
  id: string;
}

export type Camino = "local" | "pestanas" | "cuenta";

export interface MensajeEntrante {
  id: string;
  canal: string;
  cuerpo: unknown;
  camino: Camino;
  de?: { s?: string; n?: string };
  at: number;
}

export interface ResultadoEnvio {
  ok: boolean;
  id: string;
  caminos: Camino[];
  acuses: number;
  motivo?: string;
}

export function esSobreMensaje(x: unknown): x is SobreMensaje {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return o.t === "tu.msg" && typeof o.id === "string" && o.id.length <= 80 && typeof o.c === "string" && o.c.length <= 40;
}

export function esSobreAcuse(x: unknown): x is SobreAcuse {
  return !!x && typeof x === "object" && (x as Record<string, unknown>).t === "tu.ack" && typeof (x as Record<string, unknown>).id === "string";
}

const MAX_TEXTO = 60_000;

async function sha256Hex(texto: string): Promise<string> {
  const b = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Tema de la cuenta para una app (solo lo calcula quien tiene el token de la cuenta). */
export async function temaCuenta(app: string, token: string): Promise<string> {
  return `link:${(await sha256Hex(`link:${app}:${token}`)).slice(0, 32)}`;
}

function nuevoId(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export interface OpcionesTransporte {
  app: string;
  /** Para el camino «cuenta»: cliente con sesión y token de la cuenta (`presencia` lo lee). */
  cliente?: ClienteSupabase | null;
  token?: string | null;
  /** Quién soy (nombre legible del medio). */
  nombre?: string;
  /** Para pruebas. */
  canalPestanas?: { postMessage(d: unknown): void; onmessage: ((ev: MessageEvent) => void) | null; close(): void } | null;
}

export interface Transporte {
  enviar(canal: string, cuerpo: unknown, op?: { esperarAcuseMs?: number }): Promise<ResultadoEnvio>;
  alRecibir(canal: string, cb: (m: MensajeEntrante) => void): () => void;
  caminos(): { local: number; pestanas: boolean; cuenta: boolean };
  cerrar(): void;
}

/** Crea el transporte de la app. */
export async function crearTransporte(op: OpcionesTransporte): Promise<Transporte> {
  const oyentes = new Map<string, Set<(m: MensajeEntrante) => void>>();
  const vistos: string[] = [];
  const vistosSet = new Set<string>();
  const esperas = new Map<string, () => void>();
  const bajas: (() => void)[] = [];
  const yo = { s: nuevoId().slice(0, 12), ...(op.nombre ? { n: op.nombre.slice(0, 60) } : {}) };

  const entregar = (m: MensajeEntrante) => {
    if (vistosSet.has(m.id)) return;
    vistosSet.add(m.id);
    vistos.push(m.id);
    if (vistos.length > 1000) vistosSet.delete(vistos.shift() as string);
    for (const cb of Array.from(oyentes.get(m.canal) ?? [])) {
      try {
        cb(m);
      } catch {
        /* un oyente roto no tumba a los demás */
      }
    }
  };

  const recibirTexto = (texto: string, camino: Camino, responder: ((t: string) => void) | null) => {
    if (typeof texto !== "string" || texto.length > MAX_TEXTO || !texto.startsWith('{"t":"tu.')) return;
    let o: unknown;
    try {
      o = JSON.parse(texto);
    } catch {
      return;
    }
    if (esSobreAcuse(o)) {
      esperas.get(o.id)?.();
      return;
    }
    if (!esSobreMensaje(o)) return;
    if (o.de?.s === yo.s) return; // eco propio
    if (responder) {
      try {
        responder(JSON.stringify({ t: "tu.ack", id: o.id } satisfies SobreAcuse));
      } catch {
        /* sin acuse */
      }
    }
    entregar({ id: o.id, canal: o.c, cuerpo: o.b, camino, de: o.de, at: Date.now() });
  };

  // 1. enlaces locales
  const escuchando = new Map<string, () => void>();
  const revisarLocales = () => {
    const vivos = new Map(enlacesLocales().map((e) => [e.id, e] as const));
    for (const [id, e] of vivos) {
      if (escuchando.has(id)) continue;
      escuchando.set(id, e.alMensaje((t) => recibirTexto(t, "local", (r) => e.enviar(r))));
    }
    for (const [id, baja] of Array.from(escuchando.entries())) {
      if (!vivos.has(id)) {
        baja();
        escuchando.delete(id);
      }
    }
  };
  revisarLocales();
  bajas.push(alCambiarEnlacesLocales(revisarLocales));
  bajas.push(() => {
    for (const b of escuchando.values()) b();
    escuchando.clear();
  });

  // 2. pestañas
  let bc = op.canalPestanas ?? null;
  if (bc === null && op.canalPestanas === undefined) {
    try {
      bc = typeof BroadcastChannel === "function" ? (new BroadcastChannel(`starseed-link:${op.app}`) as unknown as NonNullable<OpcionesTransporte["canalPestanas"]>) : null;
    } catch {
      bc = null;
    }
  }
  if (bc) {
    bc.onmessage = (ev: MessageEvent) => recibirTexto(String(ev.data ?? ""), "pestanas", (r) => bc?.postMessage(r));
    bajas.push(() => bc?.close());
  }

  // 3. cuenta
  let canalCuenta: CanalRealtime | null = null;
  let cuentaAbierta = false;
  if (op.cliente && op.token) {
    try {
      const tema = await temaCuenta(op.app, op.token);
      const c = op.cliente.channel(tema, { config: { broadcast: { self: false, ack: false } } }) as CanalRealtime;
      c.on("broadcast", { event: "tu" }, (m: { payload?: { x?: unknown } }) => {
        const x = m?.payload?.x;
        if (typeof x === "string") recibirTexto(x, "cuenta", (r) => void c.send({ type: "broadcast", event: "tu", payload: { x: r } }).catch(() => undefined));
      });
      c.subscribe((st: string) => {
        cuentaAbierta = st === "SUBSCRIBED";
      });
      canalCuenta = c;
      const cliente = op.cliente;
      bajas.push(() => {
        try {
          void Promise.resolve(cliente.removeChannel(c)).catch(() => undefined);
        } catch {
          /* nada */
        }
      });
    } catch {
      canalCuenta = null;
    }
  }

  return {
    async enviar(canal, cuerpo, eop = {}) {
      const id = nuevoId();
      if (typeof canal !== "string" || !canal || canal.length > 40) return { ok: false, id, caminos: [], acuses: 0, motivo: "Canal no válido." };
      let texto: string;
      try {
        texto = JSON.stringify({ t: "tu.msg", v: 1, id, c: canal, b: cuerpo, de: yo } satisfies SobreMensaje);
      } catch {
        return { ok: false, id, caminos: [], acuses: 0, motivo: "El mensaje no se puede enviar (no es JSON)." };
      }
      if (texto.length > MAX_TEXTO) return { ok: false, id, caminos: [], acuses: 0, motivo: "Mensaje demasiado grande (máx. 60 KB): usa un archivo." };
      let acuses = 0;
      esperas.set(id, () => {
        acuses++;
      });
      const caminos: Camino[] = [];
      const locales: EnlaceLocal[] = enlacesLocales();
      for (const e of locales) {
        try {
          e.enviar(texto);
          if (!caminos.includes("local")) caminos.push("local");
        } catch {
          /* ese enlace cayó */
        }
      }
      if (bc) {
        try {
          bc.postMessage(texto);
          caminos.push("pestanas");
        } catch {
          /* nada */
        }
      }
      if (canalCuenta && cuentaAbierta) {
        try {
          void canalCuenta.send({ type: "broadcast", event: "tu", payload: { x: texto } }).catch(() => undefined);
          caminos.push("cuenta");
        } catch {
          /* nada */
        }
      }
      const espera = Math.max(0, eop.esperarAcuseMs ?? 1500);
      if (espera > 0 && caminos.length) await new Promise((r) => setTimeout(r, espera));
      esperas.delete(id);
      return caminos.length
        ? { ok: true, id, caminos, acuses }
        : { ok: false, id, caminos, acuses, motivo: "No hay ningún camino abierto: ni enlace local, ni otra pestaña, ni internet con sesión." };
    },
    alRecibir(canal, cb) {
      let set = oyentes.get(canal);
      if (!set) {
        set = new Set();
        oyentes.set(canal, set);
      }
      set.add(cb);
      return () => {
        set?.delete(cb);
      };
    },
    caminos: () => ({ local: enlacesLocales().length, pestanas: !!bc, cuenta: !!canalCuenta && cuentaAbierta }),
    cerrar() {
      for (const b of bajas.splice(0)) {
        try {
          b();
        } catch {
          /* nada */
        }
      }
      oyentes.clear();
    },
  };
}

/** Lee el token de presencia de la cuenta (el mismo del OS) para el camino «cuenta». */
export async function tokenDeCuenta(cliente: ClienteSupabase | null | undefined): Promise<string | null> {
  if (!cliente) return null;
  try {
    const { data: s } = await cliente.auth.getSession();
    const uid = s?.session?.user?.id;
    if (!uid) return null;
    const { data } = await cliente.from("user_settings").select('canal:prefs->>"starseed.neuronas.canal.v1"').eq("user_id", uid).maybeSingle();
    const t = typeof data?.canal === "string" ? data.canal.replace(/^"|"$/g, "").trim() : "";
    return /^[0-9a-f]{16,64}$/.test(t) ? t : null;
  } catch {
    return null;
  }
}
