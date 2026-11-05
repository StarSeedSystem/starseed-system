// La fuente única de los PERMISOS que cada app StarSeed declara en cada
// sistema (contrato `architecture/centro-versiones-1105.md` §6). Módulo PURO:
// sin React, sin `node:*` — lo importan la ficha de versiones y la API, y
// potencialmente componentes de cliente. La verdad vive en
// `config/permisos-por-so.json` y en las capabilities de Tauri; aquí solo hay
// tipos, lecturas y funciones de decisión.

import datos from "../../../config/permisos-por-so.json";
import capaDefault from "../../../native/src-tauri/capabilities/default.json";
import capaEscritorio from "../../../native/src-tauri/capabilities/desktop.json";

// ── Tipos ──

export const SO_VERSION = [
  "macos",
  "windows",
  "linux",
  "android",
  "ios",
  "web",
] as const;

export type SoVersion = (typeof SO_VERSION)[number];

export type PermisoPropio = {
  id: string;
  comoSeConcede: string;
  texto: string;
};

export type SistemaPermisos = {
  versionMinima: string | null;
  arquitecturas: readonly string[];
  instaladores: readonly string[];
  estado?: string;
  incluye: readonly string[];
  propios: readonly PermisoPropio[];
  instalacion?: string;
  componentes?: string;
  noPermite: readonly string[];
};

export type GrupoCompanero = {
  texto: string;
  comoSeConcede: string;
  comandos?: readonly string[];
  alcance?: readonly string[];
  capacidades: readonly string[];
};

// ── Datos tipados ──

export const CONCESIONES: readonly string[] = datos.comoSeConcedePosibles;

const COMPANERO_DATOS = datos.companero as unknown as Record<string, GrupoCompanero>;
const SISTEMAS_DATOS = datos.sistemas as unknown as Record<SoVersion, SistemaPermisos>;

export const COMPANERO: Readonly<Record<string, GrupoCompanero>> = COMPANERO_DATOS;
export const PERMISOS_POR_SO: Readonly<Record<SoVersion, SistemaPermisos>> = SISTEMAS_DATOS;

// ── Funciones de decisión ──

export function permisosDe(so: SoVersion): SistemaPermisos {
  return PERMISOS_POR_SO[so];
}

function identificadoresDeCapability(
  identidades: readonly string[],
): readonly string[] {
  const deGrupos = identidades.flatMap(
    (clave) => COMPANERO[clave]?.capacidades ?? [],
  );
  return Array.from(new Set(deGrupos));
}

export function identificadoresDe(so: SoVersion): readonly string[] {
  return identificadoresDeCapability(permisosDe(so).incluye);
}

function identificadoresDeCapabilities(): readonly string[] {
  const saca = (permisos: readonly unknown[]): readonly string[] =>
    permisos.flatMap((p) =>
      typeof p === "string" ? [p] : [(p as { identifier: string }).identifier],
    );
  return [
    ...saca(capaDefault.permissions),
    ...saca(capaEscritorio.permissions),
  ];
}

/** Los identificadores de las capabilities de Tauri que el JSON aún no cubre. */
export function capacidadesNoEnJson(): readonly string[] {
  const cubiertas = new Set(
    Object.values(COMPANERO).flatMap((g) => g.capacidades),
  );
  return identificadoresDeCapabilities().filter(
    (id) => !cubiertas.has(id),
  );
}
