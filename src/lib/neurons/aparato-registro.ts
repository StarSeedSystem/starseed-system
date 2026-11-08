/*
 * aparato-registro — la identidad del APARATO que cada neurona guarda en su fila (NEU1108A · 2026-11-08).
 * Contrato: architecture/neurona-bienvenida.md §2.1 y architecture/sincronizacion-neuronas.md §9.1.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Medido en la cuenta de Alex el 08-11: ninguna fila de `neuron_devices` guardaba de qué aparato era
 * (equipo, sistema, versión, huella), solo la plataforma y el navegador. Así, al reinstalar la app de la
 * tableta, la ventana «Esta neurona» solo tenía señales débiles y preseleccionó también un móvil distinto.
 *
 * Aquí vive el bloque pequeño `capabilities.aparato` (jsonb que ya existe: SIN migración) que cada medio
 * escribe con su ficha (al registrarse y cada 30 min con el latido):
 *   · `medio`, `app`, `so`, `soV`, `arq`, `equipo`, `version`: lo que dice la app nativa (`info_neurona`);
 *   · `huella`: un hash corto (sha-256, 16 hex) del aparato — nunca los datos crudos del hierro;
 *   · `ultimoMedio` y `visto`: el último medio que escribió la fila y cuándo.
 * Un navegador no sabe el equipo (y está bien: no debe poder identificar la máquina): solo pone
 * `ultimoMedio`/`visto` y, si falta, el sistema; nunca pisa lo que escribió la app nativa.
 *
 * Puro salvo `huellaAparato` (usa `crypto.subtle`). Nunca lanza.
 */

import { familiaSistema, normalizarGpu } from "./huella";

/** Medios (espejo de `Medio` de `lib/actualizaciones/version-por-medio.ts`, sin importarlo: módulo puro). */
export type MedioAparato = "web" | "pwa" | "escritorio" | "android" | "ios";
const MEDIOS: readonly MedioAparato[] = ["web", "pwa", "escritorio", "android", "ios"];
const APPS = ["os", "cafe", "nexus"] as const;
export type AppAparato = (typeof APPS)[number];

/** Clave del bloque dentro de `neuron_devices.capabilities`. */
export const CLAVE_APARATO = "aparato";

export interface AparatoRegistro {
  v: 1;
  /** Medio que dio la identidad del aparato (el más rico: la app nativa). */
  medio?: MedioAparato;
  /** Qué app nativa es (solo apps nativas). */
  app?: AppAparato;
  /** Familia del sistema operativo («macos», «android»…). */
  so?: string;
  /** Versión del sistema operativo. */
  soV?: string;
  /** Arquitectura («aarch64», «x86_64»…). */
  arq?: string;
  /** Nombre del equipo (escritorio) o modelo (Android), como lo dice la app nativa. */
  equipo?: string;
  /** Huella del aparato: sha-256 corto (16 hex) de `entradaHuella`. */
  huella?: string;
  /** Versión del binario nativo (semver). */
  version?: string;
  /** Último medio que escribió la fila. */
  ultimoMedio?: MedioAparato;
  /** Cuándo (ISO). */
  visto?: string;
}

const DESKTOP = new Set(["macos", "windows", "linux"]);
const MOVIL = new Set(["android", "ios", "ipados"]);
/** Nombres que el sistema da cuando no sabe (Android dice «localhost»): no identifican nada. */
const EQUIPOS_VACIOS = new Set(["", "localhost", "unknown", "desconocido", "none", "(none)", "null", "undefined", "android", "generic"]);

function texto(x: unknown, max: number): string | undefined {
  if (typeof x !== "string") return undefined;
  const t = x.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return t ? t.slice(0, max) : undefined;
}

