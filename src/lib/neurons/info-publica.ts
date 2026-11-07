/**
 * info-publica — la versión, el medio y el aparato que cada neurona ANUNCIA de sí misma (VER1107B, 2026-11-07).
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Viaja en la presencia de la cuenta (`PresenciaMedio.d`, `lib/neurons/presencia.ts`) junto a `v`
 * (versión de cada capa, con `v.nativa`). Retrocompatible: una neurona con una web anterior no manda
 * `d` y el panel dice «versión desconocida»; nada se inventa ni se rellena.
 * Contrato: architecture/sincronizacion-neuronas.md §9.
 *
 * Solo datos que la cuenta ya puede ver de sus propios aparatos (la presencia es del canal de la
 * cuenta): medio, sistema operativo y su versión, arquitectura y nombre del equipo o modelo.
 * Puro salvo `infoPublicaDeEsteMedio` (lee la app nativa una vez). Nunca lanza.
 */

import { compararVersiones, esVersionMasNueva, esVersionSemver } from "@/lib/version/os-release";
import type { Instalada, Medio } from "@/lib/actualizaciones/version-por-medio";

/** Lo que una neurona anuncia de este medio. Campos cortos: viaja a cada medio de la cuenta. */
export interface InfoPublicaNeurona {
  medio: Medio;
  /** Qué app nativa es (solo apps nativas). */
  app?: "os" | "cafe" | "nexus";
  /** Sistema operativo ("macos", "windows", "linux", "android", "ios"). */
  so?: string;
  /** Versión del sistema operativo. */
  soV?: string;
  /** Arquitectura ("aarch64", "x86_64"…). */
  arq?: string;
  /** Nombre del equipo o modelo del aparato. */
  equipo?: string;
  /** 1 = entiende «Pedir actualización» (`neurona.actualizar.solicitud`, VER1107B). */
  pa?: 1;
}

const MEDIOS: readonly Medio[] = ["web", "pwa", "escritorio", "android", "ios"];
const APPS = ["os", "cafe", "nexus"] as const;

function corto(x: unknown, max: number): string | undefined {
  if (typeof x !== "string") return undefined;
  const t = x.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return t ? t.slice(0, max) : undefined;
}

/** Valida lo que llega de OTRA neurona (nunca se confía en su forma). Pura. */
export function sanearInfoPublica(x: unknown): InfoPublicaNeurona | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (!MEDIOS.includes(o.medio as Medio)) return null;
  const out: InfoPublicaNeurona = { medio: o.medio as Medio };
  if (APPS.includes(o.app as (typeof APPS)[number])) out.app = o.app as InfoPublicaNeurona["app"];
  const so = corto(o.so, 20);
  if (so) out.so = so.toLowerCase();
  const soV = corto(o.soV, 40);
  if (soV) out.soV = soV;
  const arq = corto(o.arq, 20);
  if (arq) out.arq = arq;
  const equipo = corto(o.equipo, 60);
  if (equipo) out.equipo = equipo;
  if (o.pa === 1) out.pa = 1;
  return out;
}

/** Lo que este medio anuncia, a partir de lo que leyó `leerInstalada`. Pura. */
export function infoPublicaDesde(instalada: Pick<Instalada, "medio" | "info">): InfoPublicaNeurona {
  const i = instalada.info;
  const out: InfoPublicaNeurona = { medio: instalada.medio, pa: 1 };
  if (i) {
    if (APPS.includes(i.sistema as (typeof APPS)[number])) out.app = i.sistema as InfoPublicaNeurona["app"];
    if (i.plataforma) out.so = i.plataforma.toLowerCase();
    if (i.so_version) out.soV = i.so_version;
    if (i.arquitectura) out.arq = i.arquitectura;
    const equipo = i.modelo ?? i.equipo;
    if (equipo) out.equipo = equipo;
  }
  return sanearInfoPublica(out) ?? { medio: instalada.medio, pa: 1 };
}

let cache: Promise<InfoPublicaNeurona | null> | null = null;

/** Lo que anuncia ESTE medio (se lee una vez por pestaña). */
export function infoPublicaDeEsteMedio(): Promise<InfoPublicaNeurona | null> {
  cache ??= import("@/lib/actualizaciones/version-por-medio")
    .then((m) => m.leerInstalada())
    .then((inst) => infoPublicaDesde(inst))
    .catch(() => {
      cache = null;
      return null;
    });
  return cache;
}

