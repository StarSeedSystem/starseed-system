import permisosData from "../../../config/permisos-por-so.json" assert { type: "json" };

export type SO = "macos" | "windows" | "linux" | "android" | "ios" | "web";
export type Permiso = { id: string; desc: string };
export type PermisosSO = {
  minVersion: string;
  archs: string[];
  permissions: Permiso[];
  limitations: string[];
};

export const permisosDe = (so: SO): PermisosSO => {
  return permisosData[so] as PermisosSO;
};
