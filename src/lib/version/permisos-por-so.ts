import permisosDeSO from "../../../config/permisos-por-so.json" with { type: "json" };

export type SistemaOperativo = "macos" | "windows" | "linux" | "android" | "ios" | "web";

export interface PermisoSO {
  nombre: string;
  texto: string;
  alConceder: string;
  noPermite?: string[];
}

export interface ConfigSO {
  versionMinima: string;
  arquitecturas: string[];
  permisos: PermisoSO[];
  noPermiteSistema?: string[];
}

export type { ConfigSO, PermisoSO, SistemaOperativo };

export function tipo(so: SistemaOperativo): ConfigSO {
  return permisosDe(so);
}

export function permisosDe(so: SistemaOperativo): ConfigSO {
  const config = permisosDeSO[so];
  if (!config) {
    throw new Error(`Sistema operativo desconocido: ${so}`);
  }
  return config;
}

export function validarPermisoEnJson(nombre: string): boolean {
  const identificadores = new Set(
    Object.values(permisosDeSO).flatMap((so) => so.permisos.map((p) => p.nombre)),
  );
  return identificadores.has(nombre);
}

