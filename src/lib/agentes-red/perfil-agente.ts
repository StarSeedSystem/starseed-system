/**
 * Perfil de un agente de IA en la red StarSeed (Ola 1025U · U3).
 *
 * Cada agente (el de una personalidad, el bot de un grupo, página o comunidad, o un agente de grupo) puede tener
 * su propio perfil, como cualquier persona: dispositivos virtuales sin límite fijo (pantalla, móvil, tableta, VR o
 * AR) cada uno con su propia disposición del OS, y una de dos visibilidades:
 *   · `privado`   — se queda en espacios privados: no publica ni comenta en la red.
 *   · `vinculado` — se vincula con la red SOLO en los grupos, comunidades y páginas concretos que la persona
 *                   elige (ids reales; nada inventado). Fuera de esos vínculos sigue siendo privado.
 *
 * Todo lo que un agente publique o comente lleva siempre la etiqueta «Bot de IA» y se le puede bloquear: eso vive
 * en `marca-bot.ts` y `bloqueo-bots.ts`. Aquí solo se decide DÓNDE puede publicar.
 *
 * Mitad pura (tipos, normalizadores, reductores, `puedePublicarEn`) y mitad almacén (`starseed.agentes-red.perfil.
 * <id>.v1`, sincronizado con la cuenta por prefijo en `settings-sync`). Sin `node:*`: lo importa código de cliente.
 */
import type { AgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import { safeGet, safeSet } from "@/lib/safe-storage";

/* ── Entidades de la red ─────────────────────────────────────────────────── */

export const TIPOS_ENTIDAD_RED = ["grupo", "comunidad", "pagina"] as const;
export type TipoEntidadRed = (typeof TIPOS_ENTIDAD_RED)[number];

/** Un grupo, comunidad o página REAL de la red. `id` es el identificador estable con el que el OS la nombra (slug). */
export interface EntidadRed {
  tipo: TipoEntidadRed;
  id: string;
  /** Nombre legible, solo para pintar; nunca decide nada. */
  nombre?: string;
}

/** La red en general (el feed global): no es una entidad en la que un agente pueda estar vinculado. */
export const ENTIDAD_RED = { tipo: "red", id: "red" } as const;
export type EntidadContexto = EntidadRed | typeof ENTIDAD_RED;

export const esTipoEntidadRed = (x: unknown): x is TipoEntidadRed =>
  typeof x === "string" && (TIPOS_ENTIDAD_RED as readonly string[]).includes(x);

const PATRON_ID = /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,119}$/;

/** Una comunidad es una página del OS (misma tabla): para comparar, ambas son de la misma familia. */
export function familiaEntidad(tipo: string): string {
  return tipo === "comunidad" ? "pagina" : tipo;
}

/** Clave canónica de una entidad: dos formas de nombrar la misma (`comunidad:x` y `pagina:x`) dan la misma clave. */
export function claveEntidad(e: Pick<EntidadContexto, "tipo" | "id">): string {
  return `${familiaEntidad(e.tipo)}:${e.id}`;
}

/** Traduce el tipo de entidad de `os-social` (`page`/`group`) a la del perfil del agente. */
export function entidadDeOs(
  tipo: string, slug: string, kindPagina?: string, nombre?: string,
): EntidadRed | null {
  if (!slug || !PATRON_ID.test(slug)) return null;
  const base = nombre ? { nombre } : {};
  if (tipo === "group") return { tipo: "grupo", id: slug, ...base };
  if (tipo === "page") return { tipo: kindPagina === "comunidad" ? "comunidad" : "pagina", id: slug, ...base };
  return null;
}

/** Traduce una entidad del perfil al tipo que entiende `createPost` (`page`/`group`). */
export function tipoOsDeEntidad(e: Pick<EntidadRed, "tipo">): "page" | "group" {
  return e.tipo === "grupo" ? "group" : "page";
}

/* ── Dispositivos virtuales ──────────────────────────────────────────────── */

