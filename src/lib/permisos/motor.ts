"use client";

import {
  type EstadoPermiso,
  type PermisoDispositivo,
  type PermisoOS,
  type ResultadoPermiso,
  type ResultadoPermisoOS,
  EVENTO_PERMISO,
  normalizarEstado,
  estadoDeResultado,
} from "./tipos";

const hayWin = typeof window !== "undefined";
const nav = () => (hayWin ? window.navigator : null);

export async function solicitarMedios(constraints: MediaStreamConstraints, md?: MediaDevices | null) {
  const d = md ?? nav()?.mediaDevices ?? null;
  if (!d?.getUserMedia) throw Object.assign(new Error("Este navegador no expone la cámara/micrófono."), { name: "NoMediaDevices" });
  return d.getUserMedia(constraints);
}

export async function solicitarPantalla(opciones?: DisplayMediaStreamOptions, md?: MediaDevices | null) {
  const d = (md ?? nav()?.mediaDevices ?? null) as MediaDevices & { getDisplayMedia?: (o?: DisplayMediaStreamOptions) => Promise<MediaStream> } | null;
  if (!d?.getDisplayMedia) throw Object.assign(new Error("Este navegador no permite compartir la pantalla."), { name: "NoMediaDevices" });
  return d.getDisplayMedia(opciones);
}

async function pedirMedia(constraints: MediaStreamConstraints, permiso: PermisoDispositivo): Promise<ResultadoPermiso> {
  try {
    const stream = await solicitarMedios(constraints);
    stream.getTracks().forEach(t => t.stop());
    return { permiso, soportado: true, concedido: true };
  } catch (e) {
    const ne = e instanceof Error ? e.name : undefined;
    return { permiso, soportado: ne !== "NoMediaDevices", concedido: false, motivo: e instanceof Error ? e.message : "denegado", nombreError: ne };
  }
}

async function pedirPermisoReal(permiso: PermisoDispositivo): Promise<ResultadoPermiso> {
  const n = nav();
  if (!n) return { permiso, soportado: false, concedido: false, motivo: "Sin navegador (SSR)." };
  try {
    switch (permiso) {
      case "microfono": return await pedirMedia({ audio: true }, permiso);
      case "camara": return await pedirMedia({ video: true }, permiso);
      case "ubicacion": {
        if (!("geolocation" in n)) return { permiso, soportado: false, concedido: false, motivo: "Sin geolocalización." };
        return await new Promise<ResultadoPermiso>(res => n.geolocation.getCurrentPosition(
          () => res({ permiso, soportado: true, concedido: true }),
          err => res({ permiso, soportado: true, concedido: false, motivo: err.message }),
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
        ));
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
        const D = (window as any).DeviceMotionEvent;
        if (D?.requestPermission) { const r = await D.requestPermission(); return { permiso, soportado: true, concedido: r === "granted", motivo: r !== "granted" ? r : undefined }; }
        return { permiso, soportado: "DeviceMotionEvent" in window, concedido: "DeviceMotionEvent" in window };
      }
      case "archivos": {
        if (!("showDirectoryPicker" in window)) return { permiso, soportado: false, concedido: false, motivo: "Este navegador no soporta abrir carpetas. Usa «subir carpeta», o el backend de la neurona para acceso completo." };
        try { await (window as any).showDirectoryPicker({ mode: "readwrite" }); return { permiso, soportado: true, concedido: true }; }
        catch (e) { return { permiso, soportado: true, concedido: false, motivo: e instanceof Error ? e.message : "cancelado", nombreError: e instanceof Error ? e.name : undefined }; }
      }
    }
  } catch (e) {
    return { permiso, soportado: true, concedido: false, motivo: e instanceof Error ? e.message : "error", nombreError: e instanceof Error ? e.name : undefined };
  }
  return { permiso, soportado: false, concedido: false, motivo: "permiso desconocido" };
}

export async function requestDevicePermission(permiso: PermisoDispositivo): Promise<ResultadoPermiso> {
  const res = await pedirPermisoReal(permiso);
  try { window.dispatchEvent(new CustomEvent(EVENTO_PERMISO, { detail: res })); } catch {}
  return res;
}

const QUERY_NAME: Partial<Record<PermisoDispositivo, string>> = { microfono: "microphone", camara: "camera", ubicacion: "geolocation", notificaciones: "notifications" };

export async function estadoPermiso(permiso: PermisoDispositivo): Promise<"granted" | "denied" | "prompt" | "unsupported"> {
  if (!hayWin) return "unsupported";
  try {
    if (permiso === "notificaciones" && "Notification" in window) { const p = Notification.permission; return p === "granted" ? "granted" : p === "denied" ? "denied" : "prompt"; }
    if (permiso === "almacenamiento") { if (!navigator.storage?.persisted) return "unsupported"; return (await navigator.storage.persisted()) ? "granted" : "prompt"; }
    if (permiso === "movimiento") { const D = (window as any).DeviceMotionEvent; if (!D) return "unsupported"; return typeof D.requestPermission === "function" ? "prompt" : "granted"; }
    if (permiso === "archivos") return "showDirectoryPicker" in window ? "prompt" : "unsupported";
    if ((permiso === "microfono" || permiso === "camara") && !navigator.mediaDevices?.getUserMedia) return "unsupported";
    const name = QUERY_NAME[permiso];
    const perms = (navigator as any).permissions;
    if (!name || !perms?.query) return "unsupported";
    const st = await perms.query({ name: name as PermissionName });
    return (st.state as "granted" | "denied" | "prompt" | "unsupported") ?? "prompt";
  } catch { return "unsupported"; }
}

export async function consultarPermiso(id: PermisoDispositivo): Promise<EstadoPermiso> {
  return normalizarEstado(await estadoPermiso(id));
}

export async function pedirPermiso(id: PermisoDispositivo): Promise<ResultadoPermisoOS> {
  const r = await requestDevicePermission(id);
  return { id, estado: estadoDeResultado(r), motivo: r.motivo };
}