export const NOMBRE_MEDIO: Record<Medio, string> = {
  escritorio: "App de escritorio",
  android: "App de Android",
  pwa: "App web instalada",
  web: "Navegador",
  ios: "iPhone o iPad (web)",
};

const NOMBRE_APP: Record<NonNullable<InfoPublicaNeurona["app"]>, string> = { os: "StarSeed OS", cafe: "StarSeed Café", nexus: "StarSeed Nexus" };

const NOMBRE_SO: Record<string, string> = { macos: "macOS", windows: "Windows", linux: "Linux", android: "Android", ios: "iOS" };

/** Lo que el panel enseña de una neurona. */
export interface VistaInfoNeurona {
  /** «0.5.0» o null si no se sabe. */
  version: string | null;
  /** «Versión 0.5.0», «Web: se actualiza sola» o «versión desconocida». */
  etiquetaVersion: string;
  /** «App de escritorio · StarSeed OS» o null. */
  medio: string | null;
  /** «MacBook-de-Alex · macOS 15.1 · aarch64» o null. */
  aparato: string | null;
  estado: "al-dia" | "nueva" | "web" | "desconocida";
  /** «Nueva versión disponible: 0.6.0» cuando toca. */
  aviso: string | null;
  /** ¿Entiende «Pedir actualización»? */
  entiendePedido: boolean;
}

export interface DatosNeurona {
  /** `v.nativa` de su presencia. */
  version?: string | null;
  info?: InfoPublicaNeurona | null;
  /** `plataforma` de la presencia (para neuronas que no mandan `d`). */
  plataforma?: string | null;
}

/** Cómo se enseña la info de una neurona frente a la última versión publicada. Pura. */
export function formatearInfoNeurona(d: DatosNeurona, ultimaPublicada?: string | null): VistaInfoNeurona {
  const info = d.info ?? null;
  const version = esVersionSemver(d.version) ? String(d.version).trim().replace(/^v/i, "") : null;
  const esWeb = !!info && (info.medio === "web" || info.medio === "pwa" || info.medio === "ios");
  const medio = info ? `${NOMBRE_MEDIO[info.medio]}${info.app ? ` · ${NOMBRE_APP[info.app]}` : ""}` : null;
  const so = info?.so ? `${NOMBRE_SO[info.so] ?? info.so}${info.soV ? ` ${info.soV}` : ""}` : d.plataforma?.trim() || null;
  const partes = [info?.equipo, so, info?.arq].filter((x): x is string => !!x);
  const aparato = partes.length ? partes.join(" · ") : null;
  const ultima = esVersionSemver(ultimaPublicada) ? String(ultimaPublicada).trim().replace(/^v/i, "") : null;
  let estado: VistaInfoNeurona["estado"] = "desconocida";
  let etiquetaVersion = "versión desconocida";
  let aviso: string | null = null;
  if (version) {
    etiquetaVersion = `Versión ${version}`;
    estado = "al-dia";
    if (ultima && esVersionMasNueva(ultima, version)) {
      estado = "nueva";
      aviso = `Nueva versión disponible: ${ultima}`;
    }
  } else if (esWeb) {
    etiquetaVersion = "Web: se actualiza sola";
    estado = "web";
  }
  return { version, etiquetaVersion, medio, aparato, estado, aviso, entiendePedido: info?.pa === 1 };
}

/** De los medios abiertos de UNA neurona, el que mejor la describe: la app nativa más nueva. Pura. */
export function mejorMedio<T extends { v?: { nativa?: string }; d?: InfoPublicaNeurona; visible?: boolean }>(medios: readonly T[]): T | null {
  if (!medios.length) return null;
  const puntos = (m: T) => (esVersionSemver(m.v?.nativa) ? 2 : 0) + (m.d ? 1 : 0);
  return [...medios].sort((a, b) => {
    const p = puntos(b) - puntos(a);
    if (p) return p;
    if (a.v?.nativa && b.v?.nativa) return compararVersiones(b.v.nativa, a.v.nativa);
    return Number(!!b.visible) - Number(!!a.visible);
  })[0];
}
