export type MedioId =
  | "web-chromium"
  | "web-firefox"
  | "web-safari"
  | "web-pwa"
  | "tauri-macos"
  | "tauri-windows"
  | "tauri-linux-x11"
  | "tauri-linux-wayland"
  | "tauri-android"
  | "terminal-node"
  | "terminal-bun"
  | "terminal-deno";

export type PermisoId =
  | "microfono"
  | "camara"
  | "pantalla"
  | "ubicacion"
  | "notificaciones"
  | "almacenamiento"
  | "movimiento"
  | "archivos"
  | "bluetooth"
  | "red-local"
  | "accesibilidad"
  | "monitor-entrada"
  | "automatizacion"
  | "disco-completo"
  | "carpetas"
  | "arranque"
  | "superposicion"
  | "no-molestar"
  | "escribir-ajustes"
  | "todos-archivos"
  | "instalar"
  | "bateria"
  | "llamadas"
  | "capacidades";

export type EstadoPermiso =
  | "concedido"
  | "denegado"
  | "preguntar"
  | "no-disponible"
  | "sin-preguntar"
  | "no-concedido"
  | "no-aplica";

export type ComoSeDetecta =
  | "permissions-api"
  | "api-nativa"
  | "portal"
  | "intent"
  | "archivo"
  | "grupos"
  | "no-consultable"
  | "no-se-pide"
  | "declaracion";

export type ComoSePide =
  | "aviso-sistema"
  | "aviso-panel"
  | "solo-panel"
  | "por-uso"
  | "declaracion"
  | "gestor-grupos"
  | "no-se-pide";

export type AccionPermiso = "pedir" | "abrir-ajustes" | "ninguna" | "mostrar-en-lista";

export interface PermisoEnMedio {
  id: PermisoId;
  medio: MedioId;
  comoSeDetecta: ComoSeDetecta;
  comoSePide: ComoSePide;
  tieneEnlaceDirecto: boolean;
  enlaceDirecto?: string;
  distingueFaltaDeDenegado: boolean;
  estadoSiNuncaPregunto: EstadoPermiso;
  estadoSiDenegadoAMano: EstadoPermiso;
  notas?: string;
}

export interface ReglaPeticion {
  permiso: PermisoId;
  medio: MedioId;
  utilidad: "critico" | "util" | "opcional" | "no-aplica";
  orden: number;
  fraseHumana: string;
}

