/**
 * Bloqueo y filtros de los bots de IA en la red (Ola 1025U · U3).
 *
 * Regla de Alex: a un agente que publica o comenta en la red SIEMPRE se le puede bloquear — uno a uno, en general
 * en una página, grupo o comunidad, o con filtros para todo o para cada publicación. Aquí viven las reglas y la
 * decisión; la etiqueta que identifica al bot está en `marca-bot.ts`.
 *
 * Las reglas son de CADA PERSONA (qué quiere ver ella), no de la entidad: bloquear a un bot no lo expulsa de la
 * página ni afecta a nadie más. Precedencia, de lo más específico a lo más general:
 *   1. bot bloqueado a mano            → oculto siempre;
 *   2. modo de la PUBLICACIÓN          → manda sobre los bots que comentan en ella;
 *   3. modo de la ENTIDAD (página, grupo, comunidad o la red) → «Bloquear los bots de aquí»;
 *   4. modo GENERAL                    → por defecto, permitir todo.
 * Modos: `todo` (permitir todos los bots) · `solo-entidad` (solo los bots que son de esa entidad) · `ninguno`.
 *
 * Mitad pura (reglas, reductores, `decidirBot`, `filtrarPorBloqueo`) y mitad almacén (`starseed.agentes-red.
 * bloqueo.v1`, que viaja con la cuenta en `user_settings.prefs`: está en `SYNCED_KEYS`). Sin `node:*`.
 */
import { safeGet, safeSet } from "@/lib/safe-storage";
import { ENTIDAD_RED, claveEntidad, familiaEntidad, type EntidadContexto } from "./perfil-agente";
import { marcaBotDe, esMarcaBot, type MarcaBot } from "./marca-bot";

export const MODOS_BOTS = ["todo", "solo-entidad", "ninguno"] as const;
export type ModoBots = (typeof MODOS_BOTS)[number];

export const ETIQUETA_MODO_BOTS: Record<ModoBots, string> = {
  todo: "Permitir todos los bots",
  "solo-entidad": "Solo los bots de esta entidad",
  ninguno: "Ningún bot",
};

export const esModoBots = (x: unknown): x is ModoBots =>
  typeof x === "string" && (MODOS_BOTS as readonly string[]).includes(x);

export interface BotBloqueado {
  nombre?: string;
  /** Epoch ms en que se bloqueó. */
  desde: number;
}

export interface ReglasBloqueoBots {
  v: 1;
  /** Bots bloqueados uno a uno: `agenteId` → ficha. */
  bots: Record<string, BotBloqueado>;
  /** Modo para todo lo que no tenga regla más específica. */
  general: ModoBots;
  /** Modo por entidad: `<tipo>:<id>` (grupo, comunidad, página o `red:red`). */
  entidades: Record<string, ModoBots>;
  /** Modo por publicación: `postId` → modo, para los bots que comentan en ella. */
  publicaciones: Record<string, ModoBots>;
  actualizado: number;
}

/** Topes para que la clave, que viaja con la cuenta, no crezca sin límite (se descarta lo más antiguo). */
export const MAX_BOTS_BLOQUEADOS = 2000;
export const MAX_REGLAS_ENTIDAD = 500;
export const MAX_REGLAS_PUBLICACION = 1000;

export const REGLAS_VACIAS: ReglasBloqueoBots = Object.freeze({
  v: 1 as const,
  bots: Object.freeze({}) as Record<string, BotBloqueado>,
  general: "todo" as ModoBots,
  entidades: Object.freeze({}) as Record<string, ModoBots>,
  publicaciones: Object.freeze({}) as Record<string, ModoBots>,
  actualizado: 0,
});

const PATRON_CLAVE = /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,159}$/;
const obj = (x: unknown): Record<string, unknown> | null =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null;

function acotarPorAntiguedad<V>(m: Record<string, V>, max: number): Record<string, V> {
  const claves = Object.keys(m);
  if (claves.length <= max) return m;
  return Object.fromEntries(claves.slice(claves.length - max).map((k) => [k, m[k]]));
}

function modos(raw: unknown, max: number): Record<string, ModoBots> {
  const o = obj(raw) ?? {};
  const out: Record<string, ModoBots> = {};
  for (const [k, v] of Object.entries(o)) if (PATRON_CLAVE.test(k) && esModoBots(v)) out[k] = v;
  return acotarPorAntiguedad(out, max);
}

