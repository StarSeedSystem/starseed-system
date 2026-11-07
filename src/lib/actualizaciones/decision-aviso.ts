/**
 * ════════════════════════════════════════════════════════════════════════════
 * (VER1107B · 2026-11-07) ¿Se abre «Hay una versión nueva»? Decisión PURA.
 * Contrato: architecture/centro-versiones-1105.md §8.
 *
 * Reglas:
 *   · Solo en la app de escritorio y en la de Android (la web y la PWA tienen su banner; iOS, la PWA).
 *   · Solo con versiones de verdad (semver) a los dos lados: si no se sabe la instalada, NADA.
 *   · La lista publicada (`/api/os/versiones`) dice que hay algo más nuevo, pero en ESCRITORIO manda el
 *     canal del updater de ESTA app (`buscar_actualizacion`): si no ofrece nada, la versión «aún se está
 *     preparando para este sistema» y no se abre la ventana. Una app anterior a VER1107B no tiene ese
 *     comando: se decide con la lista (ya con la versión bien leída).
 *   · En Android manda el .apk de la misma firma: sin él, también «se está preparando».
 * ════════════════════════════════════════════════════════════════════════════
 */

import { esVersionMasNueva, esVersionSemver } from "@/lib/version/os-release";
import type { Medio } from "./version-por-medio";

export const MEDIOS_CON_VENTANA: readonly Medio[] = ["escritorio", "android"];

/** La versión sin «v» ni espacios. Pura. */
export function limpiarVersion(v: string | null | undefined): string {
  return String(v ?? "").trim().replace(/^v/i, "");
}

/** Lo que dijo el updater de escritorio al BUSCAR (sin instalar). */
export type RespuestaUpdater =
  | { estado: "ok"; disponible: string | null }
  | { estado: "sin-comando" }
  | { estado: "error"; motivo: string };

export type DecisionAviso =
  | { tipo: "nada"; motivo: string }
  | { tipo: "ventana"; version: string; origen: "updater" | "lista"; apk: string | null }
  | { tipo: "preparando"; version: string; texto: string };

export interface EntradaDecision {
  medio: Medio;
  instalada: string | null | undefined;
  /** La última de `/api/os/versiones`. */
  publicada: string | null | undefined;
  /** Versiones ya enseñadas (no se repite la ventana) salvo con `forzar`. */
  vistas: Record<string, unknown>;
  /** Escritorio: el resultado de `buscar_actualizacion`. `null` = no se pudo preguntar. */
  updater?: RespuestaUpdater | null;
  /** Android: el .apk de la misma firma para `publicada` (null si no hay). */
  apk?: string | null;
  /** Lo pide la persona (botón) u otra neurona suya: se ignora «ya vista». */
  forzar?: boolean;
}

/** Texto cuando lo publicado aún no está listo para este sistema. Pura. */
export function textoPreparando(version: string, medio: Medio): string {
  const donde = medio === "android" ? "Android" : "este sistema";
  return `StarSeed OS ${version} está publicada, pero aún se está preparando para ${donde}. Te avisaremos cuando esté lista; no hace falta hacer nada.`;
}

/** ¿Se abre la ventana, se dice «se está preparando» o nada? Pura. */
export function decidirAviso(e: EntradaDecision): DecisionAviso {
  if (!MEDIOS_CON_VENTANA.includes(e.medio)) return { tipo: "nada", motivo: "Este medio se actualiza por su cuenta." };
  const actual = limpiarVersion(e.instalada);
  const nueva = limpiarVersion(e.publicada);
  if (!esVersionSemver(actual)) return { tipo: "nada", motivo: "No se sabe la versión instalada de esta app." };
  if (!esVersionSemver(nueva)) return { tipo: "nada", motivo: "No se sabe la última versión publicada." };
  if (!esVersionMasNueva(nueva, actual)) return { tipo: "nada", motivo: `Al día: tienes la ${actual}.` };
  if (!e.forzar && e.vistas[nueva]) return { tipo: "nada", motivo: `La ${nueva} ya se te enseñó.` };

  if (e.medio === "android") {
    return e.apk
      ? { tipo: "ventana", version: nueva, origen: "lista", apk: e.apk }
      : { tipo: "preparando", version: nueva, texto: textoPreparando(nueva, e.medio) };
  }

  const u = e.updater;
  if (!u) return { tipo: "nada", motivo: "No se pudo preguntar al actualizador de la app." };
  if (u.estado === "sin-comando") return { tipo: "ventana", version: nueva, origen: "lista", apk: null };
  if (u.estado === "error") return { tipo: "nada", motivo: u.motivo || "El actualizador de la app no respondió." };
  const ofrecida = limpiarVersion(u.disponible);
  if (esVersionSemver(ofrecida) && esVersionMasNueva(ofrecida, actual)) {
    return { tipo: "ventana", version: ofrecida, origen: "updater", apk: null };
  }
  return { tipo: "preparando", version: nueva, texto: textoPreparando(nueva, e.medio) };
}

/** Texto tras «Actualizar ahora» cuando el updater dice que no hay nada: «Ya tienes la X.Y.Z». Pura. */
export function textoAlDia(instalada: string | null | undefined, publicada?: string | null): string {
  const actual = limpiarVersion(instalada);
  if (!esVersionSemver(actual)) return "Ya tienes la última versión para este sistema.";
  const nueva = limpiarVersion(publicada);
  const extra =
    esVersionSemver(nueva) && esVersionMasNueva(nueva, actual)
      ? ` La ${nueva} aún se está preparando para este sistema: te avisaremos cuando esté lista.`
      : "";
  return `Ya tienes la ${actual}.${extra}`;
}