export const MATRIZ_PERMISOS: PermisoEnMedio[] = [
  // --- WEB CHROMIUM (Chrome, Edge, Brave, Opera - desktop y Android) ---
  {
    id: "microfono",
    medio: "web-chromium",
    comoSeDetecta: "permissions-api",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "chrome://settings/content/microphone",
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "preguntar",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "camara",
    medio: "web-chromium",
    comoSeDetecta: "permissions-api",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "chrome://settings/content/camera",
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "preguntar",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "pantalla",
    medio: "web-chromium",
    comoSeDetecta: "no-consultable",
    comoSePide: "por-uso",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "chrome://settings/content/screen-capture",
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "denegado",
    notas: "permissions.query no expone display-capture; solo al usar getDisplayMedia",
  },
  {
    id: "ubicacion",
    medio: "web-chromium",
    comoSeDetecta: "permissions-api",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "chrome://settings/content/location",
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "preguntar",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "notificaciones",
    medio: "web-chromium",
    comoSeDetecta: "permissions-api",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "chrome://settings/content/notifications",
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "preguntar",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "almacenamiento",
    medio: "web-chromium",
    comoSeDetecta: "permissions-api",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "preguntar",
    estadoSiDenegadoAMano: "denegado",
    notas: "navigator.storage.persisted()/persist(); no hay pantalla dedicada",
  },
  {
    id: "movimiento",
    medio: "web-chromium",
    comoSeDetecta: "permissions-api",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "preguntar",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "archivos",
    medio: "web-chromium",
    comoSeDetecta: "permissions-api",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "chrome://settings/content/fileSystem",
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "preguntar",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "bluetooth",
    medio: "web-chromium",
    comoSeDetecta: "no-consultable",
    comoSePide: "por-uso",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "chrome://settings/content/bluetooth",
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "denegado",
    notas: "Web Bluetooth API solo en origins seguros y con gesto",
  },
  {
    id: "red-local",
    medio: "web-chromium",
    comoSeDetecta: "no-consultable",
    comoSePide: "por-uso",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "chrome://settings/content/localNetwork",
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "denegado",
    notas: "macOS 15+; Firewall/privacidad del SO",
  },
  {
    id: "capacidades",
    medio: "web-chromium",
    comoSeDetecta: "api-nativa",
    comoSePide: "no-se-pide",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-aplica",
    estadoSiDenegadoAMano: "no-aplica",
  },

  // --- WEB FIREFOX ---
  {
    id: "microfono",
    medio: "web-firefox",
    comoSeDetecta: "permissions-api",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "about:preferences#privacy",
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "preguntar",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "camara",
    medio: "web-firefox",
    comoSeDetecta: "permissions-api",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "about:preferences#privacy",
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "preguntar",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "pantalla",
    medio: "web-firefox",
    comoSeDetecta: "no-consultable",
    comoSePide: "por-uso",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "about:preferences#privacy",
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "ubicacion",
    medio: "web-firefox",
    comoSeDetecta: "permissions-api",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "about:preferences#privacy",
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "preguntar",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "notificaciones",
    medio: "web-firefox",
    comoSeDetecta: "permissions-api",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "about:preferences#privacy",
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "preguntar",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "almacenamiento",
    medio: "web-firefox",
    comoSeDetecta: "permissions-api",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "preguntar",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "movimiento",
    medio: "web-firefox",
    comoSeDetecta: "no-consultable",
    comoSePide: "no-se-pide",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "no-disponible",
    notas: "Firefox no implementa DeviceMotionEvent.requestPermission",
  },
  {
    id: "archivos",
    medio: "web-firefox",
    comoSeDetecta: "no-consultable",
    comoSePide: "no-se-pide",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "no-disponible",
    notas: "showDirectoryPicker no soportado",
  },
  {
    id: "bluetooth",
    medio: "web-firefox",
    comoSeDetecta: "no-consultable",
    comoSePide: "no-se-pide",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "no-disponible",
    notas: "Web Bluetooth no implementado",
  },
  {
    id: "red-local",
    medio: "web-firefox",
    comoSeDetecta: "no-consultable",
    comoSePide: "por-uso",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "capacidades",
    medio: "web-firefox",
    comoSeDetecta: "api-nativa",
    comoSePide: "no-se-pide",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-aplica",
    estadoSiDenegadoAMano: "no-aplica",
  },

  // --- WEB SAFARI (iOS/macOS) ---
  {
    id: "microfono",
    medio: "web-safari",
    comoSeDetecta: "no-consultable",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "denegado",
    notas: "Safari ≤17 no expone permissions.query para microphone; se detecta por error al usar getUserMedia",
  },
  {
    id: "camara",
    medio: "web-safari",
    comoSeDetecta: "no-consultable",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "pantalla",
    medio: "web-safari",
    comoSeDetecta: "no-consultable",
    comoSePide: "no-se-pide",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "no-disponible",
    notas: "getDisplayMedia no disponible en iOS Safari; en macOS sí pero sin permissions.query",
  },
  {
    id: "ubicacion",
    medio: "web-safari",
    comoSeDetecta: "no-consultable",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "notificaciones",
    medio: "web-safari",
    comoSeDetecta: "permissions-api",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "system-preferences:notifications",
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "preguntar",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "almacenamiento",
    medio: "web-safari",
    comoSeDetecta: "permissions-api",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "preguntar",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "movimiento",
    medio: "web-safari",
    comoSeDetecta: "permissions-api",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "system-preferences:safari",
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "preguntar",
    estadoSiDenegadoAMano: "denegado",
    notas: "DeviceMotionEvent.requestPermission en iOS",
  },
  {
    id: "archivos",
    medio: "web-safari",
    comoSeDetecta: "no-consultable",
    comoSePide: "no-se-pide",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "no-disponible",
    notas: "showDirectoryPicker no soportado",
  },
  {
    id: "bluetooth",
    medio: "web-safari",
    comoSeDetecta: "no-consultable",
    comoSePide: "no-se-pide",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "no-disponible",
  },
  {
    id: "red-local",
    medio: "web-safari",
    comoSeDetecta: "no-consultable",
    comoSePide: "por-uso",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "capacidades",
    medio: "web-safari",
    comoSeDetecta: "api-nativa",
    comoSePide: "no-se-pide",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-aplica",
    estadoSiDenegadoAMano: "no-aplica",
  },

  // --- WEB PWA (standalone) ---
  {
    id: "notificaciones",
    medio: "web-pwa",
    comoSeDetecta: "permissions-api",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "chrome://settings/content/notifications",
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "preguntar",
    estadoSiDenegadoAMano: "denegado",
    notas: "badge y vibrate disponibles",
  },
  {
    id: "almacenamiento",
    medio: "web-pwa",
    comoSeDetecta: "permissions-api",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "preguntar",
    estadoSiDenegadoAMano: "denegado",
    notas: "persist() más fiable; cuota mayor",
  },
  {
    id: "pantalla",
    medio: "web-pwa",
    comoSeDetecta: "no-consultable",
    comoSePide: "por-uso",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "chrome://settings/content/screen-capture",
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "denegado",
    notas: "Disponible en Chrome/Edge desktop; NO en iOS/Safari PWA",
  },
  {
    id: "archivos",
    medio: "web-pwa",
    comoSeDetecta: "permissions-api",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "chrome://settings/content/fileSystem",
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "preguntar",
    estadoSiDenegadoAMano: "denegado",
    notas: "Chrome/Edge sí; Firefox/Safari no",
  },
  {
    id: "bluetooth",
    medio: "web-pwa",
    comoSeDetecta: "no-consultable",
    comoSePide: "por-uso",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "chrome://settings/content/bluetooth",
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "denegado",
    notas: "Chrome/Edge con gesto; Safari/Firefox no",
  },
  {
    id: "arranque",
    medio: "web-pwa",
    comoSeDetecta: "api-nativa",
    comoSePide: "declaracion",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-aplica",
    estadoSiDenegadoAMano: "no-aplica",
    notas: "beforeinstallprompt / appinstalled / launch_handler",
  },

  // --- TAURI macOS ---
  {
    id: "microfono",
    medio: "tauri-macos",
    comoSeDetecta: "api-nativa",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "sin-preguntar",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "camara",
    medio: "tauri-macos",
    comoSeDetecta: "api-nativa",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera",
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "sin-preguntar",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "pantalla",
    medio: "tauri-macos",
    comoSeDetecta: "api-nativa",
    comoSePide: "aviso-panel",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-concedido",
    estadoSiDenegadoAMano: "no-concedido",
    notas: "CGPreflightScreenCaptureAccess devuelve bool; macOS no distingue denegado de nunca preguntado tras el primer aviso",
  },
  {
    id: "ubicacion",
    medio: "tauri-macos",
    comoSeDetecta: "api-nativa",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices",
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "sin-preguntar",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "notificaciones",
    medio: "tauri-macos",
    comoSeDetecta: "api-nativa",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "x-apple.systempreferences:com.apple.preference.notifications",
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "sin-preguntar",
    estadoSiDenegadoAMano: "denegado",
    notas: "Plugin notificaciones: isPermissionGranted() no distingue denied de notDetermined",
  },
  {
    id: "bluetooth",
    medio: "tauri-macos",
    comoSeDetecta: "api-nativa",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "x-apple.systempreferences:com.apple.preference.security?Privacy_Bluetooth",
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "sin-preguntar",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "red-local",
    medio: "tauri-macos",
    comoSeDetecta: "no-consultable",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork",
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "denegado",
    notas: "macOS 15+; no hay API pública de lectura",
  },
  {
    id: "accesibilidad",
    medio: "tauri-macos",
    comoSeDetecta: "api-nativa",
    comoSePide: "aviso-panel",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-concedido",
    estadoSiDenegadoAMano: "no-concedido",
    notas: "AXIsProcessTrusted() no distingue; se trata como 'falta' la 1ª vez y 'denegado' si ya pidió y sigue false",
  },
  {
    id: "monitor-entrada",
    medio: "tauri-macos",
    comoSeDetecta: "api-nativa",
    comoSePide: "aviso-panel",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent",
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "sin-preguntar",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "automatizacion",
    medio: "tauri-macos",
    comoSeDetecta: "api-nativa",
    comoSePide: "por-uso",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation",
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "denegado",
    notas: "Solo se sabe al usarla (AEDeterminePermissionToAutomateTarget)",
  },
  {
    id: "disco-completo",
    medio: "tauri-macos",
    comoSeDetecta: "no-consultable",
    comoSePide: "solo-panel",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "no-disponible",
    notas: "Leer TCC.db prohibido por §1",
  },
  {
    id: "carpetas",
    medio: "tauri-macos",
    comoSeDetecta: "no-consultable",
    comoSePide: "solo-panel",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders",
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "no-disponible",
  },
  {
    id: "arranque",
    medio: "tauri-macos",
    comoSeDetecta: "api-nativa",
    comoSePide: "declaracion",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "x-apple.systempreferences:com.apple.LoginItems-Settings.extension",
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "no-concedido",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "capacidades",
    medio: "tauri-macos",
    comoSeDetecta: "api-nativa",
    comoSePide: "no-se-pide",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-aplica",
    estadoSiDenegadoAMano: "no-aplica",
  },

  // --- TAURI Windows ---
  {
    id: "microfono",
    medio: "tauri-windows",
    comoSeDetecta: "no-consultable",
    comoSePide: "por-uso",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "ms-settings:privacy-microphone",
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "camara",
    medio: "tauri-windows",
    comoSeDetecta: "no-consultable",
    comoSePide: "por-uso",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "ms-settings:privacy-webcam",
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "ubicacion",
    medio: "tauri-windows",
    comoSeDetecta: "no-consultable",
    comoSePide: "por-uso",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "ms-settings:privacy-location",
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "notificaciones",
    medio: "tauri-windows",
    comoSeDetecta: "no-consultable",
    comoSePide: "no-se-pide",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "ms-settings:notifications",
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "concedido",
    estadoSiDenegadoAMano: "denegado",
    notas: "Activadas por defecto en apps de escritorio",
  },
  {
    id: "pantalla",
    medio: "tauri-windows",
    comoSeDetecta: "no-se-pide",
    comoSePide: "no-se-pide",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-aplica",
    estadoSiDenegadoAMano: "no-aplica",
  },
  {
    id: "accesibilidad",
    medio: "tauri-windows",
    comoSeDetecta: "no-se-pide",
    comoSePide: "no-se-pide",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-aplica",
    estadoSiDenegadoAMano: "no-aplica",
    notas: "SendInput funciona salvo UIPI (ventanas elevadas)",
  },
  {
    id: "bluetooth",
    medio: "tauri-windows",
    comoSeDetecta: "api-nativa",
    comoSePide: "no-se-pide",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "ms-settings:bluetooth",
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-aplica",
    estadoSiDenegadoAMano: "no-aplica",
  },
  {
    id: "red-local",
    medio: "tauri-windows",
    comoSeDetecta: "no-consultable",
    comoSePide: "por-uso",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "denegado",
    notas: "Firewall de Windows pregunta la 1ª vez",
  },
  {
    id: "arranque",
    medio: "tauri-windows",
    comoSeDetecta: "api-nativa",
    comoSePide: "declaracion",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "ms-settings:startupapps",
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "no-concedido",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "capacidades",
    medio: "tauri-windows",
    comoSeDetecta: "api-nativa",
    comoSePide: "no-se-pide",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-aplica",
    estadoSiDenegadoAMano: "no-aplica",
  },

  // --- TAURI Linux X11 ---
  {
    id: "pantalla",
    medio: "tauri-linux-x11",
    comoSeDetecta: "no-se-pide",
    comoSePide: "no-se-pide",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-aplica",
    estadoSiDenegadoAMano: "no-aplica",
  },
  {
    id: "accesibilidad",
    medio: "tauri-linux-x11",
    comoSeDetecta: "no-se-pide",
    comoSePide: "no-se-pide",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-aplica",
    estadoSiDenegadoAMano: "no-aplica",
  },
  {
    id: "bluetooth",
    medio: "tauri-linux-x11",
    comoSeDetecta: "api-nativa",
    comoSePide: "no-se-pide",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-aplica",
    estadoSiDenegadoAMano: "no-aplica",
  },
  {
    id: "microfono",
    medio: "tauri-linux-x11",
    comoSeDetecta: "api-nativa",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "denegado",
    notas: "WebKitGTK decide por origen (permisos_medios.rs)",
  },
  {
    id: "camara",
    medio: "tauri-linux-x11",
    comoSeDetecta: "api-nativa",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "notificaciones",
    medio: "tauri-linux-x11",
    comoSeDetecta: "no-se-pide",
    comoSePide: "no-se-pide",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-aplica",
    estadoSiDenegadoAMano: "no-aplica",
  },
  {
    id: "red-local",
    medio: "tauri-linux-x11",
    comoSeDetecta: "no-se-pide",
    comoSePide: "no-se-pide",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-aplica",
    estadoSiDenegadoAMano: "no-aplica",
  },
  {
    id: "arranque",
    medio: "tauri-linux-x11",
    comoSeDetecta: "archivo",
    comoSePide: "declaracion",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "no-concedido",
    estadoSiDenegadoAMano: "denegado",
    notas: "Archivo .desktop en ~/.config/autostart",
  },
  {
    id: "capacidades",
    medio: "tauri-linux-x11",
    comoSeDetecta: "api-nativa",
    comoSePide: "no-se-pide",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-aplica",
    estadoSiDenegadoAMano: "no-aplica",
  },

  // --- TAURI Linux Wayland ---
  {
    id: "pantalla",
    medio: "tauri-linux-wayland",
    comoSeDetecta: "portal",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "preguntar",
    estadoSiDenegadoAMano: "denegado",
    notas: "Portal org.freedesktop.portal.ScreenCast con restore token",
  },
  {
    id: "accesibilidad",
    medio: "tauri-linux-wayland",
    comoSeDetecta: "portal",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "preguntar",
    estadoSiDenegadoAMano: "denegado",
    notas: "Portal RemoteDesktop / libei experimental",
  },
  {
    id: "microfono",
    medio: "tauri-linux-wayland",
    comoSeDetecta: "api-nativa",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "denegado",
    notas: "WebKitGTK + PipeWire / portal Camera (Flatpak)",
  },
  {
    id: "camara",
    medio: "tauri-linux-wayland",
    comoSeDetecta: "api-nativa",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "bluetooth",
    medio: "tauri-linux-wayland",
    comoSeDetecta: "api-nativa",
    comoSePide: "no-se-pide",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-aplica",
    estadoSiDenegadoAMano: "no-aplica",
  },
  {
    id: "red-local",
    medio: "tauri-linux-wayland",
    comoSeDetecta: "no-se-pide",
    comoSePide: "no-se-pide",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-aplica",
    estadoSiDenegadoAMano: "no-aplica",
  },
  {
    id: "notificaciones",
    medio: "tauri-linux-wayland",
    comoSeDetecta: "no-se-pide",
    comoSePide: "no-se-pide",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-aplica",
    estadoSiDenegadoAMano: "no-aplica",
  },
  {
    id: "arranque",
    medio: "tauri-linux-wayland",
    comoSeDetecta: "archivo",
    comoSePide: "declaracion",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "no-concedido",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "capacidades",
    medio: "tauri-linux-wayland",
    comoSeDetecta: "api-nativa",
    comoSePide: "no-se-pide",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-aplica",
    estadoSiDenegadoAMano: "no-aplica",
  },

  // --- TAURI Android ---
  {
    id: "microfono",
    medio: "tauri-android",
    comoSeDetecta: "api-nativa",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "sin-preguntar",
    estadoSiDenegadoAMano: "denegado",
    notas: "2 negativas = ya no pregunta (ficha de la app)",
  },
  {
    id: "camara",
    medio: "tauri-android",
    comoSeDetecta: "api-nativa",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "sin-preguntar",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "ubicacion",
    medio: "tauri-android",
    comoSeDetecta: "api-nativa",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "sin-preguntar",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "notificaciones",
    medio: "tauri-android",
    comoSeDetecta: "api-nativa",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "ACTION_APP_NOTIFICATION_SETTINGS",
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "sin-preguntar",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "bluetooth",
    medio: "tauri-android",
    comoSeDetecta: "api-nativa",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "sin-preguntar",
    estadoSiDenegadoAMano: "denegado",
    notas: "BLUETOOTH_SCAN/CONNECT/ADVERTISE + NEARBY_WIFI_DEVICES (13+)",
  },
  {
    id: "pantalla",
    medio: "tauri-android",
    comoSeDetecta: "no-consultable",
    comoSePide: "por-uso",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "denegado",
    notas: "MediaProjection: createScreenCaptureIntent() cada sesión; 14+ token 1 uso",
  },
  {
    id: "accesibilidad",
    medio: "tauri-android",
    comoSeDetecta: "api-nativa",
    comoSePide: "solo-panel",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-concedido",
    estadoSiDenegadoAMano: "no-concedido",
    notas: "ACTION_ACCESSIBILITY_SETTINGS; 13+ exige 'Permitir ajustes restringidos'",
  },
  {
    id: "superposicion",
    medio: "tauri-android",
    comoSeDetecta: "api-nativa",
    comoSePide: "solo-panel",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "ACTION_MANAGE_OVERLAY_PERMISSION",
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-concedido",
    estadoSiDenegadoAMano: "no-concedido",
  },
  {
    id: "no-molestar",
    medio: "tauri-android",
    comoSeDetecta: "api-nativa",
    comoSePide: "solo-panel",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-concedido",
    estadoSiDenegadoAMano: "no-concedido",
  },
  {
    id: "escribir-ajustes",
    medio: "tauri-android",
    comoSeDetecta: "api-nativa",
    comoSePide: "solo-panel",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "ACTION_MANAGE_WRITE_SETTINGS",
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-concedido",
    estadoSiDenegadoAMano: "no-concedido",
  },
  {
    id: "todos-archivos",
    medio: "tauri-android",
    comoSeDetecta: "api-nativa",
    comoSePide: "solo-panel",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION",
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-concedido",
    estadoSiDenegadoAMano: "no-concedido",
  },
  {
    id: "instalar",
    medio: "tauri-android",
    comoSeDetecta: "api-nativa",
    comoSePide: "solo-panel",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "ACTION_MANAGE_UNKNOWN_APP_SOURCES",
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-concedido",
    estadoSiDenegadoAMano: "no-concedido",
  },
  {
    id: "bateria",
    medio: "tauri-android",
    comoSeDetecta: "api-nativa",
    comoSePide: "aviso-sistema",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "sin-preguntar",
    estadoSiDenegadoAMano: "denegado",
    notas: "Diálogo del sistema 1 vez",
  },
  {
    id: "llamadas",
    medio: "tauri-android",
    comoSeDetecta: "api-nativa",
    comoSePide: "solo-panel",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT",
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-concedido",
    estadoSiDenegadoAMano: "no-concedido",
    notas: "Android 14+",
  },
  {
    id: "arranque",
    medio: "tauri-android",
    comoSeDetecta: "declaracion",
    comoSePide: "declaracion",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: true,
    estadoSiNuncaPregunto: "no-concedido",
    estadoSiDenegadoAMano: "denegado",
  },
  {
    id: "capacidades",
    medio: "tauri-android",
    comoSeDetecta: "api-nativa",
    comoSePide: "no-se-pide",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-aplica",
    estadoSiDenegadoAMano: "no-aplica",
  },

  // --- TERMINAL (Node/Bun/Deno) ---
  {
    id: "accesibilidad",
    medio: "terminal-node",
    comoSeDetecta: "api-nativa",
    comoSePide: "aviso-panel",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-concedido",
    estadoSiDenegadoAMano: "no-concedido",
    notas: "Solo macOS; si el script usa enigo/xcap",
  },
  {
    id: "pantalla",
    medio: "terminal-node",
    comoSeDetecta: "api-nativa",
    comoSePide: "aviso-panel",
    tieneEnlaceDirecto: true,
    enlaceDirecto: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-concedido",
    estadoSiDenegadoAMano: "no-concedido",
    notas: "Solo macOS; para captura de pantalla en scripts",
  },
  {
    id: "archivos",
    medio: "terminal-node",
    comoSeDetecta: "api-nativa",
    comoSePide: "no-se-pide",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-aplica",
    estadoSiDenegadoAMano: "no-aplica",
    notas: "Permisos POSIX (usuario/grupos)",
  },
  {
    id: "red-local",
    medio: "terminal-node",
    comoSeDetecta: "no-consultable",
    comoSePide: "por-uso",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "denegado",
    notas: "Firewall del SO",
  },
  {
    id: "bluetooth",
    medio: "terminal-node",
    comoSeDetecta: "api-nativa",
    comoSePide: "gestor-grupos",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-disponible",
    estadoSiDenegadoAMano: "no-disponible",
    notas: "Grupos dialout/plugdev, udev rules; permisos_sistema.rs › evaluar_linux",
  },
  {
    id: "capacidades",
    medio: "terminal-node",
    comoSeDetecta: "api-nativa",
    comoSePide: "no-se-pide",
    tieneEnlaceDirecto: false,
    distingueFaltaDeDenegado: false,
    estadoSiNuncaPregunto: "no-aplica",
    estadoSiDenegadoAMano: "no-aplica",
  },
];