function sinAcentos(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Equipo comparable: minúsculas, sin `.local`/`.lan`, sin espacios repetidos. Pura. */
export function normalizarEquipo(e: string | null | undefined): string {
  return sinAcentos(String(e ?? "").trim().toLowerCase())
    .replace(/\.(local|lan|home|localdomain)$/, "")
    .replace(/[\s_]+/g, "-");
}

/** ¿El equipo dice algo de verdad? («localhost» en Android, «unknown»… no). Pura. */
export function equipoUtil(e: string | null | undefined): boolean {
  return !EQUIPOS_VACIOS.has(normalizarEquipo(e));
}

/** Valida un bloque que viene de la base de datos (nunca se confía en su forma). Pura. */
export function sanearAparato(x: unknown): AparatoRegistro | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const out: AparatoRegistro = { v: 1 };
  if (MEDIOS.includes(o.medio as MedioAparato)) out.medio = o.medio as MedioAparato;
  if (APPS.includes(o.app as AppAparato)) out.app = o.app as AppAparato;
  const so = texto(o.so, 20);
  if (so) out.so = familiaSistema(so);
  const soV = texto(o.soV, 40);
  if (soV) out.soV = soV;
  const arq = texto(o.arq, 20);
  if (arq) out.arq = arq;
  const equipo = texto(o.equipo, 80);
  if (equipo && equipoUtil(equipo)) out.equipo = equipo;
  if (typeof o.huella === "string" && /^[0-9a-f]{16}$/.test(o.huella)) out.huella = o.huella;
  const version = texto(o.version, 40);
  if (version && /^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/.test(version.replace(/^v/i, ""))) out.version = version.replace(/^v/i, "");
  if (MEDIOS.includes(o.ultimoMedio as MedioAparato)) out.ultimoMedio = o.ultimoMedio as MedioAparato;
  const visto = texto(o.visto, 40);
  if (visto && Number.isFinite(Date.parse(visto))) out.visto = visto;
  return Object.keys(out).length > 1 ? out : null;
}

/** El bloque de una fila (`capabilities.aparato`), saneado; null si no hay. Pura. */
export function leerAparato(capabilities: unknown): AparatoRegistro | null {
  if (!capabilities || typeof capabilities !== "object") return null;
  return sanearAparato((capabilities as Record<string, unknown>)[CLAVE_APARATO]);
}

/** ¿Lo escribió una app nativa (sabe el equipo, la huella o su versión)? Pura. */
export function esAparatoRico(a: AparatoRegistro | null | undefined): boolean {
  return !!a && !!(a.equipo || a.huella || a.version);
}

/** Lo que entra en la huella: lo que todos los medios NATIVOS del aparato ven igual. */
export interface DatosHuella {
  so?: string | null;
  equipo?: string | null;
  cores?: number | string | null;
  gpuRenderer?: string | null;
  pantalla?: string | null;
}

/**
 * La cadena que se resume en la huella, o null si no hay datos para identificar el aparato. Pura.
 *  · Sin el equipo (solo lo sabe la app nativa) no hay huella: un navegador no identifica la máquina.
 *  · Escritorio: sistema + nombre del equipo (la pantalla y la GPU cambian con monitores y zoom).
 *  · Móvil: sistema + modelo + núcleos + GPU + pantalla (dos aparatos del mismo modelo casi nunca
 *    coinciden en todo; y un mismo modelo con otra pantalla es otro aparato).
 */
export function entradaHuella(d: DatosHuella): string | null {
  const so = familiaSistema(d.so ?? undefined);
  const equipo = normalizarEquipo(d.equipo);
  if (!equipoUtil(d.equipo) || so === "desconocido" || so === "otro") return null;
  if (DESKTOP.has(so)) return `starseed-aparato:v1|${so}|${equipo}`;
  if (MOVIL.has(so)) {
    const n = Number(d.cores);
    const nucleos = Number.isFinite(n) && n > 0 ? String(Math.round(n)) : "";
    const gpu = normalizarGpu(d.gpuRenderer);
    const pantalla = typeof d.pantalla === "string" ? d.pantalla.trim() : "";
    return `starseed-aparato:v1|${so}|${equipo}|${nucleos}|${gpu.modelo ?? gpu.familia}|${pantalla}`;
  }
  return `starseed-aparato:v1|${so}|${equipo}`;
}

