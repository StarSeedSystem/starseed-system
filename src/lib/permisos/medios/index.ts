import {
  leerMacos,
  type FuenteMacos,
} from "./macos";
import type { Lectura, Medio, Permiso, Estado, FilaPlan, Accion } from "@/lib/permisos/matriz";
import {
  leerWindows,
  leerLinux,
  type FuenteEscritorio,
} from "./escritorio";

export interface FuenteMedio {
  macos?: FuenteMacos;
  windows?: FuenteEscritorio["windows"];
  linux?: FuenteEscritorio["linux"];
  android?: Record<string, unknown>;
  navegador?: { permissions?: Record<string, string> };
  terminal?: null;
}

const PERMISOS_LISTA: Permiso[] = [
  "microfono", "camara", "ubicacion", "bluetooth", "notificaciones",
  "pantalla", "accesibilidad", "arranque", "red-local",
  "segundo-plano", "archivos", "entrada-virtual", "energia",
];

export function leerMedio(medio: Medio, fuente: FuenteMedio): Partial<Record<Permiso, Lectura>> {
  switch (medio) {
    case "macos":
      return fuente.macos ? leerMacos(fuente.macos) : {};
    case "windows":
      return fuente.windows ? leerWindows(fuente.windows) : {};
    case "linux":
      return fuente.linux ? leerLinux(fuente.linux, (fuente.linux as any).sesion || "x11") : {};
    case "android":
      return {};
    case "ios":
      return {};
    case "navegador":
      return {};
    case "terminal":
      return {};
    default:
      return {};
  }
}

function estadoDesdeLectura(lectura: Lectura | undefined): Estado {
  if (!lectura) return "falta";
  if (lectura.concedido) return "concedido";
  if (lectura.diceDenegado) return "denegado-a-mano";
  if (lectura.ilegible) return "desconocido";
  return "falta";
}

function accionPara(estado: Estado, accion: Accion): Accion {
  if (estado === "concedido") return "listo";
  if (estado === "denegado-a-mano") return "abrir-ajustes";
  if (estado === "por-uso") return "por-uso";
  return accion;
}

export function planDeMedio(
  medio: Medio,
  fuente: FuenteMedio,
  momento: "instalar" | "abrir" = "abrir",
): FilaPlan[] {
  const estados = leerMedio(medio, fuente);
  const filas: FilaPlan[] = [];

  for (const permiso of PERMISOS_LISTA) {
    const lectura = estados[permiso];
    const estado = estadoDesdeLectura(lectura);
    const accion = accionPara(estado, "pedir");
    filas.push({ permiso, estado, accion });
  }

  return filas;
}

export type { FuenteMacos, FuenteEscritorio };