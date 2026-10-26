/**
 * Petición a la Protomolécula · CONTEXTO (Ola 1026P · P3).
 * Qué tiene la persona delante cuando abre la ventana: se deduce de la ruta y se afina con lo que la pantalla anuncia
 * (`EVENTO_CONTEXTO_PROTO`). Ligero a propósito (sin controlador, sin enrutador, sin React): las pantallas importan
 * solo `anunciarContexto` de aquí. Sin `node:*`. Lo anunciado SOLO vale mientras la ruta sea la misma: al navegar,
 * el anuncio viejo se ignora solo.
 */
import { AMBITOS } from "../tipos";
import type { Ambito } from "../tipos";
import { EVENTO_CONTEXTO_PROTO, type ContextoProto, type EntidadProto, type TipoEntidadProto } from "./contrato";

const TIPOS_ENTIDAD: readonly TipoEntidadProto[] = [
  "perfil", "grupo", "comunidad", "pagina", "publicacion", "mensaje", "archivo", "pizarra", "escritorio", "widget", "molecula",
];
const TIPOS_SELECCION: readonly string[] = [...TIPOS_ENTIDAD, "bloque", "texto", "imagen", "objeto3d"];
const MAX_ID = 200, MAX_NOMBRE = 120, MAX_RESUMEN = 200;

const limpiar = (v: unknown, max: number): string => {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
};
const idValido = (v: unknown): v is string => typeof v === "string" && /^[\w.:@%~+\-/]{1,200}$/.test(v) && v.length <= MAX_ID;

/** Entidad que llega de fuera (evento, prueba, otra pantalla): solo pasa lo que tiene la forma exacta. */
export function sanearEntidad(v: unknown): EntidadProto | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.tipo !== "string" || !(TIPOS_ENTIDAD as readonly string[]).includes(o.tipo) || !idValido(o.id)) return undefined;
  const nombre = limpiar(o.nombre, MAX_NOMBRE);
  return { tipo: o.tipo as TipoEntidadProto, id: o.id, ...(nombre ? { nombre } : {}) };
}

function sanearSeleccion(v: unknown): ContextoProto["seleccion"] | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.tipo !== "string" || !TIPOS_SELECCION.includes(o.tipo) || !idValido(o.id)) return undefined;
  const resumen = limpiar(o.resumen, MAX_RESUMEN);
  return { tipo: o.tipo as NonNullable<ContextoProto["seleccion"]>["tipo"], id: o.id, ...(resumen ? { resumen } : {}) };
}

/** Un anuncio parcial → solo los campos válidos (nunca lanza). */
export function sanearAnuncio(v: unknown): Partial<ContextoProto> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const r: Partial<ContextoProto> = {};
  if (typeof o.ruta === "string") { const ruta = rutaLimpia(o.ruta); if (ruta) r.ruta = ruta; }
  const entidad = sanearEntidad(o.entidad); if (entidad) r.entidad = entidad;
  const seleccion = sanearSeleccion(o.seleccion); if (seleccion) r.seleccion = seleccion;
  const gobernadaPor = sanearEntidad(o.gobernadaPor); if (gobernadaPor) r.gobernadaPor = gobernadaPor;
  if (typeof o.ambito === "string" && (AMBITOS as readonly string[]).includes(o.ambito)) r.ambito = o.ambito as Ambito;
  return Object.keys(r).length ? r : null;
}

/** `/a/b/?x=1#h` → `{ ruta: "/a/b", consulta: URLSearchParams }`. Sin barra inicial o vacía → null. */
function partirRuta(cruda: string): { ruta: string; consulta: URLSearchParams } | null {
  if (typeof cruda !== "string") return null;
  const sinHash = cruda.split("#")[0];
  const i = sinHash.indexOf("?");
  let ruta = (i >= 0 ? sinHash.slice(0, i) : sinHash).trim();
  if (!ruta.startsWith("/") || ruta.startsWith("//") || ruta.length > 300) return null;
  ruta = ruta.replace(/\/{2,}/g, "/");
  if (ruta.length > 1) ruta = ruta.replace(/\/+$/, "");
  let consulta: URLSearchParams;
  try { consulta = new URLSearchParams(i >= 0 ? sinHash.slice(i + 1) : ""); } catch { consulta = new URLSearchParams(); }
  return { ruta, consulta };
}
const rutaLimpia = (cruda: string): string | null => partirRuta(cruda)?.ruta ?? null;

const decodificar = (s: string): string => { try { return decodeURIComponent(s); } catch { return s; } };

interface Regla { re: RegExp; tipo: TipoEntidadProto; ambito: Ambito; gobierna?: boolean; propio?: boolean }
/** Orden = prioridad. `gobierna`: la entidad es también la que dicta las reglas (grupo, comunidad, página). */
const REGLAS: Regla[] = [
  { re: /^\/grupo\/([^/]+)$/, tipo: "grupo", ambito: "grupo", gobierna: true },
  { re: /^\/grupo-ai\/([^/]+)$/, tipo: "grupo", ambito: "grupo", gobierna: true },
  { re: /^\/pagina\/([^/]+)$/, tipo: "pagina", ambito: "publica", gobierna: true },
  // Un evento es una página de la red; un partido o una entidad federativa, una comunidad con sus reglas.
  { re: /^\/evento\/([^/]+)$/, tipo: "pagina", ambito: "publica", gobierna: true },
  { re: /^\/partido\/([^/]+)$/, tipo: "comunidad", ambito: "grupo", gobierna: true },
  { re: /^\/entidad\/([^/]+)$/, tipo: "comunidad", ambito: "grupo", gobierna: true },
  { re: /^\/profile\/([^/]+)$/, tipo: "perfil", ambito: "perfil" },
  { re: /^\/(?:post|article)\/([^/]+)$/, tipo: "publicacion", ambito: "publica" },
  { re: /^\/(?:documento|tabla|presentacion|programa|escena|dashboard-compartido|vivo|juego)\/([^/]+)$/, tipo: "archivo", ambito: "personal" },
];