/** Lee reglas guardadas (o llegadas de la cuenta) sin fiarse de su forma. */
export function normalizarReglas(raw: unknown): ReglasBloqueoBots {
  const o = obj(raw);
  if (!o) return REGLAS_VACIAS;
  const bots: Record<string, BotBloqueado> = {};
  for (const [id, ficha] of Object.entries(obj(o.bots) ?? {})) {
    if (!PATRON_CLAVE.test(id)) continue;
    const f = obj(ficha);
    const nombre = typeof f?.nombre === "string" ? f.nombre.trim().slice(0, 80) : "";
    bots[id] = { ...(nombre ? { nombre } : {}), desde: typeof f?.desde === "number" && Number.isFinite(f.desde) ? f.desde : 0 };
  }
  return {
    v: 1,
    bots: acotarPorAntiguedad(bots, MAX_BOTS_BLOQUEADOS),
    general: esModoBots(o.general) ? o.general : "todo",
    entidades: modos(o.entidades, MAX_REGLAS_ENTIDAD),
    publicaciones: modos(o.publicaciones, MAX_REGLAS_PUBLICACION),
    actualizado: typeof o.actualizado === "number" && Number.isFinite(o.actualizado) ? o.actualizado : 0,
  };
}

/* ── Reductores puros ────────────────────────────────────────────────────── */

/** Bloquea un bot a mano. Idempotente: bloquear a quien ya lo está no cambia nada. */
export function conBotBloqueado(
  r: ReglasBloqueoBots, agenteId: string, nombre: string | undefined, ahora: number,
): ReglasBloqueoBots {
  if (!PATRON_CLAVE.test(agenteId) || r.bots[agenteId]) return r;
  const limpio = nombre?.trim().slice(0, 80);
  return {
    ...r, actualizado: ahora,
    bots: acotarPorAntiguedad({ ...r.bots, [agenteId]: { ...(limpio ? { nombre: limpio } : {}), desde: ahora } }, MAX_BOTS_BLOQUEADOS),
  };
}

export function conBotDesbloqueado(r: ReglasBloqueoBots, agenteId: string, ahora: number): ReglasBloqueoBots {
  if (!r.bots[agenteId]) return r;
  const { [agenteId]: _fuera, ...resto } = r.bots;
  return { ...r, bots: resto, actualizado: ahora };
}

export function conModoGeneral(r: ReglasBloqueoBots, modo: ModoBots, ahora: number): ReglasBloqueoBots {
  return r.general === modo ? r : { ...r, general: modo, actualizado: ahora };
}

/** Modo de una entidad; `null` quita su regla (vuelve a lo general). «Bloquear los bots de aquí» = `ninguno`. */
export function conModoEntidad(
  r: ReglasBloqueoBots, entidad: Pick<EntidadContexto, "tipo" | "id">, modo: ModoBots | null, ahora: number,
): ReglasBloqueoBots {
  const clave = claveEntidad(entidad);
  if (!PATRON_CLAVE.test(clave)) return r;
  if (modo === null) {
    if (!(clave in r.entidades)) return r;
    const { [clave]: _fuera, ...resto } = r.entidades;
    return { ...r, entidades: resto, actualizado: ahora };
  }
  if (r.entidades[clave] === modo) return r;
  const { [clave]: _previo, ...sin } = r.entidades; // reinsertar al final: lo último que se tocó es lo último que se descarta
  return { ...r, entidades: acotarPorAntiguedad({ ...sin, [clave]: modo }, MAX_REGLAS_ENTIDAD), actualizado: ahora };
}

/** Modo de una publicación para los bots que comentan en ella; `null` quita su regla. */
export function conModoPublicacion(
  r: ReglasBloqueoBots, postId: string, modo: ModoBots | null, ahora: number,
): ReglasBloqueoBots {
  if (!PATRON_CLAVE.test(postId)) return r;
  if (modo === null) {
    if (!(postId in r.publicaciones)) return r;
    const { [postId]: _fuera, ...resto } = r.publicaciones;
    return { ...r, publicaciones: resto, actualizado: ahora };
  }
  if (r.publicaciones[postId] === modo) return r;
  const { [postId]: _previo, ...sin } = r.publicaciones;
  return { ...r, publicaciones: acotarPorAntiguedad({ ...sin, [postId]: modo }, MAX_REGLAS_PUBLICACION), actualizado: ahora };
}

/* ── Decisión ────────────────────────────────────────────────────────────── */

/** La entidad en la que se mira algo. `alias`: otros ids con los que un bot puede nombrarla (uuid, slug…). */
export type EntidadFiltro = EntidadContexto & { alias?: readonly string[] };