export const TIPOS_DISPOSITIVO = ["pantalla", "movil", "tableta", "vr", "ar"] as const;
export type TipoDispositivo = (typeof TIPOS_DISPOSITIVO)[number];

export const ETIQUETA_DISPOSITIVO: Record<TipoDispositivo, string> = {
  pantalla: "Pantalla", movil: "Móvil", tableta: "Tableta", vr: "Realidad virtual", ar: "Realidad aumentada",
};

/** Disposición del OS del dispositivo: una referencia a un escritorio (o plantilla) que YA existe. */
export interface DisposicionOS {
  tipo: "escritorio" | "plantilla";
  /** Id del escritorio o de la plantilla en su almacén de origen. */
  ref: string;
  nombre?: string;
}

export interface DispositivoVirtual {
  id: string;
  tipo: TipoDispositivo;
  nombre: string;
  /** Ausente = sin disposición asignada todavía (el agente usa el OS por defecto). */
  disposicion?: DisposicionOS;
}

export const esTipoDispositivo = (x: unknown): x is TipoDispositivo =>
  typeof x === "string" && (TIPOS_DISPOSITIVO as readonly string[]).includes(x);

/* ── Perfil ──────────────────────────────────────────────────────────────── */

export const VISIBILIDADES = ["privado", "vinculado"] as const;
export type VisibilidadAgente = (typeof VISIBILIDADES)[number];

export interface PerfilAgenteRedDatos {
  v: 1;
  /** Id del agente en el mundo (`AgenteMundoRef.id`). */
  agenteId: string;
  visibilidad: VisibilidadAgente;
  /** Grupos, comunidades y páginas donde el perfil está vinculado a la red. Solo cuentan con `vinculado`. */
  vinculos: EntidadRed[];
  /** Sin tope fijo: tantos como quiera la persona. */
  dispositivos: DispositivoVirtual[];
  /** Epoch ms de la última modificación. */
  actualizado: number;
}

/** Un agente recién nacido está en privado: la red se concede, no se hereda. */
export function perfilPorDefecto(agenteId: string): PerfilAgenteRedDatos {
  return { v: 1, agenteId, visibilidad: "privado", vinculos: [], dispositivos: [], actualizado: 0 };
}

const texto = (x: unknown, max: number): string => (typeof x === "string" ? x.trim().slice(0, max) : "");

function normalizarEntidad(x: unknown): EntidadRed | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (!esTipoEntidadRed(o.tipo) || typeof o.id !== "string" || !PATRON_ID.test(o.id)) return null;
  const nombre = texto(o.nombre, 120);
  return { tipo: o.tipo, id: o.id, ...(nombre ? { nombre } : {}) };
}

function normalizarDisposicion(x: unknown): DisposicionOS | undefined {
  if (!x || typeof x !== "object") return undefined;
  const o = x as Record<string, unknown>;
  if ((o.tipo !== "escritorio" && o.tipo !== "plantilla") || typeof o.ref !== "string" || !o.ref.trim()) return undefined;
  const nombre = texto(o.nombre, 120);
  return { tipo: o.tipo, ref: o.ref.trim().slice(0, 120), ...(nombre ? { nombre } : {}) };
}

function normalizarDispositivo(x: unknown): DispositivoVirtual | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id.trim() || !esTipoDispositivo(o.tipo)) return null;
  const disposicion = normalizarDisposicion(o.disposicion);
  return {
    id: o.id.trim().slice(0, 80), tipo: o.tipo,
    nombre: texto(o.nombre, 80) || ETIQUETA_DISPOSITIVO[o.tipo],
    ...(disposicion ? { disposicion } : {}),
  };
}