export const REGLAS_PETICION: ReglaPeticion[] = [
  // Web Chromium - críticos al instalar
  { permiso: "microfono", medio: "web-chromium", utilidad: "critico", orden: 1, fraseHumana: "Para llamadas y comandos de voz, StarSeed OS necesita acceso al micrófono." },
  { permiso: "camara", medio: "web-chromium", utilidad: "critico", orden: 2, fraseHumana: "Para videollamadas y que Astraura pueda verte, StarSeed OS necesita acceso a la cámara." },
  { permiso: "notificaciones", medio: "web-chromium", utilidad: "critico", orden: 3, fraseHumana: "Para avisos de mensajes, alertas de la malla y llamadas entrantes, StarSeed OS necesita mostrar notificaciones." },
  { permiso: "ubicacion", medio: "web-chromium", utilidad: "util", orden: 4, fraseHumana: "Para el mapa del Hub y nombres de Wi-Fi de la malla, StarSeed OS necesita tu ubicación." },
  { permiso: "almacenamiento", medio: "web-chromium", utilidad: "util", orden: 5, fraseHumana: "Para guardar datos offline y que la app funcione sin conexión, StarSeed OS necesita almacenamiento persistente." },
  { permiso: "archivos", medio: "web-chromium", utilidad: "util", orden: 6, fraseHumana: "Para elegir carpetas y sincronizarlas con la malla, StarSeed OS necesita acceso a archivos." },
  { permiso: "movimiento", medio: "web-chromium", utilidad: "opcional", orden: 7, fraseHumana: "Para experiencias XR y brújula, StarSeed OS necesita sensores de movimiento." },
  { permiso: "pantalla", medio: "web-chromium", utilidad: "util", orden: 8, fraseHumana: "Para compartir tu pantalla en llamadas y que Astraura la vea, StarSeed OS necesita permiso de grabación de pantalla." },
  { permiso: "bluetooth", medio: "web-chromium", utilidad: "opcional", orden: 9, fraseHumana: "Para conectar dispositivos Bluetooth y la malla Meshtastic, StarSeed OS necesita Bluetooth." },
  { permiso: "red-local", medio: "web-chromium", utilidad: "util", orden: 10, fraseHumana: "Para descubrir otras neuronas en la red local, StarSeed OS necesita acceso a la red local." },

  // Tauri macOS - críticos al instalar
  { permiso: "microfono", medio: "tauri-macos", utilidad: "critico", orden: 1, fraseHumana: "Para llamadas y comandos de voz, StarSeed OS necesita acceso al micrófono." },
  { permiso: "camara", medio: "tauri-macos", utilidad: "critico", orden: 2, fraseHumana: "Para videollamadas y que Astraura pueda verte, StarSeed OS necesita acceso a la cámara." },
  { permiso: "notificaciones", medio: "tauri-macos", utilidad: "critico", orden: 3, fraseHumana: "Para avisos de mensajes, alertas de la malla y llamadas entrantes, StarSeed OS necesita mostrar notificaciones." },
  { permiso: "pantalla", medio: "tauri-macos", utilidad: "critico", orden: 4, fraseHumana: "Para compartir pantalla, prestar ventana y que Astraura actúe, StarSeed OS necesita permiso de Grabación de pantalla." },
  { permiso: "accesibilidad", medio: "tauri-macos", utilidad: "critico", orden: 5, fraseHumana: "Para prestar ventana, control remoto y que Astraura actúe en el aparato, StarSeed OS necesita Accesibilidad." },
  { permiso: "monitor-entrada", medio: "tauri-macos", utilidad: "critico", orden: 6, fraseHumana: "Para pausar el control remoto si tocas el teclado o ratón, StarSeed OS necesita Monitorización de entrada." },
  { permiso: "ubicacion", medio: "tauri-macos", utilidad: "util", orden: 7, fraseHumana: "Para el mapa del Hub y nombres de Wi-Fi de la malla, StarSeed OS necesita tu ubicación." },
  { permiso: "bluetooth", medio: "tauri-macos", utilidad: "util", orden: 8, fraseHumana: "Para las antenas de la malla y Meshtastic, StarSeed OS necesita Bluetooth." },
  { permiso: "red-local", medio: "tauri-macos", utilidad: "util", orden: 9, fraseHumana: "Para descubrir otras neuronas en la red local, StarSeed OS necesita acceso a la red local." },
  { permiso: "arranque", medio: "tauri-macos", utilidad: "util", orden: 10, fraseHumana: "Para que StarSeed OS esté siempre disponible en segundo plano, necesita abrir al iniciar sesión." },
  { permiso: "disco-completo", medio: "tauri-macos", utilidad: "opcional", orden: 11, fraseHumana: "Para acceder a cualquier archivo sin selector, StarSeed OS necesita Acceso total al disco." },
  { permiso: "automatizacion", medio: "tauri-macos", utilidad: "opcional", orden: 12, fraseHumana: "Para que Astraura maneje otras apps, StarSeed OS necesita Automatización." },
  { permiso: "carpetas", medio: "tauri-macos", utilidad: "opcional", orden: 13, fraseHumana: "Para compartir carpetas específicas (Escritorio, Documentos), StarSeed OS necesita Archivos y carpetas." },

  // Tauri Windows - críticos al instalar
  { permiso: "microfono", medio: "tauri-windows", utilidad: "critico", orden: 1, fraseHumana: "Para llamadas y comandos de voz, StarSeed OS necesita acceso al micrófono." },
  { permiso: "camara", medio: "tauri-windows", utilidad: "critico", orden: 2, fraseHumana: "Para videollamadas y que Astraura pueda verte, StarSeed OS necesita acceso a la cámara." },
  { permiso: "ubicacion", medio: "tauri-windows", utilidad: "util", orden: 3, fraseHumana: "Para el mapa del Hub y nombres de Wi-Fi, StarSeed OS necesita tu ubicación." },
  { permiso: "arranque", medio: "tauri-windows", utilidad: "util", orden: 4, fraseHumana: "Para que StarSeed OS esté siempre disponible, necesita abrir al iniciar sesión." },
  { permiso: "red-local", medio: "tauri-windows", utilidad: "util", orden: 5, fraseHumana: "Para la malla local, StarSeed OS necesita que el Firewall permita conexiones entrantes." },

  // Tauri Linux X11
  { permiso: "microfono", medio: "tauri-linux-x11", utilidad: "critico", orden: 1, fraseHumana: "Para llamadas y comandos de voz, StarSeed OS necesita acceso al micrófono." },
  { permiso: "camara", medio: "tauri-linux-x11", utilidad: "critico", orden: 2, fraseHumana: "Para videollamadas y que Astraura pueda verte, StarSeed OS necesita acceso a la cámara." },
  { permiso: "arranque", medio: "tauri-linux-x11", utilidad: "util", orden: 3, fraseHumana: "Para que StarSeed OS esté siempre disponible, necesita una entrada en ~/.config/autostart." },

  // Tauri Linux Wayland
  { permiso: "microfono", medio: "tauri-linux-wayland", utilidad: "critico", orden: 1, fraseHumana: "Para llamadas y comandos de voz, StarSeed OS necesita acceso al micrófono." },
  { permiso: "camara", medio: "tauri-linux-wayland", utilidad: "critico", orden: 2, fraseHumana: "Para videollamadas y que Astraura pueda verte, StarSeed OS necesita acceso a la cámara." },
  { permiso: "pantalla", medio: "tauri-linux-wayland", utilidad: "critico", orden: 3, fraseHumana: "Para compartir pantalla, StarSeed OS necesita el portal de Wayland." },
  { permiso: "accesibilidad", medio: "tauri-linux-wayland", utilidad: "critico", orden: 4, fraseHumana: "Para control remoto, StarSeed OS necesita el portal de Escritorio remoto." },
  { permiso: "arranque", medio: "tauri-linux-wayland", utilidad: "util", orden: 5, fraseHumana: "Para que StarSeed OS esté siempre disponible, necesita una entrada en ~/.config/autostart." },

  // Tauri Android
  { permiso: "microfono", medio: "tauri-android", utilidad: "critico", orden: 1, fraseHumana: "Para llamadas y comandos de voz, StarSeed OS necesita acceso al micrófono." },
  { permiso: "camara", medio: "tauri-android", utilidad: "critico", orden: 2, fraseHumana: "Para videollamadas y que Astraura pueda verte, StarSeed OS necesita acceso a la cámara." },
  { permiso: "notificaciones", medio: "tauri-android", utilidad: "critico", orden: 3, fraseHumana: "Para avisos de mensajes, alertas de la malla y llamadas, StarSeed OS necesita notificaciones." },
  { permiso: "ubicacion", medio: "tauri-android", utilidad: "util", orden: 4, fraseHumana: "Para el mapa del Hub y nombres de Wi-Fi de la malla, StarSeed OS necesita tu ubicación." },
  { permiso: "bluetooth", medio: "tauri-android", utilidad: "util", orden: 5, fraseHumana: "Para las antenas de la malla y dispositivos cercanos, StarSeed OS necesita Bluetooth." },
  { permiso: "bateria", medio: "tauri-android", utilidad: "critico", orden: 6, fraseHumana: "Para que las antenas y el segundo plano funcionen siempre, StarSeed OS necesita ignorar la optimización de batería." },
  { permiso: "arranque", medio: "tauri-android", utilidad: "util", orden: 7, fraseHumana: "Para que StarSeed OS esté siempre disponible, necesita iniciarse al encender." },
  { permiso: "accesibilidad", medio: "tauri-android", utilidad: "critico", orden: 8, fraseHumana: "Para control remoto entre neuronas, StarSeed OS necesita el servicio de Accesibilidad." },
  { permiso: "superposicion", medio: "tauri-android", utilidad: "critico", orden: 9, fraseHumana: "Para el indicador de control remoto, StarSeed OS necesita mostrar sobre otras apps." },
  { permiso: "pantalla", medio: "tauri-android", utilidad: "util", orden: 10, fraseHumana: "Para compartir pantalla en llamadas, StarSeed OS necesita captura de pantalla (MediaProjection)." },
  { permiso: "todos-archivos", medio: "tauri-android", utilidad: "opcional", orden: 11, fraseHumana: "Para gestionar archivos compartidos con la malla, StarSeed OS necesita acceso a todos los archivos." },
  { permiso: "instalar", medio: "tauri-android", utilidad: "opcional", orden: 12, fraseHumana: "Para instalar actualizaciones y Meshtastic, StarSeed OS necesita instalar apps desconocidas." },

  // Terminal
  { permiso: "accesibilidad", medio: "terminal-node", utilidad: "critico", orden: 1, fraseHumana: "Para control de ventanas y teclado, el script necesita Accesibilidad." },
  { permiso: "pantalla", medio: "terminal-node", utilidad: "critico", orden: 2, fraseHumana: "Para captura de pantalla, el script necesita Grabación de pantalla." },
];