/** Contexto que la RUTA da por sí sola. Nunca lanza; una ruta rara da un contexto sin entidad. */
export function contextoDeRuta(cruda: string): ContextoProto {
  const partida = partirRuta(cruda);
  if (!partida) return { ruta: "/", ambito: "personal" };
  const { ruta, consulta } = partida;
  for (const r of REGLAS) {
    const m = r.re.exec(ruta);
    if (!m) continue;
    const id = decodificar(m[1]);
    if (!idValido(id)) break;
    const entidad: EntidadProto = { tipo: r.tipo, id };
    return { ruta, entidad, ambito: r.ambito, ...(r.gobierna ? { gobernadaPor: entidad } : {}) };
  }
  if (ruta === "/profile") return { ruta, entidad: { tipo: "perfil", id: "propio" }, ambito: "personal" };
  if (ruta === "/pizarra") {
    const id = consulta.get("canvas") ?? "";
    return { ruta, ...(idValido(id) ? { entidad: { tipo: "pizarra" as const, id } } : {}), ambito: "personal" };
  }
  if (ruta === "/escritorios") return { ruta, entidad: { tipo: "escritorio", id: "actual" }, ambito: "personal" };
  if (ruta === "/protomolecula") {
    const id = consulta.get("molecula") ?? "";
    return { ruta, ...(idValido(id) ? { entidad: { tipo: "molecula" as const, id } } : {}), ambito: "personal" };
  }
  return { ruta, ambito: "personal" };
}

/** Mezcla lo que dice la ruta con el último anuncio de la pantalla. El anuncio solo vale en SU ruta. */
export function fusionarContexto(base: ContextoProto, anuncio: Partial<ContextoProto> | null | undefined): ContextoProto {
  if (!anuncio || (anuncio.ruta && anuncio.ruta !== base.ruta)) return base;
  const fusion: ContextoProto = { ...base };
  if (anuncio.entidad) fusion.entidad = anuncio.entidad;
  if (anuncio.seleccion) fusion.seleccion = anuncio.seleccion;
  if (anuncio.gobernadaPor) fusion.gobernadaPor = anuncio.gobernadaPor;
  if (anuncio.ambito) fusion.ambito = anuncio.ambito;
  return fusion;
}

/* ─────────────── el último anuncio (módulo, no React) ─────────────── */

let ultimo: Partial<ContextoProto> | null = null;
let version = 0;
const oyentes = new Set<() => void>();
let escuchando = false;

const rutaActual = (): string => {
  if (typeof window === "undefined") return "/";
  return rutaLimpia(window.location.pathname) ?? "/";
};
/** Clave canónica de un anuncio: no depende del orden de sus campos (el evento los devuelve reordenados). */
const canonico = (v: unknown): unknown => Array.isArray(v) ? v.map(canonico)
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonico((v as Record<string, unknown>)[k])])) : v;
const clave = (a: Partial<ContextoProto> | null): string => (a ? JSON.stringify(canonico(a)) : "");

function fijar(a: Partial<ContextoProto> | null): void {
  if (clave(a) === clave(ultimo)) return;
  ultimo = a;
  version++;
  for (const o of [...oyentes]) { try { o(); } catch { /* un oyente roto no frena a los demás */ } }
}

/** Escucha el evento de cualquier pantalla (también las que lo disparan sin pasar por `anunciarContexto`). */
function escuchar(): void {
  if (escuchando || typeof window === "undefined") return;
  escuchando = true;
  window.addEventListener(EVENTO_CONTEXTO_PROTO, (e) => {
    const a = sanearAnuncio((e as CustomEvent).detail);
    if (!a) return;
    fijar({ ...a, ruta: a.ruta ?? rutaActual() });
  });
}

/**
 * Una pantalla dice qué enseña (al montarse o al cambiar la selección). Devuelve la función que RETIRA el anuncio
 * (para el cleanup de un `useEffect`): solo lo retira si sigue siendo el último, para no pisar el de otra pantalla.
 */
export function anunciarContexto(parcial: Partial<ContextoProto>): () => void {
  escuchar();
  const a = sanearAnuncio(parcial);
  if (!a) return () => {};
  const completo: Partial<ContextoProto> = { ...a, ruta: a.ruta ?? rutaActual() };
  fijar(completo);
  if (typeof window !== "undefined") {
    try { window.dispatchEvent(new CustomEvent(EVENTO_CONTEXTO_PROTO, { detail: completo })); } catch { /* sin DOM */ }
  }
  const mio = clave(completo);
  return () => { if (clave(ultimo) === mio) fijar(null); };
}

/** El contexto de AHORA: la ruta (por defecto la del navegador) más el último anuncio válido para ella. */
export function leerContexto(ruta?: string): ContextoProto {
  escuchar();
  const cruda = ruta ?? (typeof window !== "undefined" ? window.location.pathname + window.location.search : "/");
  return fusionarContexto(contextoDeRuta(cruda), ultimo);
}

/** Para `useSyncExternalStore`: avisa cuando cambia el anuncio. */
export function suscribirContexto(f: () => void): () => void {
  escuchar();
  oyentes.add(f);
  return () => { oyentes.delete(f); };
}
export const versionContexto = (): number => version;

/** Solo para pruebas. */
export function reiniciarContexto(): void { ultimo = null; version = 0; oyentes.clear(); }