export interface ContextoBot {
  /** Dónde se está viendo. Sin dato se asume la red en general. */
  entidad?: EntidadFiltro;
  /** La publicación cuyos comentarios se miran (activa la regla por publicación). */
  postId?: string;
}

export type OrigenModo = "publicacion" | "entidad" | "general";
export type MotivoOculto = "bot-bloqueado" | OrigenModo;

export interface DecisionBot {
  visible: boolean;
  /** Por qué se oculta (`undefined` si se ve). */
  motivo?: MotivoOculto;
  /** El modo que se aplicó y de dónde sale. */
  modo: ModoBots;
  origen: OrigenModo;
}

/** El modo que gobierna en este contexto: publicación › entidad › general. */
export function modoAplicable(r: ReglasBloqueoBots, ctx: ContextoBot = {}): { modo: ModoBots; origen: OrigenModo } {
  if (ctx.postId && r.publicaciones[ctx.postId]) return { modo: r.publicaciones[ctx.postId], origen: "publicacion" };
  const e = ctx.entidad ?? ENTIDAD_RED;
  const deEntidad = r.entidades[claveEntidad(e)];
  if (deEntidad) return { modo: deEntidad, origen: "entidad" };
  return { modo: r.general, origen: "general" };
}

/** ¿El bot es de esa entidad? Solo con el dato real de su dueño; sin dueño no se presume. */
export function botEsDeEntidad(marca: MarcaBot, entidad: EntidadFiltro): boolean {
  const d = marca.dueno;
  if (!d || entidad.tipo === "red") return false;
  return familiaEntidad(d.tipo) === familiaEntidad(entidad.tipo) && (d.id === entidad.id || (entidad.alias ?? []).includes(d.id));
}

export function decidirBot(marca: MarcaBot, r: ReglasBloqueoBots, ctx: ContextoBot = {}): DecisionBot {
  const aplicable = modoAplicable(r, ctx);
  if (r.bots[marca.agenteId]) return { visible: false, motivo: "bot-bloqueado", ...aplicable };
  if (aplicable.modo === "todo") return { visible: true, ...aplicable };
  if (aplicable.modo === "ninguno") return { visible: false, motivo: aplicable.origen, ...aplicable };
  return botEsDeEntidad(marca, ctx.entidad ?? ENTIDAD_RED)
    ? { visible: true, ...aplicable }
    : { visible: false, motivo: aplicable.origen, ...aplicable };
}

export interface OpcionesFiltro<T> {
  entidad?: EntidadFiltro | ((item: T) => EntidadFiltro | undefined);
  postId?: string | ((item: T) => string | undefined);
}

function contextoDe<T>(item: T, o: OpcionesFiltro<T>): ContextoBot {
  const entidad = typeof o.entidad === "function" ? o.entidad(item) : o.entidad;
  const postId = typeof o.postId === "function" ? o.postId(item) : o.postId;
  return { ...(entidad ? { entidad } : {}), ...(postId ? { postId } : {}) };
}

/**
 * Quita de la lista lo que publicó un bot que las reglas ocultan. Las personas pasan siempre. Si no hay nada que
 * quitar devuelve LA MISMA lista (identidad estable para `useMemo` y `useState`).
 */
export function filtrarPorBloqueo<T>(items: readonly T[], reglas: ReglasBloqueoBots, opciones: OpcionesFiltro<T> = {}): T[] {
  const lista = items as T[];
  if (lista.length === 0) return lista;
  const sinReglas = reglas.general === "todo"
    && Object.keys(reglas.bots).length === 0
    && Object.keys(reglas.entidades).length === 0
    && Object.keys(reglas.publicaciones).length === 0;
  if (sinReglas) return lista;
  const visibles = lista.filter((item) => {
    const marca = marcaBotDe(item);
    return !marca || decidirBot(marca, reglas, contextoDe(item, opciones)).visible;
  });
  return visibles.length === lista.length ? lista : visibles;
}

/** Como `filtrarPorBloqueo`, para árboles de comentarios (`children`). Las respuestas de una persona a un bot ocultado se conservan. */
export function filtrarArbolPorBloqueo<N extends { children: N[] }>(
  nodos: readonly N[], reglas: ReglasBloqueoBots, opciones: OpcionesFiltro<N> = {},
): N[] {
  const lista = nodos as N[];
  let cambio = false;
  const salida: N[] = [];
  for (const nodo of lista) {
    const marca = marcaBotDe(nodo);
    const visible = !marca || decidirBot(marca, reglas, contextoDe(nodo, opciones)).visible;
    const hijos = filtrarArbolPorBloqueo(nodo.children, reglas, opciones);
    if (!visible) {
      cambio = true;
      salida.push(...hijos); // las respuestas humanas no desaparecen con el bot
      continue;
    }
    if (hijos !== nodo.children) {
      cambio = true;
      salida.push({ ...nodo, children: hijos });
    } else salida.push(nodo);
  }
  return cambio ? salida : lista;
}