export function obtenerPermisosParaMedio(medio: MedioId): PermisoEnMedio[] {
  return MATRIZ_PERMISOS.filter((p) => p.medio === medio);
}

export function obtenerReglasParaMedio(medio: MedioId): ReglaPeticion[] {
  return REGLAS_PETICION.filter((r) => r.medio === medio).sort((a, b) => a.orden - b.orden);
}

export function buscarPermisoEnMedio(permiso: PermisoId, medio: MedioId): PermisoEnMedio | undefined {
  return MATRIZ_PERMISOS.find((p) => p.id === permiso && p.medio === medio);
}

export function distinguirFaltaDeDenegado(permiso: PermisoId, medio: MedioId): boolean {
  const entrada = buscarPermisoEnMedio(permiso, medio);
  return entrada?.distingueFaltaDeDenegado ?? false;
}

export function estadoSiNuncaPregunto(permiso: PermisoId, medio: MedioId): EstadoPermiso {
  const entrada = buscarPermisoEnMedio(permiso, medio);
  return entrada?.estadoSiNuncaPregunto ?? "no-disponible";
}

export function estadoSiDenegadoAMano(permiso: PermisoId, medio: MedioId): EstadoPermiso {
  const entrada = buscarPermisoEnMedio(permiso, medio);
  return entrada?.estadoSiDenegadoAMano ?? "denegado";
}

