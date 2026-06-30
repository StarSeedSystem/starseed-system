"use client";

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Librería · Enlaces de instalación (con permisos)
// ----------------------------------------------------------------
// Genera y parsea enlaces COMPARTIBLES que, al abrirse, ofrecen instalar
// una fuente/librería en un cerebro CON el permiso (alcance) del usuario o
// de la comunidad. El enlace por sí solo NO instala nada: lleva a una
// pantalla de confirmación (`/install`) donde el usuario debe pulsar
// explícitamente "Instalar".
//
// Formato del enlace:
//   /install?src=<sourceId>&kind=<kind>&scope=<user|community>[&brain=<brainId>]
//
// ⚠️ DEFENSIVO: todo parseo es tolerante; nunca lanza. La construcción del
//    enlace funciona en SSR (path relativo) y, en cliente, puede devolver la
//    URL absoluta usando `window.location.origin`.
// ════════════════════════════════════════════════════════════════

import type { LibrarySource } from "@/lib/oss-library";
import type { InstallScope, SourceKind } from "@/lib/library/sources-store";
import { normalizeKind } from "@/lib/library/sources-store";

/** Ruta base de la pantalla de instalación con permisos. */
export const INSTALL_PATH = "/install";

/** Parámetros que viajan en un enlace de instalación. */
export interface InstallLinkParams {
  /** Id de la fuente/librería a instalar. */
  sourceId: string;
  /** Cerebro destino preseleccionado (opcional: si falta, se elige en pantalla). */
  brainId?: string;
  /** Alcance/permiso solicitado (por defecto "user"). */
  scope?: InstallScope;
  /** Tipo de origen (informativo, para la pantalla de confirmación). */
  kind?: SourceKind | LibrarySource["kind"];
}

function normalizeScope(v: unknown): InstallScope {
  return v === "community" ? "community" : "user";
}

/**
 * Construye el path relativo del enlace de instalación (siempre disponible,
 * incluso en SSR). Ej.: `/install?src=github&kind=code&scope=user`.
 */
export function buildInstallPath(params: InstallLinkParams): string {
  const sp = new URLSearchParams();
  const src = (params.sourceId ?? "").trim();
  if (src) sp.set("src", src);
  sp.set("kind", normalizeKind(params.kind));
  sp.set("scope", normalizeScope(params.scope));
  if (params.brainId && params.brainId.trim()) sp.set("brain", params.brainId.trim());
  const qs = sp.toString();
  return qs ? `${INSTALL_PATH}?${qs}` : INSTALL_PATH;
}

/**
 * Construye el enlace compartible. En cliente devuelve una URL absoluta
 * (`window.location.origin` + path); en SSR devuelve el path relativo.
 * Pásalo entre usuarios/comunidad: abre la pantalla de permiso, no instala.
 */
export function buildInstallLink(params: InstallLinkParams): string {
  const path = buildInstallPath(params);
  try {
    if (typeof window !== "undefined" && window.location?.origin) {
      return `${window.location.origin}${path}`;
    }
  } catch {
    /* SSR / sin window: devolvemos el path relativo */
  }
  return path;
}

/**
 * Parsea los parámetros de un enlace de instalación desde un
 * `URLSearchParams` (o algo equivalente con `.get`). Tolerante: devuelve
 * `sourceId` vacío si no viene, y normaliza kind/scope.
 */
export function parseInstallParams(
  search: URLSearchParams | { get(name: string): string | null } | null | undefined,
): Required<Pick<InstallLinkParams, "scope">> & {
  sourceId: string;
  brainId: string;
  kind: SourceKind;
} {
  const get = (k: string): string => {
    try {
      return (search?.get(k) ?? "").trim();
    } catch {
      return "";
    }
  };
  return {
    sourceId: get("src"),
    brainId: get("brain"),
    kind: normalizeKind(get("kind")),
    scope: normalizeScope(get("scope")),
  };
}

/** Etiqueta humana del alcance, para la copia de la pantalla de permiso. */
export function scopeLabel(scope: InstallScope): string {
  return scope === "community" ? "la comunidad" : "el usuario";
}

/** Etiqueta corta del alcance para badges. */
export function scopeBadge(scope: InstallScope): string {
  return scope === "community" ? "Comunidad" : "Usuario";
}