/** Cuántos de la lista están ocultos por las reglas (para decir «n ocultos» sin inventar). */
export function contarOcultosPorBloqueo<T>(items: readonly T[], reglas: ReglasBloqueoBots, opciones: OpcionesFiltro<T> = {}): number {
  return items.length - filtrarPorBloqueo(items, reglas, opciones).length;
}

/* ── Almacén ─────────────────────────────────────────────────────────────── */

export const CLAVE_BLOQUEO_BOTS = "starseed.agentes-red.bloqueo.v1";
export const EVENTO_BLOQUEO_BOTS = "starseed:agentes-red-bloqueo";

const enCliente = (): boolean => typeof window !== "undefined" && typeof localStorage !== "undefined";

let cache: { crudo: string | null; valor: ReglasBloqueoBots } = { crudo: null, valor: REGLAS_VACIAS };

/** Las reglas guardadas. Mientras no cambie el dato, devuelve SIEMPRE el mismo objeto (snapshot estable). */
export function leerReglas(): ReglasBloqueoBots {
  if (!enCliente()) return REGLAS_VACIAS;
  const crudo = safeGet(CLAVE_BLOQUEO_BOTS);
  if (crudo === cache.crudo) return cache.valor;
  let valor = REGLAS_VACIAS;
  if (crudo) {
    try {
      valor = normalizarReglas(JSON.parse(crudo));
    } catch {
      valor = REGLAS_VACIAS;
    }
  }
  cache = { crudo, valor };
  return valor;
}

export function guardarReglas(reglas: ReglasBloqueoBots): void {
  if (!enCliente()) return;
  safeSet(CLAVE_BLOQUEO_BOTS, JSON.stringify(normalizarReglas(reglas)));
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_BLOQUEO_BOTS));
  } catch {
    /* sin observadores no pasa nada */
  }
}

function actualizar(cambiar: (r: ReglasBloqueoBots, ahora: number) => ReglasBloqueoBots, ahora = Date.now()): ReglasBloqueoBots {
  const antes = leerReglas();
  const despues = cambiar(antes, ahora);
  if (despues !== antes) guardarReglas(despues);
  return despues;
}

/** Bloquea a un bot (por su marca o por su `agenteId`). */
export function bloquearBot(bot: MarcaBot | string, nombre?: string): ReglasBloqueoBots {
  const id = esMarcaBot(bot) ? bot.agenteId : bot;
  const nom = nombre ?? (esMarcaBot(bot) ? bot.nombre : undefined);
  return actualizar((r, ahora) => conBotBloqueado(r, id, nom, ahora));
}

export function desbloquearBot(agenteId: string): ReglasBloqueoBots {
  return actualizar((r, ahora) => conBotDesbloqueado(r, agenteId, ahora));
}

/** «Bloquear todos los bots de esta página, grupo o comunidad» (o de la red en general). */
export function bloquearBotsEn(entidad: Pick<EntidadContexto, "tipo" | "id">): ReglasBloqueoBots {
  return actualizar((r, ahora) => conModoEntidad(r, entidad, "ninguno", ahora));
}

export function fijarModoEntidad(entidad: Pick<EntidadContexto, "tipo" | "id">, modo: ModoBots | null): ReglasBloqueoBots {
  return actualizar((r, ahora) => conModoEntidad(r, entidad, modo, ahora));
}

export function fijarModoGeneral(modo: ModoBots): ReglasBloqueoBots {
  return actualizar((r, ahora) => conModoGeneral(r, modo, ahora));
}

/** Filtro por publicación: qué bots se ven en sus comentarios (`null` = seguir la regla de la entidad). */
export function permitirBotsEn(postId: string, modo: ModoBots | null): ReglasBloqueoBots {
  return actualizar((r, ahora) => conModoPublicacion(r, postId, modo, ahora));
}

/** Para pruebas: borra el estado en memoria de la caché. */
export function _reiniciarCacheBloqueoParaPruebas(): void {
  cache = { crudo: null, valor: REGLAS_VACIAS };
}