export function tieneEnlaceDirecto(permiso: PermisoId, medio: MedioId): boolean {
  const entrada = buscarPermisoEnMedio(permiso, medio);
  return entrada?.tieneEnlaceDirecto ?? false;
}

export function obtenerEnlaceDirecto(permiso: PermisoId, medio: MedioId): string | undefined {
  const entrada = buscarPermisoEnMedio(permiso, medio);
  return entrada?.enlaceDirecto;
}

export function accionParaEstado(estado: EstadoPermiso, distingue: boolean): AccionPermiso {
  if (estado === "concedido") return "ninguna";
  if (estado === "denegado") return distingue ? "abrir-ajustes" : "mostrar-en-lista";
  if (estado === "no-disponible" || estado === "no-aplica") return "ninguna";
  return "pedir";
}

export interface DecisionPermiso {
  permiso: PermisoId;
  medio: MedioId;
  estadoActual: EstadoPermiso;
  accion: AccionPermiso;
  fraseHumana?: string;
  enlaceDirecto?: string;
}

export function decidirAccion(
  permiso: PermisoId,
  medio: MedioId,
  estadoActual: EstadoPermiso
): DecisionPermiso {
  const distingue = distinguirFaltaDeDenegado(permiso, medio);
  const accion = accionParaEstado(estadoActual, distingue);
  const regla = REGLAS_PETICION.find((r) => r.permiso === permiso && r.medio === medio);
  return {
    permiso,
    medio,
    estadoActual,
    accion,
    fraseHumana: accion === "pedir" ? regla?.fraseHumana : undefined,
    enlaceDirecto: (accion === "abrir-ajustes" || accion === "mostrar-en-lista") && tieneEnlaceDirecto(permiso, medio)
      ? obtenerEnlaceDirecto(permiso, medio)
      : undefined,
  };
}

