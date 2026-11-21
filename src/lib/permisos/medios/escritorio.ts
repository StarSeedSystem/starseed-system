import type { Lectura, Permiso } from "@/lib/permisos/matriz";

export interface WindowsFuente {
  medios: Record<string, string>;
  notificacionesConcedidas: boolean | null | undefined;
  autostart_estado: boolean | null | undefined;
  firewall_estado: boolean | null | undefined;
  bluetooth_estado: "encendido" | "apagado" | "sin-permiso" | null | undefined;
  capacidad_estado: { bateria?: number } | null | undefined;
}

export interface LinuxFuente {
  sesion: "x11" | "wayland";
  permisos: Record<string, string>;
  bluetooth_estado: "activo" | "inactivo" | "sin-servicio" | null | undefined;
  firewall_estado: boolean | null | undefined;
  autostart_estado: boolean | null | undefined;
  capacidad_estado: { bateria?: number } | null | undefined;
}

export type FuenteEscritorio = { windows: WindowsFuente; linux: LinuxFuente };

const PERMISOS_LECTURA_WINDOWS: Partial<Record<Permiso, keyof WindowsFuente["medios"]>> = {
  microfono: "microfono",
  camara: "camara",
  ubicacion: "ubicacion",
  bluetooth: null,
  notificaciones: null,
  pantalla: null,
  accesibilidad: null,
  arranque: null,
  "red-local": null,
  energia: null,
};

const PERMISOS_LECTURA_LINUX: Partial<Record<Permiso, keyof LinuxFuente["permisos"]>> = {
  microfono: "microfono",
  camara: "camara",
  bluetooth: null,
  notificaciones: null,
  pantalla: null,
  accesibilidad: null,
  arranque: "arranque",
  energia: null,
  "red-local": null,
};

const NO_LEE_WINDOWS: Permiso[] = ["pantalla", "accesibilidad", "notificaciones", "bluetooth", "ubicacion"];
const NO_LEE_LINUX_X11: Permiso[] = ["pantalla", "accesibilidad", "notificaciones"];
const NO_LEE_LINUX_WAYLAND: Permiso[] = ["notificaciones"];

function crearLectura(concedido: boolean, diceDenegado?: boolean, ilegible?: boolean): Lectura {
  return { soportado: true, concedido, diceDenegado, ilegible };
}

function lecturaIlegible(): Lectura {
  return { soportado: true, concedido: false, ilegible: true };
}

function lecturaNoDisponible(): Lectura {
  return { soportado: false, concedido: false };
}

function estadoDesdeCadena(estado: string | undefined): { concedido: boolean; diceDenegado: boolean } | null {
  if (!estado) return null;
  if (estado === "concedido") return { concedido: true, diceDenegado: false };
  if (estado === "denegado") return { concedido: false, diceDenegado: true };
  return null;
}

function leerWindows(fuente: WindowsFuente): Partial<Record<Permiso, Lectura>> {
  const resultado: Partial<Record<Permiso, Lectura>> = {};

  for (const permiso of Object.keys(PERMISOS_LECTURA_WINDOWS) as Permiso[]) {
    if (NO_LEE_WINDOWS.includes(permiso)) {
      if (permiso === "red-local") {
        if (fuente.firewall_estado === undefined) {
          resultado[permiso] = lecturaNoDisponible();
        } else {
          resultado[permiso] = crearLectura(fuente.firewall_estado);
        }
        continue;
      }
      resultado[permiso] = lecturaNoDisponible();
      continue;
    }

    const clave = PERMISOS_LECTURA_WINDOWS[permiso];

    if (!clave) {
      if (permiso === "arranque") {
        if (fuente.autostart_estado === true) {
          resultado[permiso] = crearLectura(true);
        } else if (fuente.autostart_estado === false) {
          resultado[permiso] = crearLectura(false, true);
        } else {
          resultado[permiso] = lecturaNoDisponible();
        }
      } else {
        resultado[permiso] = lecturaNoDisponible();
      }
      continue;
    }

    const medio = fuente.medios?.[clave];
    if (!medio) {
      resultado[permiso] = lecturaNoDisponible();
      continue;
    }

    if (medio === "concedido") {
      resultado[permiso] = crearLectura(true);
    } else if (medio === "denegado") {
      resultado[permiso] = crearLectura(false, true);
    } else if (medio === "desconocido" || medio === "sin-preguntar" || medio === "no-concedido") {
      resultado[permiso] = lecturaIlegible();
    } else {
      resultado[permiso] = lecturaNoDisponible();
    }
  }

  return resultado;
}

function leerLinux(fuente: LinuxFuente, sesion: "x11" | "wayland"): Partial<Record<Permiso, Lectura>> {
  const resultado: Partial<Record<Permiso, Lectura>> = {};

  const noLeer = sesion === "wayland" ? NO_LEE_LINUX_WAYLAND : NO_LEE_LINUX_X11;

  for (const permiso of Object.keys(PERMISOS_LECTURA_LINUX) as Permiso[]) {
    if (noLeer.includes(permiso)) {
      resultado[permiso] = lecturaNoDisponible();
      continue;
    }

    const clave = PERMISOS_LECTURA_LINUX[permiso];

    if (!clave) {
      if (permiso === "bluetooth") {
        if (fuente.bluetooth_estado === "activo") {
          resultado[permiso] = crearLectura(true);
        } else if (fuente.bluetooth_estado === "sin-servicio") {
          resultado[permiso] = lecturaNoDisponible();
        } else {
          resultado[permiso] = lecturaNoDisponible();
        }
      } else if (permiso === "red-local") {
        if (fuente.firewall_estado === undefined) {
          resultado[permiso] = lecturaNoDisponible();
        } else {
          resultado[permiso] = crearLectura(fuente.firewall_estado);
        }
      } else if (permiso === "arranque") {
        if (fuente.autostart_estado === true) {
          resultado[permiso] = crearLectura(true);
        } else if (fuente.autostart_estado === false) {
          resultado[permiso] = crearLectura(false, true);
        } else {
          resultado[permiso] = lecturaNoDisponible();
        }
      } else if (permiso === "energia") {
        if (fuente.capacidad_estado?.bateria !== undefined) {
          resultado[permiso] = crearLectura(true);
        } else {
          resultado[permiso] = lecturaNoDisponible();
        }
      } else {
        resultado[permiso] = lecturaNoDisponible();
      }
      continue;
    }

    const permisoEstado = fuente.permisos?.[clave];
    if (!permisoEstado) {
      resultado[permiso] = lecturaNoDisponible();
      continue;
    }

    if (permisoEstado === "concedido") {
      resultado[permiso] = crearLectura(true);
    } else if (permisoEstado === "denegado") {
      resultado[permiso] = crearLectura(false, true);
    } else if (permisoEstado === "desconocido") {
      resultado[permiso] = lecturaIlegible();
    } else {
      resultado[permiso] = lecturaNoDisponible();
    }
  }

  return resultado;
}

export { leerWindows, leerLinux };