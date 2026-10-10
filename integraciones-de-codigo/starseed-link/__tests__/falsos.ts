/**
 * Dobles de prueba: un Supabase en memoria (Realtime con difusión y presencia por tema, y consultas
 * que se anotan) y canales de estación en memoria. Nada de red.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { CanalEstacion } from "../src/sesion";

type Manejador = { tipo: string; evento: string; cb: (m: any) => void };

export class BusRealtime {
  temas = new Map<string, Set<CanalFalso>>();
  enviados: { tema: string; evento: string; payload: unknown }[] = [];
}

export class CanalFalso {
  manejadores: Manejador[] = [];
  suscrito = false;
  presencia: Record<string, unknown> | null = null;
  constructor(
    readonly bus: BusRealtime,
    readonly tema: string,
    readonly clave: string,
  ) {}
  on(tipo: string, filtro: { event: string }, cb: (m: any) => void) {
    this.manejadores.push({ tipo, evento: filtro.event, cb });
    return this;
  }
  subscribe(cb?: (estado: string) => void) {
    let set = this.bus.temas.get(this.tema);
    if (!set) this.bus.temas.set(this.tema, (set = new Set()));
    set.add(this);
    this.suscrito = true;
    queueMicrotask(() => cb?.("SUBSCRIBED"));
    return this;
  }
  async send(m: { type: string; event: string; payload: unknown }) {
    this.bus.enviados.push({ tema: this.tema, evento: m.event, payload: m.payload });
    for (const otro of this.bus.temas.get(this.tema) ?? []) {
      if (otro === this) continue;
      for (const h of otro.manejadores) if (h.tipo === "broadcast" && h.evento === m.event) queueMicrotask(() => h.cb({ payload: m.payload }));
    }
    return "ok";
  }
  async track(datos: Record<string, unknown>) {
    this.presencia = datos;
    this.sincronizarPresencia();
    return "ok";
  }
  async untrack() {
    this.presencia = null;
    this.sincronizarPresencia();
    return "ok";
  }
  presenceState(): Record<string, unknown[]> {
    const out: Record<string, unknown[]> = {};
    for (const c of this.bus.temas.get(this.tema) ?? []) if (c.presencia) out[c.clave] = [c.presencia];
    return out;
  }
  private sincronizarPresencia() {
    for (const c of this.bus.temas.get(this.tema) ?? []) for (const h of c.manejadores) if (h.tipo === "presence" && h.evento === "sync") queueMicrotask(() => h.cb({}));
  }
  cerrar() {
    this.bus.temas.get(this.tema)?.delete(this);
    this.suscrito = false;
  }
}

export interface Operacion {
  tabla: string;
  tipo: "select" | "insert" | "update";
  datos?: unknown;
  sel?: string;
  filtros: [string, ...unknown[]][];
}

/** Respuestas por tabla para las lecturas. */
export type Respuestas = Record<string, unknown>;

export function clienteFalso(op: { bus?: BusRealtime; usuario?: { id: string; email?: string } | null; respuestas?: Respuestas; filaInsertada?: string } = {}) {
  const bus = op.bus ?? new BusRealtime();
  const operaciones: Operacion[] = [];
  let n = 0;
  const consulta = (tabla: string) => {
    const o: Operacion = { tabla, tipo: "select", filtros: [] };
    const resultado = () => {
      if (o.tipo === "insert") return { data: { id: op.filaInsertada ?? "fila-1" }, error: null };
      if (o.tipo === "update") return { data: null, error: null };
      return { data: op.respuestas?.[tabla] ?? null, error: null };
    };
    const b: any = {
      select(sel: string) {
        if (o.tipo === "select") o.sel = sel;
        return b;
      },
      insert(d: unknown) {
        o.tipo = "insert";
        o.datos = d;
        operaciones.push(o);
        return b;
      },
      update(d: unknown) {
        o.tipo = "update";
        o.datos = d;
        operaciones.push(o);
        return b;
      },
      eq: (...a: unknown[]) => (o.filtros.push(["eq", ...a]), b),
      like: (...a: unknown[]) => (o.filtros.push(["like", ...a]), b),
      contains: (...a: unknown[]) => (o.filtros.push(["contains", ...a]), b),
      is: (...a: unknown[]) => (o.filtros.push(["is", ...a]), b),
      order: () => b,
      limit: () => b,
      single: async () => (o.tipo === "select" && operaciones.push(o), resultado()),
      maybeSingle: async () => (o.tipo === "select" && operaciones.push(o), resultado()),
      then: (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => {
        if (o.tipo === "select") operaciones.push(o);
        return Promise.resolve(resultado()).then(ok, ko);
      },
    };
    return b;
  };
  const cliente = {
    auth: {
      async signInWithPassword(c: { email: string; password: string }) {
        if (c.password === "buena") return { data: { user: { id: op.usuario?.id ?? "u1", email: c.email } }, error: null };
        return { data: null, error: { message: "Invalid login credentials" } };
      },
      async getSession() {
        return { data: { session: op.usuario ? { user: op.usuario } : null } };
      },
      async signOut() {
        return {};
      },
    },
    from: (t: string) => consulta(t),
    channel: (tema: string, o?: any) => new CanalFalso(bus, tema, o?.config?.presence?.key ?? `c${++n}`),
    removeChannel: (c: CanalFalso) => c.cerrar(),
  };
  return { cliente, bus, operaciones };
}

/** Un «hub» en memoria: lo que envía un extremo llega a todos los demás (difusión). */
export function hubEnMemoria() {
  const extremos = new Set<{ cb: Set<(t: string) => void> }>();
  const enviados: string[] = [];
  const nuevo = (): CanalEstacion => {
    const yo = { cb: new Set<(t: string) => void>() };
    extremos.add(yo);
    return {
      tipo: "internet",
      etiqueta: "hub",
      enviar(t) {
        enviados.push(t);
        for (const e of extremos) if (e !== yo) for (const f of e.cb) queueMicrotask(() => f(t));
      },
      alRecibir(cb) {
        yo.cb.add(cb);
        return () => yo.cb.delete(cb);
      },
      abierto: () => true,
      oyentes: () => extremos.size - 1,
      cerrar() {
        extremos.delete(yo);
      },
    };
  };
  return { nuevo, enviados };
}

export async function esperarA(cond: () => boolean, ms = 4000, paso = 10): Promise<void> {
  const fin = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fin) throw new Error("tiempo agotado esperando la condición");
    await new Promise((r) => setTimeout(r, paso));
  }
}

/** Almacén en memoria. */
export function almacenEnMemoria() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), mapa: m };
}
