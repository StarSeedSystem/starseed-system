/**
 * inicio-sin-servidor — empezar una llamada desde una neurona SIN internet (LLA1110D). Lógica pura + almacenamiento inyectable.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Prueba 33: la tableta, con el Wi-Fi apagado, nunca llegaba a llamar a la Mac. Pasos que pedían internet:
 *  1. `planLlamada` (mensajeria/neuronas) solo conocía dos vías: el enlace WebRTC local o el sistema de llamadas con
 *     internet. Sin las dos devolvía «no hay cómo llamar» aunque hubiera Bluetooth directo con la neurona.
 *  2. `empezarLlamadaSinChat` creaba la sesión en el servidor (`crearSesion`, Supabase) antes de nada: sin red, fallaba.
 *  3. `miIdentidad` lee la sesión de Supabase; si el token caducó, sin red puede no devolver nada.
 * Ahora: si hay un enlace directo con la neurona, la llamada se ofrece por él con un id de sesión LOCAL (uuid), la
 * identidad sale de la última conocida en este aparato, y lo que es del servidor (el registro de la sesión) queda en
 * una cola que se escribe cuando vuelve la conexión. El timbre del otro lado es el mismo mensaje urgente de siempre.
 */
import type { Identidad } from "@/lib/llamadas/identidad";

export type ViaInicio = "servidor" | "local" | "imposible";

export interface EntradaInicio {
  /** ¿Hay red ahora (navigator.onLine)? */
  internet: boolean;
  /** Qué pasó al crear la sesión en el servidor. */
  sesionServidor: "ok" | "fallo" | "no-intentado";
  /** ¿Hay enlace directo con la neurona (Bluetooth, enlace local, ruta IP sin servidor)? */
  enlaceDirecto: boolean;
  /** ¿Se llama a una neurona concreta? (sin ella no hay enlace directo posible) */
  neurona: boolean;
}

/** ¿Hay que intentar el servidor? Solo con internet y sin que se haya pedido ir sin él. */
export function intentarServidor(e: { internet: boolean; sinServidor?: boolean }): boolean {
  return e.internet && !e.sinServidor;
}

export function decidirInicio(e: EntradaInicio): { via: ViaInicio; motivo: string } {
  if (e.sesionServidor === "ok") return { via: "servidor", motivo: "sesión creada en el servidor" };
  if (e.neurona && e.enlaceDirecto) {
    return { via: "local", motivo: e.sesionServidor === "fallo" ? "el servidor no responde: va por el enlace directo" : "sin internet: va por el enlace directo" };
  }
  if (!e.neurona) return { via: "imposible", motivo: "sin servidor solo se puede llamar a una neurona con enlace directo" };
  return { via: "imposible", motivo: "sin servidor y sin enlace directo con esa neurona (vincúlala o acércala)" };
}

/** Id de sesión para una llamada sin servidor: un uuid como los del servidor (los temas y canales lo aceptan igual). */
export function idSesionLocal(aleatorio: () => string = () => crypto.randomUUID()): string {
  try {
    return aleatorio();
  } catch {
    const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
    return `${h()}${h()}-${h()}-4${h().slice(1)}-a${h().slice(1)}-${h()}${h()}${h()}`;
  }
}

const CLAVE_IDENTIDAD = "starseed.llamadas.identidad.v1";
const CLAVE_PENDIENTES = "starseed.llamadas.pendientes-servidor.v1";
const MAX_PENDIENTES = 20;

function almacen(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Guarda la identidad conocida (con sesión) para poder llamar sin red más tarde. Nunca lanza. */
export function guardarIdentidadLocal(yo: Identidad, s: Storage | null = almacen()): void {
  if (!s || yo.invitado || !yo.uid) return;
  try {
    s.setItem(CLAVE_IDENTIDAD, JSON.stringify({ base: yo.base, uid: yo.uid, nombre: yo.nombre, avatar: yo.avatar }));
  } catch {
    /* sin almacenamiento */
  }
}

export function leerIdentidadLocal(s: Storage | null = almacen()): Identidad | null {
  if (!s) return null;
  try {
    const o = JSON.parse(s.getItem(CLAVE_IDENTIDAD) ?? "null") as Partial<Identidad> | null;
    if (!o || typeof o.base !== "string" || !o.base || typeof o.uid !== "string") return null;
    return { base: o.base, uid: o.uid, nombre: typeof o.nombre === "string" ? o.nombre : "Yo", avatar: typeof o.avatar === "string" ? o.avatar : null, invitado: false };
  } catch {
    return null;
  }
}

/** Lo que el servidor no supo de una llamada hecha sin él (se escribe al volver la conexión). */
export interface PendienteServidor {
  sesionId: string;
  tipo: string;
  titulo: string;
  neurona: string | null;
  invitados: string[];
  en: number;
}

export function leerPendientes(s: Storage | null = almacen()): PendienteServidor[] {
  if (!s) return [];
  try {
    const l = JSON.parse(s.getItem(CLAVE_PENDIENTES) ?? "[]") as unknown;
    return Array.isArray(l) ? (l.filter((x) => x && typeof x === "object" && typeof (x as PendienteServidor).sesionId === "string") as PendienteServidor[]) : [];
  } catch {
    return [];
  }
}

export function anadirPendiente(p: PendienteServidor, s: Storage | null = almacen()): void {
  if (!s) return;
  try {
    const l = leerPendientes(s).filter((x) => x.sesionId !== p.sesionId);
    l.push(p);
    s.setItem(CLAVE_PENDIENTES, JSON.stringify(l.slice(-MAX_PENDIENTES)));
  } catch {
    /* sin almacenamiento */
  }
}

export function quitarPendiente(sesionId: string, s: Storage | null = almacen()): void {
  if (!s) return;
  try {
    s.setItem(CLAVE_PENDIENTES, JSON.stringify(leerPendientes(s).filter((x) => x.sesionId !== sesionId)));
  } catch {
    /* sin almacenamiento */
  }
}
