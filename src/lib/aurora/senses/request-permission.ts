"use client";

/**
 * StarSeed OS — Solicitud REAL de permisos del dispositivo (Adenda 180).
 * ----------------------------------------------------------------------------
 * La Bienvenida activaba los sentidos/herramientas guardando SOLO un flag, sin
 * pedir nunca el permiso real del navegador → «algunos no se solicitan» y «el de
 * archivos no funciona». Este helper hace la petición REAL, en el GESTO del
 * usuario, y es HONESTO por navegador/SO: si una capacidad no existe aquí
 * (p.ej. File System Access en Safari/Firefox), lo dice con su alternativa.
 *
 * Acceso COMPLETO al dispositivo (todo el disco, todos los SO) NO es posible
 * desde una página web (sandbox del navegador): eso vive en el backend soberano
 * de la neurona (`/api/system/fs`, `/api/storage/devices`) o la app nativa.
 */

export type PermisoDispositivo =
  | "microfono" | "camara" | "ubicacion"
  | "notificaciones" | "almacenamiento" | "movimiento" | "archivos";

export interface ResultadoPermiso {
  permiso: PermisoDispositivo;
  soportado: boolean;
  concedido: boolean;
  motivo?: string;
}

const hayWin = typeof window !== "undefined";
const nav = (): Navigator | null => (hayWin ? window.navigator : null);

async function pedirMedia(constraints: MediaStreamConstraints, permiso: PermisoDispositivo): Promise<ResultadoPermiso> {
  const n = nav();
  if (!n?.mediaDevices?.getUserMedia) return { permiso, soportado: false, concedido: false, motivo: "Este navegador no expone la cámara/micrófono." };
  try {
    const stream = await n.mediaDevices.getUserMedia(constraints);
    stream.getTracks().forEach((t) => t.stop()); // solo pedir el permiso, no retener el dispositivo
    return { permiso, soportado: true, concedido: true };
  } catch (e) {
    return { permiso, soportado: true, concedido: false, motivo: e instanceof Error ? e.message : "denegado" };
  }
}

/** Solicita UN permiso real del dispositivo, con el gesto del usuario. Nunca lanza. */
export async function requestDevicePermission(permiso: PermisoDispositivo): Promise<ResultadoPermiso> {
  const n = nav();
  if (!n) return { permiso, soportado: false, concedido: false, motivo: "Sin navegador (SSR)." };
  try {
    switch (permiso) {
      case "microfono": return await pedirMedia({ audio: true }, permiso);
      case "camara":    return await pedirMedia({ video: true }, permiso);
      case "ubicacion": {
        if (!("geolocation" in n)) return { permiso, soportado: false, concedido: false, motivo: "Sin geolocalización." };
        return await new Promise<ResultadoPermiso>((res) => {
          n.geolocation.getCurrentPosition(
            () => res({ permiso, soportado: true, concedido: true }),
            (err) => res({ permiso, soportado: true, concedido: false, motivo: err.message }),
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
          );
        });
      }
      case "notificaciones": {
        if (!("Notification" in window)) return { permiso, soportado: false, concedido: false, motivo: "Sin API de notificaciones." };
        const r = await Notification.requestPermission();
        return { permiso, soportado: true, concedido: r === "granted", motivo: r !== "granted" ? r : undefined };
      }
      case "almacenamiento": {
        if (!n.storage?.persist) return { permiso, soportado: false, concedido: false, motivo: "Sin Storage API persistente." };
        const ok = await n.storage.persist();
        return { permiso, soportado: true, concedido: ok, motivo: ok ? undefined : "el navegador no fijó persistencia" };
      }
      case "movimiento": {
        // iOS Safari exige gesto + requestPermission; el resto concede implícitamente.
        const D = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
        if (D?.requestPermission) {
          const r = await D.requestPermission();
          return { permiso, soportado: true, concedido: r === "granted", motivo: r !== "granted" ? r : undefined };
        }
        return { permiso, soportado: "DeviceMotionEvent" in window, concedido: "DeviceMotionEvent" in window };
      }
      case "archivos": {
        // File System Access (Chromium). En Safari/Firefox NO existe → se indica
        // el respaldo (subir carpeta con <input webkitdirectory>) y, para acceso
        // COMPLETO, el backend soberano de la neurona.
        if (!("showDirectoryPicker" in window)) {
          return { permiso, soportado: false, concedido: false, motivo: "Este navegador no soporta abrir carpetas. Usa «subir carpeta», o el backend de la neurona para acceso completo." };
        }
        try {
          await (window as unknown as { showDirectoryPicker: (o?: unknown) => Promise<unknown> }).showDirectoryPicker({ mode: "readwrite" });
          return { permiso, soportado: true, concedido: true };
        } catch (e) {
          return { permiso, soportado: true, concedido: false, motivo: e instanceof Error ? e.message : "cancelado" };
        }
      }
    }
  } catch (e) {
    return { permiso, soportado: true, concedido: false, motivo: e instanceof Error ? e.message : "error" };
  }
  return { permiso, soportado: false, concedido: false, motivo: "permiso desconocido" };
}

/** Mapa sentido/herramienta → permiso real (los que no aparecen no piden permiso del SO). */
export const SENSE_PERMISSION: Record<string, PermisoDispositivo> = {
  escucha: "microfono",
  vision: "camara",
};
export const TOOL_PERMISSION: Record<string, PermisoDispositivo> = {
  files: "archivos",
  ubicacion: "ubicacion",
  location: "ubicacion",
  sensors: "movimiento",
  notifications: "notificaciones",
};
