import type { Lectura, Permiso } from "@/lib/permisos/matriz";

export interface FuenteMacos {
  permisos_sistema_estado: Record<string, string>;
  medios_estado: Record<string, string>;
  ble_estado: { radio: string | null | undefined } | null | undefined;
  enlace_wifi_permiso: { permiso: string } | null | undefined;
  fondo_estado: { arranque_con_sistema?: boolean } | null | undefined;
  notificacionesConcedidas: boolean | null | undefined;
}

const PERMISOS_LEER: Partial<Record<Permiso, keyof FuenteMacos["permisos_sistema_estado"]>> = {
  microfono: "microfono",
  camara: "camara",
  ubicacion: "ubicacion",
  bluetooth: null,
  notificaciones: null,
  pantalla: "pantalla",
  accesibilidad: "accesibilidad",
  "monitor-entrada": "monitor-entrada",
  automatizacion: null,
  "red-local": null,
  "entrada-virtual": null,
  energia: null,
  "ubicacion-wifi": "ubicacion-wifi",
  arranque: null,
  "disco-completo": "disco-completo",
};

const ILEGIBLES: Permiso[] = ["red-local", "entrada-virtual", "energia"];

function crearLectura(concedido: boolean, diceDenegado?: boolean, ilegible?: boolean): Lectura {
  return { soportado: true, concedido, diceDenegado, ilegible };
}

function lecturaIlegible(): Lectura {
  return { soportado: true, concedido: false, ilegible: true };
}

function lecturaNoDisponible(): Lectura {
  return { soportado: false, concedido: false };
}

function leerBluetooth(fuente: FuenteMacos): Lectura {
  if (!fuente.ble_estado?.radio) return lecturaNoDisponible();
  if (fuente.ble_estado.radio === "encendida" || fuente.ble_estado.radio === "apagada") {
    return crearLectura(true);
  }
  if (fuente.ble_estado.radio === "sin-permiso") {
    return crearLectura(false, true);
  }
  return lecturaNoDisponible();
}

function leerNotificaciones(fuente: FuenteMacos): Lectura {
  if (fuente.notificacionesConcedidas === true) {
    return crearLectura(true);
  }
  if (fuente.notificacionesConcedidas === false) {
    return crearLectura(false, true);
  }
  return lecturaNoDisponible();
}

function leerArranque(fuente: FuenteMacos): Lectura {
  if (fuente.fondo_estado?.arranque_con_sistema === true) {
    return crearLectura(true);
  }
  if (fuente.fondo_estado?.arranque_con_sistema === false) {
    return crearLectura(false, true);
  }
  return lecturaNoDisponible();
}

function leerDesdeEstadoSistema(fuente: FuenteMacos, permiso: Permiso, clave: string): Lectura | undefined {
  const estado = fuente.permisos_sistema_estado?.[clave];
  if (!estado) return undefined;
  if (estado === "concedido") return crearLectura(true);
  if (estado === "denegado") return crearLectura(false, true);
  if (estado === "sin-preguntar") return undefined;
  if (estado === "no-concedido") return lecturaIlegible();
  if (estado === "desconocido") return lecturaIlegible();
  return undefined;
}

export function leerMacos(fuente: FuenteMacos): Partial<Record<Permiso, Lectura>> {
  const resultado: Partial<Record<Permiso, Lectura>> = {};

  for (const permiso of Object.keys(PERMISOS_LEER) as Permiso[]) {
    if (ILEGIBLES.includes(permiso)) {
      resultado[permiso] = lecturaIlegible();
      continue;
    }

    const clave = PERMISOS_LEER[permiso];
    
    if (!clave) {
      if (permiso === "bluetooth") {
        resultado[permiso] = leerBluetooth(fuente);
      } else if (permiso === "notificaciones") {
        resultado[permiso] = leerNotificaciones(fuente);
      } else if (permiso === "arranque") {
        resultado[permiso] = leerArranque(fuente);
      } else if (permiso === "pantalla") {
        const estado = fuente.medios_estado?.pantalla;
        if (estado) {
          if (estado === "concedido") resultado[permiso] = crearLectura(true);
          else if (estado === "denegado") resultado[permiso] = crearLectura(false, true);
          else resultado[permiso] = lecturaIlegible();
        } else {
          resultado[permiso] = lecturaNoDisponible();
        }
      } else {
        resultado[permiso] = lecturaNoDisponible();
      }
      continue;
    }

    const lectura = leerDesdeEstadoSistema(fuente, permiso, clave);
    if (lectura) {
      resultado[permiso] = lectura;
    } else if (permiso === "pantalla") {
      const estado = fuente.medios_estado?.pantalla;
      if (estado) {
        if (estado === "concedido") resultado[permiso] = crearLectura(true);
        else if (estado === "denegado") resultado[permiso] = crearLectura(false, true);
        else resultado[permiso] = lecturaIlegible();
      } else {
        resultado[permiso] = lecturaNoDisponible();
      }
    } else if (permiso === "disco-completo") {
      resultado[permiso] = lecturaIlegible();
    } else {
      resultado[permiso] = lecturaNoDisponible();
    }
  }

  return resultado;
}