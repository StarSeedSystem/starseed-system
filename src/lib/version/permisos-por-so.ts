// Fuente única de lo que StarSeed OS declara y pide en cada sistema. Módulo
// PURO: importa el JSON estático y no toca red, disco ni `node:*`.
// Contrato: architecture/centro-versiones-1105.md §6.

import datos from "../../../config/permisos-por-so.json";

export type SistemaOperativo = "macos" | "windows" | "linux" | "android" | "ios" | "web";

export type FormaDeConceder = "al-instalar" | "al-primer-uso" | "en-ajustes";

export interface PermisoDeclarado {
  /** Identificadores tal cual aparecen en las capabilities o en el manifiesto. */
  ids: readonly string[];
  /** Lo que ve la persona, en español y sin jerga. */
  texto: string;
  concede: FormaDeConceder;
  sistemas: readonly SistemaOperativo[];
}

export interface DatosSistema {
  nombre: string;
  versionMinima: string;
  arquitecturas: readonly string[];
  instaladores: readonly string[];
  noPermite: readonly string[];
}

export interface PermisosSistema extends DatosSistema {
  permisos: readonly PermisoDeclarado[];
}

interface Catalogo {
  sistemas: Record<SistemaOperativo, DatosSistema>;
  permisos: readonly PermisoDeclarado[];
}

const CATALOGO = datos as unknown as Catalogo;

/** Devuelve lo que ese sistema declara, pide y no permite. */
export function permisosDe(so: SistemaOperativo): PermisosSistema {
  const sistema = CATALOGO.sistemas[so];
  return {
    ...sistema,
    permisos: CATALOGO.permisos.filter((permiso) => permiso.sistemas.includes(so)),
  };
}
