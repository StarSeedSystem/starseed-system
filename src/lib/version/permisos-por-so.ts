// Fuente ÚNICA de los permisos que declara StarSeed OS por sistema.
// Módulo PURO (sin node:*, sin navigator): lo leen componentes de cliente.
// Los datos viven en config/permisos-por-so.json, que a su vez solo dice lo
// que está en los archivos del repositorio (capabilities de Tauri, Info.plist,
// tauri.conf.json, native-build.yml). Contrato: architecture/centro-versiones-1105.md §6.

import datos from "../../../config/permisos-por-so.json";

/** Cómo se concede un permiso: solo las tres maneras reales. */
export type CuandoConcede = "al instalar" | "al primer uso" | "en ajustes";

export type SoPermisos = "macos" | "windows" | "linux" | "android" | "ios" | "web";

export const SO_PERMISOS: readonly SoPermisos[] = [
  "macos",
  "windows",
  "linux",
  "android",
  "ios",
  "web",
];

interface GrupoDeclarado {
  ids: string[];
  texto: string;
  cuando: CuandoConcede;
  plataformas: SoPermisos[];
}

interface DeclaracionOS {
  fuente?: string;
  identificador: string;
  texto: string;
  cuando: CuandoConcede;
}

export interface PermisosDeSo {
  /** Versión mínima del sistema tal como la declara el build del repositorio. */
  desde: string;
  arquitecturas: string[];
  /** Toca al grupo [identificador], con texto para la persona y cómo se concede. */
  permisos: GrupoDeclarado[];
  permisosOS: DeclaracionOS[];
  /** Lo que ese SO NO permite (verdad del propio build, sin ilusiones). */
  noPermite: string[];
}

interface DatosPermisos {
  "$doc": string;
  "cuando-valores": CuandoConcede[];
  grupos: GrupoDeclarado[];
  sistemas: Record<string, SistemaEntrada>;
}

/** Entrada TAL CUAL del JSON: claves kebab-case (es un archivo de configuración). */
interface SistemaEntrada {
  desde: string;
  arquitecturas: string[];
  "declara-os"?: DeclaracionOS[];
  "no-permite": string[];
}

const FUENTE = datos as unknown as DatosPermisos;

/**
 * Los permisos declarados de UN sistema: los grupos de capabilities de Tauri
 * que tocan a ese SO (ya deduplicados, en el orden del archivo fuente) más lo
 * que ese sistema declara aparte (Info.plist en macOS) y lo que NO permite.
 * Función pura: misma entrada, misma salida, sin estado ni disco.
 */
export function permisosDe(so: string): PermisosDeSo | undefined {
  const base = FUENTE.sistemas[so];
  if (!base) return undefined;
  const permisos = FUENTE.grupos.filter((g) => g.plataformas.includes(so as SoPermisos));
  return {
    desde: base.desde,
    arquitecturas: base.arquitecturas,
    permisosOS: base["declara-os"] ?? [],
    noPermite: base["no-permite"],
    permisos,
  };
}

/** ¿Se usa ese identificador de permiso en este sistema? (para guías y avisos). */
export function tieneIdentificador(so: string, identificador: string): boolean {
  return (
    permisosDe(so)?.permisos.some((g) => g.ids.includes(identificador)) ??
    permisosDe(so)?.permisosOS.some((p) => p.identificador === identificador) ??
    false
  );
}
