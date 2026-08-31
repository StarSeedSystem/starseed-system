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

/** Petición interna real (sin notificar). Nunca lanza. */
async function pedirPermisoReal(permiso: PermisoDispositivo): Promise<ResultadoPermiso> {
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

// ════════════════════════════════════════════════════════════════════════════
// (Adenda 192) Estado VIVO + guía accionable de permisos, para TODOS los medios
// ----------------------------------------------------------------------------
// Verdad técnica que la UI debe contar: una página web SOLO puede disparar el
// diálogo del navegador. Si el sitio quedó BLOQUEADO (se denegó una vez), el
// navegador deniega EN SILENCIO sin volver a preguntar → parecía «no funciona».
// En visores embebidos (Claude/Electron/Tauri) el diálogo ni existe, y en un
// origen http:// no seguro el navegador ni expone micrófono/cámara. Este bloque
// añade lo que faltaba para que CUALQUIER superficie (Bienvenida, Ajustes,
// Sentidos, cada área que use un acceso) sea honesta y accionable:
//   · estadoPermiso()            — estado real SIN pedir (permissions.query & cía).
//   · suscribirPermiso()         — cambios en vivo (onchange + evento starseed:permiso).
//   · entornoPermisos()          — visor embebido, origen seguro, navegador y SO.
//   · ayudaPermiso()             — pasos EXACTOS por navegador/SO para desbloquear.
//   · pedirPermisosEnSecuencia() — prompts de uno en uno (regla del navegador).
//   · abrirEnNavegadorSistema()  — escape del visor embebido.

export type EstadoPermisoDispositivo = "granted" | "denied" | "prompt" | "unsupported";

/** Evento window que se emite tras CADA petición real (detail: ResultadoPermiso). */
export const EVENTO_PERMISO = "starseed:permiso";

/** Solicita UN permiso real del dispositivo, con el gesto del usuario. Nunca
 * lanza. Emite `starseed:permiso` para que todos los paneles montados se
 * actualicen en vivo (Bienvenida, Ajustes, Sentidos, áreas de uso). */
export async function requestDevicePermission(permiso: PermisoDispositivo): Promise<ResultadoPermiso> {
  const res = await pedirPermisoReal(permiso);
  try { window.dispatchEvent(new CustomEvent(EVENTO_PERMISO, { detail: res })); } catch { /* SSR */ }
  return res;
}

const QUERY_NAME: Partial<Record<PermisoDispositivo, string>> = {
  microfono: "microphone",
  camara: "camera",
  ubicacion: "geolocation",
  notificaciones: "notifications",
};

/** Estado real del permiso SIN disparar ningún diálogo. */
export async function estadoPermiso(permiso: PermisoDispositivo): Promise<EstadoPermisoDispositivo> {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "unsupported";
  try {
    if (permiso === "notificaciones" && "Notification" in window) {
      const p = Notification.permission;
      return p === "granted" ? "granted" : p === "denied" ? "denied" : "prompt";
    }
    if (permiso === "almacenamiento") {
      if (!navigator.storage?.persisted) return "unsupported";
      return (await navigator.storage.persisted()) ? "granted" : "prompt";
    }
    if (permiso === "movimiento") {
      const D = (window as unknown as { DeviceMotionEvent?: { requestPermission?: unknown } }).DeviceMotionEvent;
      if (!D) return "unsupported";
      return typeof D.requestPermission === "function" ? "prompt" : "granted";
    }
    if (permiso === "archivos") return "showDirectoryPicker" in window ? "prompt" : "unsupported";
    if ((permiso === "microfono" || permiso === "camara") && !navigator.mediaDevices?.getUserMedia) {
      return "unsupported"; // origen no seguro u navegador sin la API
    }
    const name = QUERY_NAME[permiso];
    const perms = (navigator as Navigator & { permissions?: { query: (d: { name: PermissionName }) => Promise<PermissionStatus> } }).permissions;
    if (!name || !perms?.query) return "unsupported";
    const st = await perms.query({ name: name as PermissionName });
    return (st.state as EstadoPermisoDispositivo) ?? "prompt";
  } catch {
    return "unsupported";
  }
}

/** Suscribe a cambios del permiso (onchange nativo + evento de peticiones del
 * OS). Devuelve el des-suscriptor. SSR-safe: en servidor no hace nada. */
export function suscribirPermiso(
  permiso: PermisoDispositivo,
  cb: (estado: EstadoPermisoDispositivo) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  let vivo = true;
  let offChange: (() => void) | null = null;
  const onEvento = (e: Event) => {
    const det = (e as CustomEvent<ResultadoPermiso>).detail;
    if (det?.permiso === permiso) void estadoPermiso(permiso).then((s) => { if (vivo) cb(s); });
  };
  window.addEventListener(EVENTO_PERMISO, onEvento);
  const name = QUERY_NAME[permiso];
  const perms = (navigator as Navigator & { permissions?: { query: (d: { name: PermissionName }) => Promise<PermissionStatus> } }).permissions;
  if (name && perms?.query) {
    perms.query({ name: name as PermissionName })
      .then((st) => {
        if (!vivo) return;
        const h = () => cb((st.state as EstadoPermisoDispositivo) ?? "prompt");
        st.addEventListener?.("change", h);
        offChange = () => st.removeEventListener?.("change", h);
      })
      .catch(() => { /* sin onchange nativo aquí; queda el evento del OS */ });
  }
  return () => { vivo = false; window.removeEventListener(EVENTO_PERMISO, onEvento); offChange?.(); };
}

export interface EntornoPermisos {
  /** Nombre del visor embebido que suprime los diálogos de permiso, o null. */
  visor: string | null;
  /** ¿Origen seguro (https o localhost)? Sin él no hay micrófono/cámara. */
  origenSeguro: boolean;
  navegador: "chrome" | "edge" | "safari" | "firefox" | "otro";
  so: "macos" | "windows" | "linux" | "android" | "ios" | "otro";
}

/** Radiografía del medio actual: visor embebido, origen, navegador y SO. */
export function entornoPermisos(): EntornoPermisos {
  if (typeof navigator === "undefined") return { visor: null, origenSeguro: true, navegador: "otro", so: "otro" };
  const ua = navigator.userAgent;
  let visor: string | null = null;
  if (/ Claude\//.test(ua)) visor = "el visor integrado de Claude";
  else if (/ Electron\//.test(ua)) visor = "esta app embebida (Electron)";
  else if (/Tauri\//i.test(ua) || (typeof window !== "undefined" && "__TAURI__" in window)) visor = "la app de escritorio StarSeed";
  const so: EntornoPermisos["so"] = /Android/i.test(ua) ? "android"
    : /iPhone|iPad|iPod/i.test(ua) ? "ios"
    : /Mac/i.test(ua) ? "macos"
    : /Win/i.test(ua) ? "windows"
    : /Linux/i.test(ua) ? "linux" : "otro";
  const navegador: EntornoPermisos["navegador"] = /Edg\//.test(ua) ? "edge"
    : /Chrome\//.test(ua) ? "chrome"
    : /Firefox\//.test(ua) ? "firefox"
    : /Safari\//.test(ua) ? "safari" : "otro";
  const origenSeguro = typeof window !== "undefined" ? window.isSecureContext !== false : true;
  return { visor, origenSeguro, navegador, so };
}

export const NOMBRE_PERMISO: Record<PermisoDispositivo, string> = {
  microfono: "Micrófono", camara: "Cámara", ubicacion: "Ubicación",
  notificaciones: "Notificaciones", almacenamiento: "Almacenamiento persistente",
  movimiento: "Movimiento", archivos: "Archivos (carpetas)",
};

/** Pasos EXACTOS para desbloquear el permiso en ESTE navegador/SO/medio. */
export function ayudaPermiso(permiso: PermisoDispositivo, estado: EstadoPermisoDispositivo): string {
  const ent = entornoPermisos();
  const nombre = NOMBRE_PERMISO[permiso];
  if (ent.visor) {
    return `${ent.visor} no muestra diálogos de permiso del sistema: pulsa «Abrir en tu navegador» y concédelo allí (tu cuenta y su configuración se sincronizan solas).`;
  }
  if (!ent.origenSeguro && (permiso === "microfono" || permiso === "camara")) {
    return "Estás en un origen NO seguro (http://). El navegador solo expone micrófono/cámara en HTTPS o en localhost: abre el OS en https://… o en http://localhost.";
  }
  if (estado === "denied") {
    const base = ent.navegador === "safari"
      ? `Safari ▸ Ajustes ▸ Sitios web ▸ ${nombre} → «Permitir» para este sitio, y recarga.`
      : ent.navegador === "firefox"
        ? `Pulsa el icono de permisos junto al candado (barra de direcciones) → quita el bloqueo de ${nombre.toLowerCase()} y recarga.`
        : `Pulsa el icono a la izquierda de la dirección (candado/ajustes) → «Configuración del sitio» → ${nombre} → «Permitir», y recarga.`;
    const esSensor = permiso === "microfono" || permiso === "camara" || permiso === "ubicacion";
    const sistema = !esSensor ? ""
      : ent.so === "macos" ? ` Si sigue igual, el SISTEMA bloquea a tu navegador: Ajustes del Sistema ▸ Privacidad y seguridad ▸ ${nombre} → activa tu navegador.`
      : ent.so === "windows" ? ` Si sigue igual: Configuración ▸ Privacidad y seguridad ▸ ${nombre} → permite el acceso a las apps de escritorio.`
      : (ent.so === "android" || ent.so === "ios") ? ` Si sigue igual: Ajustes del sistema ▸ Apps ▸ tu navegador ▸ Permisos → ${nombre}.`
      : "";
    return `El navegador tiene BLOQUEADO ${nombre.toLowerCase()} para este sitio y ya no pregunta. ${base}${sistema}`;
  }
  if (estado === "prompt") return "Al pulsar «Permitir», el navegador te lo preguntará: acepta en su diálogo.";
  if (estado === "unsupported") {
    if (permiso === "archivos") return "Este navegador no soporta conectar carpetas (File System Access): usa Chrome/Edge, o adjunta con «subir carpeta» donde aplique.";
    return "No disponible o no consultable en este navegador/medio.";
  }
  return "";
}

/** Pide varios permisos de uno en uno (los navegadores muestran UN prompt a la vez). */
export async function pedirPermisosEnSecuencia(permisos: PermisoDispositivo[]): Promise<ResultadoPermiso[]> {
  const out: ResultadoPermiso[] = [];
  for (const p of permisos) {
    // eslint-disable-next-line no-await-in-loop -- secuencial a propósito
    out.push(await requestDevicePermission(p));
  }
  return out;
}

/** Escape del visor embebido: abre esta misma URL en el navegador del sistema. */
export function abrirEnNavegadorSistema(): void {
  try { window.open(window.location.href, "_blank", "noopener,noreferrer"); } catch { /* visor sin window.open */ }
}