export function permisosCriticosParaMedio(medio: MedioId): PermisoId[] {
  return obtenerReglasParaMedio(medio)
    .filter((r) => r.utilidad === "critico")
    .map((r) => r.permiso);
}

export function permisosUtilesParaMedio(medio: MedioId): PermisoId[] {
  return obtenerReglasParaMedio(medio)
    .filter((r) => r.utilidad === "critico" || r.utilidad === "util")
    .map((r) => r.permiso);
}

export function detectarMedioActual(): MedioId {
  if (typeof navigator === "undefined") return "terminal-node";
  if (typeof window === "undefined") return "terminal-node";

  const ua = navigator.userAgent.toLowerCase();
  const isTauri = "__TAURI__" in window;
  const isPWA = window.matchMedia("(display-mode: standalone)").matches;

  if (isTauri) {
    const platform = (navigator as any).platform?.toLowerCase() || "";
    if (platform.includes("mac")) return "tauri-macos";
    if (platform.includes("win")) return "tauri-windows";
    if (platform.includes("linux")) {
      const session = (window as any).__STARSEED_LINUX_SESSION__ || "x11";
      return session === "wayland" ? "tauri-linux-wayland" : "tauri-linux-x11";
    }
    if (ua.includes("android")) return "tauri-android";
    return "tauri-linux-x11";
  }

  if (isPWA) return "web-pwa";

  if (ua.includes("edg") || ua.includes("chrome") || ua.includes("crios") || ua.includes("brave") || ua.includes("opera") || ua.includes("opr")) {
    return "web-chromium";
  }
  if (ua.includes("firefox") || ua.includes("fxios")) {
    return "web-firefox";
  }
  if (ua.includes("safari") && !ua.includes("chrome")) {
    return "web-safari";
  }

  return "web-chromium";
}