/** sha-256 corto (16 hex) de la entrada; null sin `crypto.subtle` o sin entrada. Nunca lanza. */
export async function huellaAparato(d: DatosHuella): Promise<string | null> {
  const entrada = entradaHuella(d);
  if (!entrada) return null;
  try {
    const dig = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(entrada));
    return Array.from(new Uint8Array(dig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
  } catch {
    return null;
  }
}

/** Lo mínimo de `InfoNeuronaNativa` (lib/nativa/info-neurona.ts) que se guarda. */
export interface InfoNativaMinima {
  app_version?: string | null;
  sistema?: string | null;
  plataforma?: string | null;
  so_version?: string | null;
  arquitectura?: string | null;
  equipo?: string | null;
  modelo?: string | null;
}

/**
 * El bloque que escribe ESTE medio. Con la app nativa: todo lo que dice `info_neurona` y la huella;
 * en un navegador: solo el medio, la hora y el sistema que ve. Pura.
 */
export function aparatoDesde(p: {
  medio: MedioAparato | null;
  info?: InfoNativaMinima | null;
  /** Plataforma que ve el navegador (`capabilities.platform`) si la app no la dice. */
  plataforma?: string | null;
  huella?: string | null;
  ahora: number;
}): AparatoRegistro {
  const i = p.info ?? null;
  const crudo: Record<string, unknown> = {
    v: 1,
    so: i?.plataforma || p.plataforma || undefined,
    ultimoMedio: p.medio ?? undefined,
    visto: new Date(p.ahora).toISOString(),
  };
  if (i) {
    Object.assign(crudo, {
      medio: p.medio ?? undefined,
      app: i.sistema,
      soV: i.so_version,
      arq: i.arquitectura,
      equipo: i.modelo || i.equipo,
      version: i.app_version,
      huella: p.huella ?? undefined,
    });
  }
  return sanearAparato(crudo) ?? { v: 1, visto: new Date(p.ahora).toISOString() };
}

/**
 * Funde el bloque de la fila con el de este medio (los dos pueden faltar). Pura.
 *  · Si este medio es una app nativa (bloque «rico»), su identidad sustituye a la de la fila entera
 *    (versión nueva, otro equipo…), sin mezclar campos de dos aparatos.
 *  · Si es un navegador, la identidad de la fila se queda y solo se apunta el último medio y la hora
 *    (y el sistema, si la fila no lo tenía).
 */
export function combinarAparato(remoto: unknown, local: unknown): AparatoRegistro | null {
  const r = sanearAparato(remoto);
  const l = sanearAparato(local);
  if (!l) return r;
  if (!r) return l;
  if (esAparatoRico(l)) {
    return { ...l, so: l.so ?? r.so, ultimoMedio: l.ultimoMedio ?? r.ultimoMedio, visto: l.visto ?? r.visto };
  }
  return { ...r, so: r.so ?? l.so, ultimoMedio: l.ultimoMedio ?? r.ultimoMedio, visto: l.visto ?? r.visto };
}

export type ParecidoAparato = "mismo" | "distinto" | "sin-datos";

export interface ComparacionAparato {
  parecido: ParecidoAparato;
  /** Por qué, en palabras (para enseñarlo). */
  motivo: string;
}

/**
 * ¿Son el mismo aparato según lo que guardaron sus apps nativas? Pura.
 *  · Huellas en los dos: iguales → mismo; distintas → distinto.
 *  · Si no, equipos en los dos (mismo sistema): iguales → mismo; distintos → distinto.
 *  · Sistemas distintos (si los dos lo dicen) → distinto.
 *  · Si no, sin datos (deciden las demás señales).
 */
export function compararAparatos(a: AparatoRegistro | null | undefined, b: AparatoRegistro | null | undefined): ComparacionAparato {
  if (!a || !b) return { parecido: "sin-datos", motivo: "" };
  if (a.so && b.so && a.so !== b.so) return { parecido: "distinto", motivo: `otro sistema (${b.so})` };
  if (a.huella && b.huella) {
    return a.huella === b.huella
      ? { parecido: "mismo", motivo: "misma huella del aparato" }
      : { parecido: "distinto", motivo: `otro aparato (su huella no coincide${b.equipo ? `: ${b.equipo}` : ""})` };
  }
  const ea = normalizarEquipo(a.equipo);
  const eb = normalizarEquipo(b.equipo);
  if (a.equipo && b.equipo && ea && eb) {
    return ea === eb
      ? { parecido: "mismo", motivo: `mismo equipo (${a.equipo}) y mismo sistema` }
      : { parecido: "distinto", motivo: `otro equipo (${b.equipo})` };
  }
  return { parecido: "sin-datos", motivo: "" };
}
