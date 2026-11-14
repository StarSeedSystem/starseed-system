/**
 * canal-posicion — el canal PRIVADO por el que viaja la posición exacta entre las neuronas de UNA cuenta (MAP1114D).
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * Decisión de Alex (14-11-2026): la posición exacta solo viaja entre las neuronas de su cuenta.
 *  · Tema `pos:<uid>`, Realtime con `private: true`. El servidor decide con las políticas de `realtime.messages`
 *    de la migración `20261114180000_senales_posicion_privada.sql`: una persona con sesión solo entra al tema de SU uid.
 *  · NO se toca el canal de presencia `neur:<token>` (`lib/neurons/presencia.ts`): lo usan versiones ya publicadas.
 *  · Si la unión se rechaza (migración sin aplicar, sin sesión, sin red), NO se manda nada por ningún otro canal y
 *    el estado lo dice con su motivo.
 * El cliente de Realtime se inyecta: así se prueba con uno falso. Sin React ni `node:*`.
 */

import { anuncioDesdeCruda, leerAnuncio, type AnuncioPosicion, type PosicionCruda } from "./modelo-geo";

export const PREFIJO_TEMA_POSICION = "pos:";

/** El tema de posición de una cuenta; `null` si no hay uid utilizable (sin sesión). */
export function temaPosicion(uid: string | null | undefined): string | null {
  return typeof uid === "string" && uid.length >= 8 && !/[:\s]/.test(uid) ? `${PREFIJO_TEMA_POSICION}${uid}` : null;
}

/**
 * La lógica de las políticas SQL, en código: una persona con sesión solo puede entrar (leer y escribir) al tema
 * `pos:<su uid>`. Es la MISMA condición que `realtime.topic() = 'pos:' || auth.uid()::text`; la prueba compara las dos.
 */
export function temaPermitido(tema: string, uid: string | null | undefined): boolean {
  const t = temaPosicion(uid);
  return t !== null && tema === t;
}

export type EstadoUnion = "sin-intentar" | "uniendo" | "unido" | "rechazado";

export interface EstadoCanalPosicion {
  union: EstadoUnion;
  /** Por qué no está unido (rechazado) o qué falta; null mientras está unido. */
  motivo: string | null;
  /** Posiciones recibidas por neurona (la nuestra incluida), tal cual las anunció cada una. */
  posiciones: Readonly<Record<string, AnuncioPosicion>>;
  /** Cuándo cambió el estado (epoch ms). */
  desde: number;
}

export const ESTADO_INICIAL: EstadoCanalPosicion = { union: "sin-intentar", motivo: "todavía no se intentó unir el canal privado de posición", posiciones: {}, desde: 0 };

/** Lo mínimo del canal de Supabase Realtime que se usa. */
export interface CanalRealtimeMin {
  on(tipo: "presence", filtro: { event: string }, cb: () => void): CanalRealtimeMin;
  subscribe(cb: (estado: string, err?: unknown) => void): unknown;
  track(carga: Record<string, unknown>): Promise<unknown>;
  untrack(): Promise<unknown>;
  presenceState(): Record<string, unknown[]>;
}
export interface ClienteRealtimeMin {
  channel(tema: string, opciones: { config: { private: boolean; presence: { key: string } } }): CanalRealtimeMin;
  removeChannel(canal: CanalRealtimeMin): unknown;
}

export interface DepsCanalPosicion {
  cliente: ClienteRealtimeMin | null;
  uid: string | null;
  /** Neurona de este aparato (clave de la presencia y campo `n`). */
  neuronaId: string;
  ahora?: () => number;
}

export interface CanalPosicion {
  estado(): EstadoCanalPosicion;
  suscribir(cb: () => void): () => void;
  /** Anuncia (o retira, con null) la posición de este aparato. No hace nada si el canal no está unido. */
  publicar(p: PosicionCruda | null): Promise<boolean>;
  cerrar(): void;
}

/** Lee el estado de presencia del canal sin fiarse de su forma: `{ n, lat, lon, precisionM?, t }` por entrada. */
export function posicionesDeEstado(estado: Record<string, unknown[]> | null | undefined): Record<string, AnuncioPosicion> {
  const out: Record<string, AnuncioPosicion> = {};
  for (const lista of Object.values(estado ?? {})) {
    if (!Array.isArray(lista)) continue;
    for (const e of lista) {
      if (!e || typeof e !== "object") continue;
      const n = (e as { n?: unknown }).n;
      const a = leerAnuncio(e);
      if (typeof n !== "string" || !n || !a) continue;
      if (!out[n] || a.t > out[n].t) out[n] = a;
    }
  }
  return out;
}

function motivoDe(estado: string, err: unknown): string {
  const detalle = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const base = estado === "TIMED_OUT" ? "el servidor no respondió a tiempo" : estado === "CLOSED" ? "el canal se cerró" : "el servidor rechazó la unión";
  return `${base}${detalle ? ` (${detalle.slice(0, 120)})` : ""}; si la migración de posición privada aún no está aplicada, es lo esperado`;
}

export function crearCanalPosicion(deps: DepsCanalPosicion): CanalPosicion {
  const ahora = deps.ahora ?? Date.now;
  let est: EstadoCanalPosicion = ESTADO_INICIAL;
  const oyentes = new Set<() => void>();
  let canal: CanalRealtimeMin | null = null;
  let cerrado = false;
  const poner = (e: Partial<EstadoCanalPosicion>) => {
    est = { ...est, ...e, desde: e.union && e.union !== est.union ? ahora() : est.desde };
    for (const f of Array.from(oyentes)) { try { f(); } catch { /* un oyente roto no tumba a los demás */ } }
  };

  const tema = temaPosicion(deps.uid);
  if (!deps.cliente) poner({ union: "rechazado", motivo: "no hay conexión con el servidor de tiempo real" });
  else if (!tema) poner({ union: "rechazado", motivo: "no hay sesión iniciada: el canal privado de posición es solo para cuentas" });
  else {
    try {
      poner({ union: "uniendo", motivo: "uniéndose al canal privado de posición de tu cuenta" });
      const c = deps.cliente.channel(tema, { config: { private: true, presence: { key: deps.neuronaId } } });
      canal = c;
      c.on("presence", { event: "sync" }, () => {
        if (canal !== c || cerrado) return;
        try { poner({ posiciones: posicionesDeEstado(c.presenceState()) }); } catch { /* */ }
      });
      c.subscribe((s: string, err?: unknown) => {
        if (canal !== c || cerrado) return;
        if (s === "SUBSCRIBED") poner({ union: "unido", motivo: null });
        else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") poner({ union: "rechazado", motivo: motivoDe(s, err), posiciones: {} });
      });
    } catch (e) {
      canal = null;
      poner({ union: "rechazado", motivo: motivoDe("CHANNEL_ERROR", e) });
    }
  }

  return {
    estado: () => est,
    suscribir: (cb) => { oyentes.add(cb); return () => { oyentes.delete(cb); }; },
    async publicar(p) {
      const c = canal;
      if (!c || cerrado || est.union !== "unido") return false;
      try {
        const a = anuncioDesdeCruda(p);
        if (!a) { await c.untrack(); return true; }
        await c.track({ n: deps.neuronaId, ...a });
        return true;
      } catch {
        return false;
      }
    },
    cerrar() {
      cerrado = true;
      const c = canal;
      canal = null;
      oyentes.clear();
      if (!c) return;
      try { void c.untrack().catch(() => undefined); } catch { /* */ }
      try { void Promise.resolve(deps.cliente?.removeChannel(c)).catch(() => undefined); } catch { /* */ }
    },
  };
}
