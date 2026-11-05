const permisosData = require('../../../config/permisos-por-so.json') as Record<string, unknown>;

export type Permiso = {
  id: string;
  texto: string;
  como: string;
};

export type SoInfo = {
  versionMinima: string;
  arquitecturas: string[];
  permisos: Permiso[];
  noPermite: string[];
};

export type PermisosPorSo = Record<string, SoInfo>;

export function permisosDe(so: string): SoInfo | undefined {
  return (permisosData as PermisosPorSo)[so];
}

export const TODOS = permisosData as PermisosPorSo;
