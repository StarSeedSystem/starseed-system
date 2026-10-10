/**
 * manifiesto — lo que una app vinculada declara de sí misma (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Cada app (de una persona o de una entidad, pública o privada) declara QUÉ capas del vínculo usa,
 * sus tablas, sus formatos y su canal de actualizaciones. Con eso PoliGenesis/Genesis la registra
 * y la Biblioteca del OS la lista con su ficha. Es un DATO: nunca lleva código ni claves.
 * `validarManifiesto` devuelve TODOS los problemas con cómo arreglarlos.
 */

export const CAPAS_VINCULO = ["cuenta", "neurona", "sincronizacion", "directo", "transporte", "actualizaciones", "dentro-del-os"] as const;
export type CapaVinculo = (typeof CAPAS_VINCULO)[number];

export const FORMATOS_APP = ["web", "pwa", "android", "ios", "macos", "windows", "linux", "xr"] as const;
export type FormatoApp = (typeof FORMATOS_APP)[number];

export const CANALES_ACTUALIZACION = ["web", "github-releases", "tienda", "propio"] as const;

export interface ManifiestoApp {
  v: 1;
  /** Id corto y estable («omnifrecuencias»): minúsculas, números y guiones, 3–40. */
  id: string;
  nombre: string;
  descripcion?: string;
  /** Quién la publica: una persona o una entidad (pública o privada) del OS. */
  entidad: { tipo: "persona" | "entidad"; ref: string | null; publica: boolean };
  /** owner/repo del código (abierto) o null. */
  repo: string | null;
  /** Web oficial (https): la versión en línea y el origen que el OS acepta en su puente. */
  web: string;
  licencia: string;
  formatos: FormatoApp[];
  capas: CapaVinculo[];
  /** Tablas propias con RLS por cuenta (p. ej. `omni_presets`). */
  tablas: string[];
  /** Si usa estaciones en vivo: con qué fuente y tipo de parámetros. */
  estaciones?: { fuente: string; params: "omnifrecuencias" | "audiomorphic" | "visual" };
  actualizaciones: { canal: (typeof CANALES_ACTUALIZACION)[number]; repo?: string; url?: string; auto: "segun-ajustes" | "manual" };
  /** Atributo `allow` del marco del OS (micrófono, cámara…). */
  permisos?: string;
}

export type ResultadoManifiesto = { ok: true; manifiesto: ManifiestoApp } | { ok: false; errores: string[] };

const RE_ID = /^[a-z0-9][a-z0-9-]{2,39}$/;
const RE_REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const RE_TABLA = /^[a-z][a-z0-9_]{1,62}$/;
const CLAVES_PROHIBIDAS = /(sk-[A-Za-z0-9]{10,}|gsk_[A-Za-z0-9]{10,}|service_role|Bearer\s+[A-Za-z0-9._-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/;

function https(v: unknown): v is string {
  try {
    return typeof v === "string" && new URL(v).protocol === "https:";
  } catch {
    return false;
  }
}

export function validarManifiesto(x: unknown): ResultadoManifiesto {
  const e: string[] = [];
  if (!x || typeof x !== "object") return { ok: false, errores: ["El manifiesto debe ser un objeto JSON."] };
  const o = x as Record<string, unknown>;
  try {
    if (CLAVES_PROHIBIDAS.test(JSON.stringify(o))) e.push("El manifiesto contiene algo con forma de clave o token: quítalo (las claves van en el entorno, nunca aquí).");
  } catch {
    e.push("El manifiesto no se puede leer como JSON.");
  }
  if (o.v !== 1) e.push("Falta «v»: 1.");
  if (typeof o.id !== "string" || !RE_ID.test(o.id)) e.push("«id»: 3–40 caracteres en minúsculas, números o guiones (p. ej. «mi-app»).");
  if (typeof o.nombre !== "string" || o.nombre.trim().length < 2 || o.nombre.length > 60) e.push("«nombre»: entre 2 y 60 caracteres.");
  const ent = o.entidad as Record<string, unknown> | undefined;
  if (!ent || (ent.tipo !== "persona" && ent.tipo !== "entidad") || typeof ent.publica !== "boolean") {
    e.push("«entidad»: { tipo: \"persona\" | \"entidad\", ref, publica: true|false }.");
  } else if (ent.tipo === "entidad" && (typeof ent.ref !== "string" || !ent.ref.trim())) {
    e.push("«entidad.ref»: el id de la entidad del OS que la publica.");
  }
  if (o.repo !== null && (typeof o.repo !== "string" || !RE_REPO.test(o.repo))) e.push("«repo»: «owner/repo» o null.");
  if (!https(o.web)) e.push("«web»: la URL https de la versión en línea.");
  if (typeof o.licencia !== "string" || !o.licencia.trim()) e.push("«licencia»: la licencia del código (el OS solo lista código abierto o licencias libres).");
  const formatos = Array.isArray(o.formatos) ? o.formatos : [];
  if (!formatos.length || formatos.some((f) => !(FORMATOS_APP as readonly unknown[]).includes(f))) e.push(`«formatos»: uno o varios de ${FORMATOS_APP.join(", ")}.`);
  const capas = Array.isArray(o.capas) ? o.capas : [];
  if (!capas.length || capas.some((c) => !(CAPAS_VINCULO as readonly unknown[]).includes(c))) e.push(`«capas»: una o varias de ${CAPAS_VINCULO.join(", ")}.`);
  const tablas = Array.isArray(o.tablas) ? o.tablas : [];
  if (tablas.some((t) => typeof t !== "string" || !RE_TABLA.test(t))) e.push("«tablas»: nombres de tabla en minúsculas (con RLS por cuenta).");
  if (capas.includes("sincronizacion") && !tablas.length) e.push("Con la capa «sincronizacion» declara sus tablas en «tablas».");
  if (o.estaciones !== undefined) {
    const es = o.estaciones as Record<string, unknown>;
    if (!es || typeof es.fuente !== "string" || !["omnifrecuencias", "audiomorphic", "visual"].includes(String(es.params))) {
      e.push("«estaciones»: { fuente, params: \"omnifrecuencias\" | \"audiomorphic\" | \"visual\" }.");
    }
    if (!capas.includes("directo")) e.push("Si declara «estaciones», añade la capa «directo».");
  }
  const act = o.actualizaciones as Record<string, unknown> | undefined;
  if (!act || !(CANALES_ACTUALIZACION as readonly unknown[]).includes(act.canal) || (act.auto !== "segun-ajustes" && act.auto !== "manual")) {
    e.push(`«actualizaciones»: { canal: ${CANALES_ACTUALIZACION.join(" | ")}, auto: "segun-ajustes" | "manual" }.`);
  } else if (act.canal === "github-releases" && (typeof act.repo !== "string" || !RE_REPO.test(act.repo))) {
    e.push("«actualizaciones.repo»: el «owner/repo» donde publica sus releases.");
  }
  if (e.length) return { ok: false, errores: e };
  return { ok: true, manifiesto: o as unknown as ManifiestoApp };
}