/** Lee un perfil guardado (o remoto) sin fiarse de su forma: lo que no es válido se descarta, nunca se inventa. */
export function normalizarPerfil(raw: unknown, agenteId: string): PerfilAgenteRedDatos {
  const base = perfilPorDefecto(agenteId);
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const vistos = new Set<string>();
  const vinculos: EntidadRed[] = [];
  for (const e of Array.isArray(o.vinculos) ? o.vinculos : []) {
    const n = normalizarEntidad(e);
    if (n && !vistos.has(claveEntidad(n))) { vistos.add(claveEntidad(n)); vinculos.push(n); }
  }
  const idsDisp = new Set<string>();
  const dispositivos: DispositivoVirtual[] = [];
  for (const d of Array.isArray(o.dispositivos) ? o.dispositivos : []) {
    const n = normalizarDispositivo(d);
    if (n && !idsDisp.has(n.id)) { idsDisp.add(n.id); dispositivos.push(n); }
  }
  return {
    v: 1, agenteId,
    visibilidad: o.visibilidad === "vinculado" ? "vinculado" : "privado",
    vinculos, dispositivos,
    actualizado: typeof o.actualizado === "number" && Number.isFinite(o.actualizado) ? o.actualizado : 0,
  };
}

/* ── Reductores puros (devuelven un perfil nuevo; el tiempo entra como argumento) ── */

const con = (p: PerfilAgenteRedDatos, cambios: Partial<PerfilAgenteRedDatos>, ahora: number): PerfilAgenteRedDatos =>
  ({ ...p, ...cambios, actualizado: ahora });

export function fijarVisibilidad(p: PerfilAgenteRedDatos, v: VisibilidadAgente, ahora: number): PerfilAgenteRedDatos {
  return p.visibilidad === v ? p : con(p, { visibilidad: v }, ahora);
}

/** Vincula el perfil con una entidad REAL. Una entidad con id inválido se rechaza (no cambia nada). */
export function vincular(p: PerfilAgenteRedDatos, entidad: EntidadRed, ahora: number): PerfilAgenteRedDatos {
  const n = normalizarEntidad(entidad);
  if (!n || p.vinculos.some((e) => claveEntidad(e) === claveEntidad(n))) return p;
  return con(p, { vinculos: [...p.vinculos, n] }, ahora);
}

export function desvincular(p: PerfilAgenteRedDatos, entidad: Pick<EntidadRed, "tipo" | "id">, ahora: number): PerfilAgenteRedDatos {
  const resto = p.vinculos.filter((e) => claveEntidad(e) !== claveEntidad(entidad));
  return resto.length === p.vinculos.length ? p : con(p, { vinculos: resto }, ahora);
}

/** Añade un dispositivo virtual. El `id` entra de fuera para que sea determinista; sin tope de cantidad. */
export function agregarDispositivo(
  p: PerfilAgenteRedDatos,
  d: { tipo: TipoDispositivo; nombre?: string; disposicion?: DisposicionOS },
  id: string,
  ahora: number,
): PerfilAgenteRedDatos {
  const n = normalizarDispositivo({ ...d, id });
  if (!n || p.dispositivos.some((x) => x.id === n.id)) return p;
  return con(p, { dispositivos: [...p.dispositivos, n] }, ahora);
}

export function quitarDispositivo(p: PerfilAgenteRedDatos, id: string, ahora: number): PerfilAgenteRedDatos {
  const resto = p.dispositivos.filter((d) => d.id !== id);
  return resto.length === p.dispositivos.length ? p : con(p, { dispositivos: resto }, ahora);
}

export function renombrarDispositivo(p: PerfilAgenteRedDatos, id: string, nombre: string, ahora: number): PerfilAgenteRedDatos {
  const limpio = texto(nombre, 80);
  if (!limpio) return p;
  return con(p, { dispositivos: p.dispositivos.map((d) => (d.id === id ? { ...d, nombre: limpio } : d)) }, ahora);
}

/** Asigna (o quita, con `null`) la disposición del OS de un dispositivo: una referencia, nunca una copia. */
export function fijarDisposicion(
  p: PerfilAgenteRedDatos, id: string, disposicion: DisposicionOS | null, ahora: number,
): PerfilAgenteRedDatos {
  const nueva = disposicion ? normalizarDisposicion(disposicion) : undefined;
  if (disposicion && !nueva) return p;
  return con(p, {
    dispositivos: p.dispositivos.map((d) => {
      if (d.id !== id) return d;
      const { disposicion: _quitada, ...resto } = d;
      return nueva ? { ...resto, disposicion: nueva } : resto;
    }),
  }, ahora);
}

/* ── ¿Dónde puede publicar? ──────────────────────────────────────────────── */

/**
 * Un agente publica o comenta SOLO en una entidad concreta a la que su perfil está vinculado. En privado no
 * publica en ninguna; en la red en general (sin entidad) tampoco: un vínculo siempre es a algo concreto.
 */
export function puedePublicarEn(perfil: PerfilAgenteRedDatos, destino: EntidadContexto | null | undefined): boolean {
  if (!destino || destino.tipo === "red") return false;
  if (perfil.visibilidad !== "vinculado") return false;
  return perfil.vinculos.some((e) => claveEntidad(e) === claveEntidad(destino));
}

/** Por qué NO puede publicar (para decírselo a la persona); `null` si puede. */
export function motivoSinPublicar(perfil: PerfilAgenteRedDatos, destino: EntidadContexto | null | undefined): string | null {
  if (puedePublicarEn(perfil, destino)) return null;
  if (perfil.visibilidad !== "vinculado") {
    return "El perfil de este agente es solo privado: no publica ni comenta en la red hasta que lo vincules.";
  }
  if (!destino || destino.tipo === "red") {
    return "Un agente publica en un grupo, comunidad o página concretos, no en la red en general.";
  }
  return `El perfil de este agente no está vinculado a ${destino.nombre ? `«${destino.nombre}»` : "ese destino"}.`;
}

/* ── Almacén ─────────────────────────────────────────────────────────────── */

export const PREFIJO_CLAVE_PERFIL = "starseed.agentes-red.perfil.";
export const EVENTO_PERFIL_AGENTE = "starseed:agentes-red-perfil";

export const clavePerfilAgente = (agenteId: string): string => `${PREFIJO_CLAVE_PERFIL}${agenteId}.v1`;

const enCliente = (): boolean => typeof window !== "undefined" && typeof localStorage !== "undefined";

export function leerPerfilAgente(agenteId: string): PerfilAgenteRedDatos {
  if (!enCliente()) return perfilPorDefecto(agenteId);
  const crudo = safeGet(clavePerfilAgente(agenteId));
  if (!crudo) return perfilPorDefecto(agenteId);
  try {
    return normalizarPerfil(JSON.parse(crudo), agenteId);
  } catch {
    return perfilPorDefecto(agenteId);
  }
}

export function guardarPerfilAgente(perfil: PerfilAgenteRedDatos): void {
  if (!enCliente()) return;
  safeSet(clavePerfilAgente(perfil.agenteId), JSON.stringify(normalizarPerfil(perfil, perfil.agenteId)));
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_PERFIL_AGENTE, { detail: { agenteId: perfil.agenteId } }));
  } catch {
    /* sin observadores no pasa nada */
  }
}

/** Aplica un reductor al perfil guardado y lo guarda. Devuelve el perfil resultante. */
export function actualizarPerfilAgente(
  agente: Pick<AgenteMundoRef, "id">,
  cambiar: (p: PerfilAgenteRedDatos, ahora: number) => PerfilAgenteRedDatos,
  ahora: number = Date.now(),
): PerfilAgenteRedDatos {
  const antes = leerPerfilAgente(agente.id);
  const despues = cambiar(antes, ahora);
  if (despues !== antes) guardarPerfilAgente(despues);
  return despues;
}

/** Id nuevo para un dispositivo virtual. */
export function idDispositivoNuevo(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `disp-${crypto.randomUUID().slice(0, 8)}`;
  } catch {
    /* sin crypto */
  }
  return `disp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
