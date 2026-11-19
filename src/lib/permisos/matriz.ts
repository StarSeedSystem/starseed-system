/**
 * matriz — matriz de permisos × medio de StarSeed OS (PRM1119, 2026-11-19).
 *
 * MÓDULO PURO: la tabla de qué permisos existen en cada medio (sistema operativo + forma de abrir),
 * cómo se detectan, cómo se piden, si hay enlace directo a Ajustes, y cómo distinguir «falta»
 * de «denegado a mano». No pide nada, no guarda nada, no usa red ni disco.
 *
 * Medios (TipoMedio de neuronas/medio.ts):
 *  - app-nativa      → Tauri (macOS, Android, Windows, Linux)
 *  - app-instalada   → PWA instalada (iOS, Android, escritorio)
 *  - navegador       → web normal (cualquier OS con navegador)
 *  - navegador-claude→ navegador integrado de Claude (macOS, Windows, Linux)
 *  - local           → localhost (desarrollo)
 *
 * Sistemas operativos cubiertos: macOS, Android, Windows, Linux (X11/Wayland), iOS, iPadOS.
 * Contextos extra: terminal (CLI), TV, plegables.
 */

import type { TipoMedio } from "@/lib/neurons/medio";

export type SistemaOperativo =
  | "macos"
  | "android"
  | "windows"
  | "linux-x11"
  | "linux-wayland"
  | "ios"
  | "ipados"
  | "desconocido";

export type ContextoExtra = "terminal" | "tv" | "plegable";

export type MedioCompleto = {
  tipo: TipoMedio;
  so: SistemaOperativo;
  contexto?: ContextoExtra;
};

export type IdPermiso =
  | "microfono"
  | "camara"
  | "pantalla"
  | "accesibilidad"
  | "ubicacion"
  | "bluetooth"
  | "red-local"
  | "notificaciones"
  | "segundo-plano"
  | "almacenamiento"
  | "entrada-virtual"
  | "energia"
  | "nfc"
  | "contactos"
  | "calendario"
  | "archivos"
  | "pantalla-completa"
  | "superposicion"
  | "automatizacion"
  | "monitor-entrada"
  | "disco-completo"
  | "carpetas"
  | "arranque"
  | "no-molestar"
  | "escribir-ajustes"
  | "capacidades"
  | "cercanos"
  | "ubicacion-wifi"
  | "llamadas"
  | "bateria"
  | "instalar"
  | "todos-archivos";

export type GrupoPermiso =
  | "audio-video"
  | "pantalla-control"
  | "ubicacion-red"
  | "comunicacion"
  | "segundo-plano"
  | "archivos-almacenamiento"
  | "sistema-dispositivo"
  | "entrada-salida";

export type ComoSePide =
  | "aviso-sistema"
  | "aviso-luego-ajustes"
  | "solo-ajustes"
  | "por-uso"
  | "declaracion-manifiesto"
  | "nada-sistema"
  | "no-aplica";

export type LecturaEstado = "si" | "parcial" | "no" | "no-aplica";

export type EstadoPermiso =
  | "concedido"
  | "denegado"
  | "sin-preguntar"
  | "no-concedido"
  | "desconocido"
  | "no-aplica";

export type AccionPermiso =
  | "pedir"
  | "abrir-ajustes"
  | "por-uso"
  | "nada"
  | "mas-adelante"
  | "listo";

export type NivelEnlace =
  | "directo"
  | "lista"
  | "ficha-app"
  | "aviso-sistema"
  | "sin-enlace"
  | "no-hace-falta";

export interface DefPermisoMedio {
  id: IdPermiso;
  grupo: GrupoPermiso;
  titulo: string;
  porQue: string;
  como: ComoSePide;
  lectura: LecturaEstado;
  fase: number;
  desde: number;
  opcional?: boolean;
  funciones: string[];
  nota?: string;
  /** Enlace a Ajustes en este medio concreto. */
  enlace: EnlacePermiso | null;
  /** Cómo distinguir «falta» (nunca se pidió) de «denegado a mano» en este medio. */
  distinguirFaltaDeDenegado: string;
}

export interface EnlacePermiso {
  nivel: NivelEnlace;
  pantalla: string;
  pulsa: string;
  /** URL scheme o intent si el sistema lo permite (para abrir programáticamente). */
  urlScheme?: string;
}

export interface MatrizPermisoMedio {
  medio: MedioCompleto;
  permisos: DefPermisoMedio[];
}

/** Versión de la matriz (sube cuando se añade/quita un permiso o medio). */
export const VERSION_MATRIZ = 1;

/** Fase actual del contrato (lo de fases posteriores se enseña pero no se pide). */
export const FASE_ACTUAL = 1;

/** Todos los IDs de permiso conocidos. */
export const IDS_PERMISO: readonly IdPermiso[] = [
  "microfono",
  "camara",
  "pantalla",
  "accesibilidad",
  "ubicacion",
  "bluetooth",
  "red-local",
  "notificaciones",
  "segundo-plano",
  "almacenamiento",
  "entrada-virtual",
  "energia",
  "nfc",
  "contactos",
  "calendario",
  "archivos",
  "pantalla-completa",
  "superposicion",
  "automatizacion",
  "monitor-entrada",
  "disco-completo",
  "carpetas",
  "arranque",
  "no-molestar",
  "escribir-ajustes",
  "capacidades",
  "cercanos",
  "ubicacion-wifi",
  "llamadas",
  "bateria",
  "instalar",
  "todos-archivos",
] as const;

/** Orden de grupos para presentación. */
export const ORDEN_GRUPOS: readonly GrupoPermiso[] = [
  "audio-video",
  "pantalla-control",
  "ubicacion-red",
  "comunicacion",
  "segundo-plano",
  "archivos-almacenamiento",
  "sistema-dispositivo",
  "entrada-salida",
] as const;

/** Títulos de grupo. */
export const TITULO_GRUPO: Record<GrupoPermiso, string> = {
  "audio-video": "Audio y vídeo",
  "pantalla-control": "Pantalla y control",
  "ubicacion-red": "Ubicación y red",
  "comunicacion": "Comunicación",
  "segundo-plano": "Segundo plano",
  "archivos-almacenamiento": "Archivos y almacenamiento",
  "sistema-dispositivo": "Sistema y dispositivo",
  "entrada-salida": "Entrada y salida",
};

/**
 * Detecta el medio completo a partir del entorno de ejecución.
 * En el servidor devuelve un medio vacío con so="desconocido".
 */
export function detectarMedio(): MedioCompleto {
  if (typeof window === "undefined") {
    return { tipo: "navegador", so: "desconocido" };
  }

  const ua = navigator.userAgent || "";
  const host = window.location?.host ?? "";
  const w = window as unknown as Record<string, unknown>;
  const tauri = "__TAURI__" in w || "__TAURI_INTERNALS__" in w;

  let standalone = false;
  try {
    standalone =
      window.matchMedia?.("(display-mode: standalone)").matches === true ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
  } catch {
    /* ignore */
  }

  // Tipo de medio
  let tipo: TipoMedio = "navegador";
  if (tauri) tipo = "app-nativa";
  else if (/Electron\//.test(ua) && /Claude/i.test(ua)) tipo = "navegador-claude";
  else if (/Electron\//.test(ua)) tipo = "navegador-claude";
  else if (standalone) tipo = "app-instalada";
  else if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) tipo = "local";

  // Sistema operativo
  let so: SistemaOperativo = "desconocido";
  if (/Macintosh|Mac OS X|iPhone|iPad|iPod/.test(ua)) {
    if (/iPhone/.test(ua)) so = "ios";
    else if (/iPad/.test(ua)) so = "ipados";
    else so = "macos";
  } else if (/Android/.test(ua)) {
    so = "android";
  } else if (/Windows/.test(ua)) {
    so = "windows";
  } else if (/Linux/.test(ua)) {
    // En Linux no podemos saber X11 vs Wayland desde el UA; se detecta en nativo
    so = "linux-x11"; // fallback, el nativo lo corrige
  }

  // Contexto extra
  let contexto: ContextoExtra | undefined;
  if (typeof process !== "undefined" && process.stdout?.isTTY) contexto = "terminal";
  // TV y plegable requieren detección específica (CSS media queries, user agent)

  return { tipo, so, contexto };
}

/**
 * Obtiene la definición de un permiso para un medio concreto.
 * Devuelve null si el permiso no existe en ese medio.
 */
export function defPermisoParaMedio(
  id: IdPermiso,
  medio: MedioCompleto
): DefPermisoMedio | null {
  const matriz = obtenerMatrizParaMedio(medio);
  return matriz.find((p) => p.id === id) ?? null;
}

/**
 * Obtiene todos los permisos aplicables a un medio, ordenados por grupo.
 */
export function permisosParaMedio(medio: MedioCompleto): DefPermisoMedio[] {
  return obtenerMatrizParaMedio(medio);
}

/**
 * Determina la acción a tomar para un permiso dado su estado y si ya se pidió.
 * Regla: al instalar y al abrir, pedir lo que falte y sea útil;
 * si la persona lo denegó a mano, no volver a pedirlo solo,
 * pero mostrarlo en la lista con «Abrir ajustes».
 */
export function accionParaPermiso(
  def: DefPermisoMedio,
  estado: EstadoPermiso | undefined,
  yaPedido: boolean
): AccionPermiso {
  if (def.fase > FASE_ACTUAL) return "mas-adelante";
  if (estado === "concedido" || estado === "no-aplica") return "listo";

  switch (def.como) {
    case "nada-sistema":
    case "declaracion-manifiesto":
      return "nada";
    case "por-uso":
      return "por-uso";
    case "solo-ajustes":
      return "abrir-ajustes";
    case "aviso-luego-ajustes":
      return yaPedido || estado === "denegado" ? "abrir-ajustes" : "pedir";
    case "aviso-sistema":
      return estado === "denegado" ? "abrir-ajustes" : "pedir";
    case "no-aplica":
      return "nada";
    default:
      return "nada";
  }
}

/** ¿Esta acción la puede llevar la lista (pedir o abrir ajustes)? */
export function esAccionable(accion: AccionPermiso): boolean {
  return accion === "pedir" || accion === "abrir-ajustes";
}

/** Texto corto del estado para mostrar en la UI. */
export function textoEstadoPermiso(
  def: DefPermisoMedio,
  estado: EstadoPermiso | undefined,
  accion: AccionPermiso
): string {
  if (accion === "mas-adelante") return `Llega con la fase ${def.fase}: aún no se pide`;
  if (estado === "concedido") return "Concedido";
  if (estado === "no-aplica") return "Este medio no lo pide";
  if (accion === "nada") return "Nada que hacer";
  if (accion === "por-uso") return "El sistema lo pregunta al usarlo";
  if (estado === "denegado") return "Denegado: se cambia en Ajustes";
  if (def.lectura === "no") return "El sistema no deja saber su estado";
  if (estado === undefined || estado === "desconocido") return "Sin dato todavía";
  if (estado === "no-concedido") return "Sin conceder";
  return "Sin preguntar";
}

/** Verifica si el medio tiene permisos pendientes que se deben pedir al abrir. */
export function medioTienePendientes(
  medio: MedioCompleto,
  vistos: readonly IdPermiso[],
  estados: Partial<Record<IdPermiso, EstadoPermiso>>,
  yaPedidos: readonly IdPermiso[]
): boolean {
  return permisosParaMedio(medio).some(
    (d) =>
      esAccionable(accionParaPermiso(d, estados[d.id], yaPedidos.includes(d.id))) &&
      !vistos.includes(d.id)
  );
}

// ============================================================================
// Implementación interna: la matriz por medio
// ============================================================================

function obtenerMatrizParaMedio(medio: MedioCompleto): DefPermisoMedio[] {
  // La matriz base viene del registro de permisos por sistema operativo
  // y se adapta según el tipo de medio (nativo, PWA, web, etc.)
  const base = matrizBaseParaSO(medio.so);

  // Adaptar según el tipo de medio
  return adaptarPorTipoMedio(base, medio);
}

function matrizBaseParaSO(so: SistemaOperativo): DefPermisoMedio[] {
  switch (so) {
    case "macos":
      return matrizMacOS();
    case "android":
      return matrizAndroid();
    case "windows":
      return matrizWindows();
    case "linux-x11":
      return matrizLinuxX11();
    case "linux-wayland":
      return matrizLinuxWayland();
    case "ios":
    case "ipados":
      return matrizIOS();
    default:
      return [];
  }
}

function adaptarPorTipoMedio(
  base: DefPermisoMedio[],
  medio: MedioCompleto
): DefPermisoMedio[] {
  // En PWA y web, algunos permisos nativos no aplican o cambian su forma
  if (medio.tipo === "app-instalada" || medio.tipo === "navegador" || medio.tipo === "navegador-claude") {
    return base.map((p) => adaptarPermisoWeb(p, medio));
  }
  // En app nativa y local, usar la base del SO
  return base;
}

function adaptarPermisoWeb(p: DefPermisoMedio, medio: MedioCompleto): DefPermisoMedio {
  const adaptado = { ...p, enlace: { ...p.enlace } };

  // En web/PWA: pantalla usa getDisplayMedia (por-uso), no hay accesibilidad nativa
  if (p.id === "pantalla") {
    adaptado.como = "por-uso";
    adaptado.lectura = "no";
    adaptado.enlace = {
      nivel: "aviso-sistema",
      pantalla: "Selector de compartición del navegador",
      pulsa: "Elige la pantalla/ventana/pestaña y pulsa «Compartir».",
    };
    adaptado.nota = "El navegador pregunta cada vez; no se puede dar de antemano.";
  }

  if (p.id === "accesibilidad" || p.id === "monitor-entrada" || p.id === "automatizacion") {
    adaptado.como = "no-aplica";
    adaptado.lectura = "no-aplica";
    adaptado.enlace = {
      nivel: "no-hace-falta",
      pantalla: "—",
      pulsa: "La web no tiene acceso a controlar otras apps ni leer entrada global.",
    };
    adaptado.nota = "Solo la app nativa puede pedir esto.";
  }

  if (p.id === "bluetooth") {
    adaptado.como = "por-uso";
    adaptado.lectura = "parcial";
    adaptado.enlace = {
      nivel: "aviso-sistema",
      pantalla: "Aviso de Web Bluetooth",
      pulsa: "Pulsa «Permitir» cuando el navegador lo pida al escanear.",
    };
  }

  if (p.id === "red-local") {
    adaptado.como = "no-aplica";
    adaptado.lectura = "no-aplica";
    adaptado.enlace = {
      nivel: "no-hace-falta",
      pantalla: "—",
      pulsa: "La red local en web va por WebRTC/mDNS; no hay permiso separado.",
    };
  }

  if (p.id === "ubicacion" || p.id === "ubicacion-wifi") {
    adaptado.como = "por-uso";
    adaptado.lectura = "parcial";
    adaptado.enlace = {
      nivel: "aviso-sistema",
      pantalla: "Aviso de geolocalización del navegador",
      pulsa: "Pulsa «Permitir» cuando el navegador lo pida.",
    };
  }

  if (p.id === "notificaciones") {
    adaptado.como = "aviso-sistema";
    adaptado.lectura = "parcial";
    adaptado.enlace = {
      nivel: "aviso-sistema",
      pantalla: "Aviso de notificaciones del navegador",
      pulsa: "Pulsa «Permitir» en el aviso del navegador.",
    };
  }

  if (p.id === "almacenamiento" || p.id === "archivos") {
    adaptado.como = "por-uso";
    adaptado.lectura = "parcial";
    adaptado.enlace = {
      nivel: "aviso-sistema",
      pantalla: "Selector de archivos/carpetas (File System Access API)",
      pulsa: "Elige la carpeta/archivo y pulsa «Permitir».",
    };
  }

  // iOS Safari / PWA: ajustar enlaces
  if (medio.so === "ios" || medio.so === "ipados") {
    adaptado.enlace = ajustarEnlaceIOS(adaptado.id, adaptado.enlace);
  }

  return adaptado;
}

function ajustarEnlaceIOS(id: IdPermiso, enlace: EnlacePermiso | null): EnlacePermiso | null {
  if (!enlace) return null;
  // En iOS, muchos permisos se gestionan en Ajustes > StarSeed OS > Permisos
  if (enlace.nivel === "directo" || enlace.nivel === "lista") {
    return {
      ...enlace,
      nivel: "ficha-app",
      pantalla: "Ajustes > StarSeed OS > Permisos",
      pulsa: `Activa «${id}» en la lista de permisos de la app.`,
    };
  }
  return enlace;
}

// ============================================================================
// Matrices base por sistema operativo (extraídas de permisos-registro.ts y permisos-enlaces.ts)
// ============================================================================

function matrizMacOS(): DefPermisoMedio[] {
  return [
    {
      id: "microfono",
      grupo: "audio-video",
      titulo: "Micrófono",
      porQue: "Solo cuando tú lo pides: llamadas, transmisiones y grabaciones.",
      como: "aviso-sistema",
      lectura: "si",
      fase: 1,
      desde: 1,
      funciones: ["llamadas"],
      nota: "El aviso sale al usar WebKit o la API nativa.",
      enlace: {
        nivel: "directo",
        pantalla: "Ajustes del Sistema > Privacidad y seguridad > Micrófono",
        pulsa: "Activa el interruptor de StarSeed OS.",
        urlScheme: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
      },
      distinguirFaltaDeDenegado:
        "Si `AVCaptureDevice.authorizationStatusForMediaType(.audio)` es `notDetermined` = falta; si es `denied` = denegado a mano.",
    },
    {
      id: "camara",
      grupo: "audio-video",
      titulo: "Cámara",
      porQue: "Solo cuando tú lo pides: videollamadas, transmisiones y grabaciones.",
      como: "aviso-sistema",
      lectura: "si",
      fase: 1,
      desde: 1,
      funciones: ["llamadas"],
      nota: "El aviso sale al usar WebKit o la API nativa.",
      enlace: {
        nivel: "directo",
        pantalla: "Ajustes del Sistema > Privacidad y seguridad > Cámara",
        pulsa: "Activa el interruptor de StarSeed OS.",
        urlScheme: "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera",
      },
      distinguirFaltaDeDenegado:
        "Si `AVCaptureDevice.authorizationStatusForMediaType(.video)` es `notDetermined` = falta; si es `denied` = denegado a mano.",
    },
    {
      id: "pantalla",
      grupo: "pantalla-control",
      titulo: "Grabación de pantalla y audio del sistema",
      porQue: "Para compartir tu pantalla o una ventana en llamadas y salas, prestar una ventana a otra neurona tuya y que Astraura vea lo que le enseñas.",
      como: "aviso-luego-ajustes",
      lectura: "si",
      fase: 1,
      desde: 3,
      opcional: true,
      funciones: ["prestar-ventana", "compartir-pantalla", "astraura-ve", "control-entre-neuronas"],
      nota: "Se activa en Ajustes del Sistema; macOS puede pedir reabrir la app y, desde macOS 15, vuelve a confirmarlo periódicamente.",
      enlace: {
        nivel: "directo",
        pantalla: "Ajustes del Sistema > Privacidad y seguridad > Grabación de pantalla y audio del sistema",
        pulsa: "Activa el interruptor de StarSeed OS y, si macOS lo pide, pulsa «Salir y volver a abrir».",
        urlScheme: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
      },
      distinguirFaltaDeDenegado:
        "Si `CGPreflightScreenCaptureAccess()` devuelve false y `CGRequestScreenCaptureAccess()` no se ha llamado = falta; si la app está en la lista pero el interruptor está apagado = denegado a mano.",
    },
    {
      id: "accesibilidad",
      grupo: "pantalla-control",
      titulo: "Accesibilidad (controlar el aparato)",
      porQue: "Para que tus otras neuronas, y Astraura cuando tú lo permitas, puedan pulsar y escribir aquí. Siempre con aviso visible y un botón para parar.",
      como: "aviso-luego-ajustes",
      lectura: "si",
      fase: 1,
      desde: 3,
      opcional: true,
      funciones: ["prestar-ventana", "control-entre-neuronas", "astraura-actua"],
      nota: "Se activa en Ajustes del Sistema > Privacidad y seguridad > Accesibilidad.",
      enlace: {
        nivel: "directo",
        pantalla: "Ajustes del Sistema > Privacidad y seguridad > Accesibilidad",
        pulsa: "Activa el interruptor de StarSeed OS (te pedirá tu contraseña o Touch ID: eso lo haces tú).",
        urlScheme: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
      },
      distinguirFaltaDeDenegado:
        "Si `AXIsProcessTrusted()` es false y nunca se mostró el prompt = falta; si la app está en la lista pero el interruptor está apagado = denegado a mano.",
    },
    {
      id: "monitor-entrada",
      grupo: "pantalla-control",
      titulo: "Monitorización de entrada",
      porQue: "Para notar que estás usando el teclado o el ratón y pausar al instante cualquier control a distancia.",
      como: "aviso-luego-ajustes",
      lectura: "si",
      fase: 3,
      desde: 3,
      funciones: ["control-entre-neuronas", "astraura-actua"],
      nota: "",
      enlace: {
        nivel: "directo",
        pantalla: "Ajustes del Sistema > Privacidad y seguridad > Monitorización de entrada",
        pulsa: "Activa el interruptor de StarSeed OS.",
        urlScheme: "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent",
      },
      distinguirFaltaDeDenegado:
        "Si `IOHIDCheckAccess` devuelve `kIOHIDAccessTypeUnknown` = falta; si devuelve `kIOHIDAccessTypeDenied` = denegado a mano.",
    },
    {
      id: "automatizacion",
      grupo: "pantalla-control",
      titulo: "Automatización de otras apps",
      porQue: "Para que Astraura pida cosas a otras apps (por ejemplo Música o Finder). El sistema pregunta app por app.",
      como: "por-uso",
      lectura: "no",
      fase: 4,
      desde: 3,
      funciones: ["astraura-actua", "centro-control-nativo"],
      nota: "macOS pregunta app por app la primera vez que se usa.",
      enlace: {
        nivel: "directo",
        pantalla: "Ajustes del Sistema > Privacidad y seguridad > Automatización",
        pulsa: "Se rellena sola la primera vez que StarSeed OS maneja otra app: allí activa la app que quieras.",
        urlScheme: "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation",
      },
      distinguirFaltaDeDenegado:
        "No hay API para leer el estado global; se sabe por app destino. Si `AEDeterminePermissionToAutomateTarget` dice `no` = denegado para esa app; si nunca se intentó = falta.",
    },
    {
      id: "bluetooth",
      grupo: "ubicacion-red",
      titulo: "Bluetooth",
      porQue: "Para hablar directamente con tus otras neuronas cercanas, sin Wi-Fi ni internet.",
      como: "aviso-sistema",
      lectura: "si",
      fase: 1,
      desde: 1,
      funciones: ["malla-radios", "llamadas"],
      nota: "El aviso sale al arrancar CoreBluetooth.",
      enlace: {
        nivel: "directo",
        pantalla: "Ajustes del Sistema > Privacidad y seguridad > Bluetooth",
        pulsa: "Activa el interruptor de StarSeed OS.",
        urlScheme: "x-apple.systempreferences:com.apple.preference.security?Privacy_Bluetooth",
      },
      distinguirFaltaDeDenegado:
        "Si `CBManager.authorization` es `notDetermined` = falta; si es `denied` = denegado a mano.",
    },
    {
      id: "red-local",
      grupo: "ubicacion-red",
      titulo: "Red local",
      porQue: "Para encontrar a tus otras neuronas en esta red, también sin internet.",
      como: "aviso-sistema",
      lectura: "parcial",
      fase: 1,
      desde: 1,
      funciones: ["malla-radios", "llamadas", "control-entre-neuronas", "prestar-ventana"],
      nota: "macOS no deja leer este permiso: se deduce de si la malla local responde.",
      enlace: {
        nivel: "directo",
        pantalla: "Ajustes del Sistema > Privacidad y seguridad > Red local",
        pulsa: "Activa el interruptor de StarSeed OS. (macOS 15 o posterior; en versiones anteriores no existe este permiso.)",
        urlScheme: "x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork",
      },
      distinguirFaltaDeDenegado:
        "No hay API pública para leerlo. Si la malla local no responde tras haberla configurado = probablemente denegado; si nunca se intentó = falta.",
    },
    {
      id: "ubicacion-wifi",
      grupo: "ubicacion-red",
      titulo: "Ubicación (nombres de Wi-Fi)",
      porQue: "El sistema la pide para dejar ver el nombre de las redes Wi-Fi (red directa con tu Android). StarSeed no usa ni guarda tu ubicación.",
      como: "aviso-sistema",
      lectura: "si",
      fase: 1,
      desde: 1,
      opcional: true,
      funciones: ["malla-radios"],
      nota: "Es el MISMO permiso del sistema que «Ubicación (mapa)»: el aviso sale una sola vez.",
      enlace: {
        nivel: "directo",
        pantalla: "Ajustes del Sistema > Privacidad y seguridad > Localización",
        pulsa: "Activa «Localización» arriba y el interruptor de StarSeed OS.",
        urlScheme: "x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices",
      },
      distinguirFaltaDeDenegado:
        "Si `CLLocationManager.authorizationStatus()` es `notDetermined` = falta; si es `denied` = denegado a mano.",
    },
    {
      id: "ubicacion",
      grupo: "ubicacion-red",
      titulo: "Ubicación (mapa)",
      porQue: "Para situar este aparato en el mapa de Señales y en «Usar mi ubicación». Solo se pide cuando tú lo pides; la posición exacta solo la ven tus otras neuronas.",
      como: "por-uso",
      lectura: "si",
      fase: 1,
      desde: 1,
      opcional: true,
      funciones: ["mapa-senales"],
      nota: "El aviso sale al pulsar «Usar mi ubicación», no al instalar. Es el mismo permiso «Localización» de macOS.",
      enlace: {
        nivel: "directo",
        pantalla: "Ajustes del Sistema > Privacidad y seguridad > Localización",
        pulsa: "Activa «Localización» arriba y el interruptor de StarSeed OS.",
        urlScheme: "x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices",
      },
      distinguirFaltaDeDenegado:
        "Igual que ubicacion-wifi: es el mismo permiso del sistema.",
    },
    {
      id: "notificaciones",
      grupo: "comunicacion",
      titulo: "Notificaciones",
      porQue: "Para avisarte de mensajes y llamadas aunque la ventana esté cerrada.",
      como: "aviso-sistema",
      lectura: "parcial",
      fase: 1,
      desde: 1,
      funciones: ["avisos", "llamadas"],
      nota: "El plugin de notificaciones no distingue «negado» de «sin preguntar».",
      enlace: {
        nivel: "lista",
        pantalla: "Ajustes del Sistema > Notificaciones",
        pulsa: "Busca StarSeed OS en la lista y activa «Permitir notificaciones».",
        urlScheme: "x-apple.systempreferences:com.apple.preference.notifications",
      },
      distinguirFaltaDeDenegado:
        "El plugin solo dice `granted`/`denied`/`provisional`; `denied` puede ser denegado a mano o nunca preguntado. Si nunca se pidió = falta.",
    },
    {
      id: "llamadas",
      grupo: "comunicacion",
      titulo: "Llamadas sobre la pantalla de bloqueo",
      porQue: "Para que una llamada de StarSeed aparezca a pantalla completa con el teléfono bloqueado. Sin esto llega como aviso emergente.",
      como: "solo-ajustes",
      lectura: "si",
      fase: 2,
      desde: 2,
      opcional: true,
      funciones: ["llamadas"],
      nota: "",
      enlace: {
        nivel: "lista",
        pantalla: "Ajustes del Sistema > Notificaciones > StarSeed OS",
        pulsa: "Activa «Notificaciones críticas» o «Anunciar en pantalla de bloqueo».",
      },
      distinguirFaltaDeDenegado:
        "Si la app no tiene el entitlement o no está en la lista = falta; si está en la lista pero desactivado = denegado a mano.",
    },
    {
      id: "arranque",
      grupo: "segundo-plano",
      titulo: "Abrir al iniciar sesión",
      porQue: "Para que tu neurona esté disponible para tus otras neuronas y te avise aunque no la abras tú.",
      como: "aviso-sistema",
      lectura: "si",
      fase: 1,
      desde: 3,
      opcional: true,
      funciones: ["siempre-disponible", "avisos", "control-entre-neuronas"],
      nota: "macOS lo enseña en Ajustes del Sistema > General > Ítems de inicio.",
      enlace: {
        nivel: "lista",
        pantalla: "Ajustes del Sistema > General > Ítems de inicio",
        pulsa: "En «Permitir en segundo plano» activa StarSeed OS.",
        urlScheme: "x-apple.systempreferences:com.apple.LoginItems-Settings.extension",
      },
      distinguirFaltaDeDenegado:
        "Si `fondo_estado.arranque_con_sistema` es false = falta o denegado; la app lo activa ella misma, así que si no está = no se pidió o se quitó.",
    },
    {
      id: "carpetas",
      grupo: "archivos-almacenamiento",
      titulo: "Carpetas protegidas",
      porQue: "Escritorio, Documentos y Descargas: el sistema pregunta la primera vez que eliges una de ellas para vincularla.",
      como: "por-uso",
      lectura: "no",
      fase: 1,
      desde: 3,
      funciones: ["carpetas-compartidas"],
      nota: "",
      enlace: {
        nivel: "directo",
        pantalla: "Ajustes del Sistema > Privacidad y seguridad > Archivos y carpetas",
        pulsa: "Activa las carpetas que quieras compartir bajo StarSeed OS.",
        urlScheme: "x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders",
      },
      distinguirFaltaDeDenegado:
        "No hay API para leerlo. Si el selector de carpetas no muestra la opción = falta; si la carpeta está en la lista pero desactivada = denegado a mano.",
    },
    {
      id: "disco-completo",
      grupo: "archivos-almacenamiento",
      titulo: "Acceso total al disco",
      porQue: "Para compartir con tus neuronas cualquier carpeta o volumen sin elegirlos uno a uno.",
      como: "solo-ajustes",
      lectura: "no",
      fase: 6,
      desde: 3,
      funciones: ["carpetas-compartidas"],
      nota: "macOS no deja a la app saber si lo diste: solo se ve por lo que puede abrir.",
      enlace: {
        nivel: "directo",
        pantalla: "Ajustes del Sistema > Privacidad y seguridad > Acceso total al disco",
        pulsa: "Activa el interruptor de StarSeed OS y reabre la app.",
        urlScheme: "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
      },
      distinguirFaltaDeDenegado:
        "No hay API pública (leer TCC.db está prohibido). Si la app no puede abrir rutas fuera de su sandbox = falta o denegado; no se puede distinguir.",
    },
    {
      id: "capacidades",
      grupo: "sistema-dispositivo",
      titulo: "Capacidades del aparato",
      porQue: "Procesador, memoria, disco, batería y temperatura: se leen sin pedir nada, para decidir qué puede prestar esta neurona.",
      como: "nada-sistema",
      lectura: "si",
      fase: 1,
      desde: 3,
      funciones: ["prestar-proceso"],
      nota: "",
      enlace: {
        nivel: "no-hace-falta",
        pantalla: "—",
        pulsa: "Leer las capacidades del aparato no pide nada.",
      },
      distinguirFaltaDeDenegado: "No aplica: no se pide.",
    },
  ];
}

function matrizAndroid(): DefPermisoMedio[] {
  return [
    {
      id: "cercanos",
      grupo: "ubicacion-red",
      titulo: "Dispositivos cercanos",
      porQue: "Para buscar, anunciarse y conectar por Bluetooth y por Wi-Fi P2P (Wi-Fi Aware o Wi-Fi Direct, sin router ni hotspot). StarSeed no usa tu ubicación.",
      como: "aviso-sistema",
      lectura: "si",
      fase: 1,
      desde: 1,
      funciones: ["malla-radios", "llamadas"],
      nota: "Incluye BLUETOOTH_SCAN/CONNECT/ADVERTISE (12+) y NEARBY_WIFI_DEVICES (13+); ubicación hasta Android 12.",
      enlace: {
        nivel: "ficha-app",
        pantalla: "Información de la app StarSeed OS",
        pulsa: "Pulsa «Permisos» > «Dispositivos cercanos» > «Permitir».",
      },
      distinguirFaltaDeDenegado:
        "Si `ContextCompat.checkSelfPermission` para NEARBY_WIFI_DEVICES es `PERMISSION_GRANTED` = concedido; si `shouldShowRequestPermissionRationale` es true = denegado antes (falta o denegado); si false y no concedido = nunca se pidió (falta).",
    },
    {
      id: "ubicacion",
      grupo: "ubicacion-red",
      titulo: "Ubicación (mapa)",
      porQue: "Para situar este aparato en el mapa de Señales y en «Usar mi ubicación». Solo se pide cuando tú lo pides; la posición exacta solo la ven tus otras neuronas.",
      como: "por-uso",
      lectura: "si",
      fase: 1,
      desde: 1,
      opcional: true,
      funciones: ["mapa-senales"],
      nota: "Android 12+ deja dar solo la ubicación aproximada; el mapa lo dice. El aviso sale al pulsar «Usar mi ubicación», no al instalar.",
      enlace: {
        nivel: "ficha-app",
        pantalla: "Información de la app StarSeed OS",
        pulsa: "Pulsa «Permisos» > «Ubicación» > «Permitir solo mientras la app está en uso» (y «Usar ubicación precisa» si quieres el punto exacto).",
      },
      distinguirFaltaDeDenegado:
        "Igual que cercanos: `shouldShowRequestPermissionRationale` true = denegado antes; false y no concedido = falta.",
    },
    {
      id: "nfc",
      grupo: "ubicacion-red",
      titulo: "NFC",
      porQue: "Para enlazar dos aparatos acercándolos. Android lo da sin preguntar en cuanto la app lo declara.",
      como: "declaracion-manifiesto",
      lectura: "si",
      fase: 6,
      desde: 3,
      funciones: ["malla-radios"],
      nota: "",
      enlace: {
        nivel: "no-hace-falta",
        pantalla: "—",
        pulsa: "NFC no pide permiso: basta con que esté encendido en el aparato.",
      },
      distinguirFaltaDeDenegado: "No aplica: se concede al declarar en el manifiesto.",
    },
    {
      id: "notificaciones",
      grupo: "comunicacion",
      titulo: "Notificaciones",
      porQue: "Para avisarte de mensajes y llamadas aunque la ventana esté cerrada.",
      como: "aviso-sistema",
      lectura: "si",
      fase: 1,
      desde: 1,
      funciones: ["avisos", "llamadas"],
      nota: "Dos negativas = ya no pregunta: ficha de la app.",
      enlace: {
        nivel: "directo",
        pantalla: "Ajustes > Aplicaciones > StarSeed OS > Notificaciones",
        pulsa: "Activa «Permitir notificaciones».",
      },
      distinguirFaltaDeDenegado:
        "Si `NotificationManagerCompat.areNotificationsEnabled()` es false y `shouldShowRequestPermissionRationale` para POST_NOTIFICATIONS es true = denegado a mano; false = falta.",
    },
    {
      id: "microfono",
      grupo: "audio-video",
      titulo: "Micrófono",
      porQue: "Solo cuando tú lo pides: llamadas, transmisiones y grabaciones.",
      como: "aviso-sistema",
      lectura: "si",
      fase: 1,
      desde: 1,
      funciones: ["llamadas"],
      nota: "Dos negativas = ya no pregunta: ficha de la app.",
      enlace: {
        nivel: "ficha-app",
        pantalla: "Información de la app StarSeed OS",
        pulsa: "Pulsa «Permisos» > «Micrófono» > «Permitir solo mientras la app está en uso».",
      },
      distinguirFaltaDeDenegado:
        "Igual que notificaciones: `shouldShowRequestPermissionRationale` true = denegado a mano; false = falta.",
    },
    {
      id: "camara",
      grupo: "audio-video",
      titulo: "Cámara",
      porQue: "Solo cuando tú lo pides: videollamadas, transmisiones y grabaciones.",
      como: "aviso-sistema",
      lectura: "si",
      fase: 1,
      desde: 1,
      funciones: ["llamadas"],
      nota: "Dos negativas = ya no pregunta: ficha de la app.",
      enlace: {
        nivel: "ficha-app",
        pantalla: "Información de la app StarSeed OS",
        pulsa: "Pulsa «Permisos» > «Cámara» > «Permitir solo mientras la app está en uso».",
      },
      distinguirFaltaDeDenegado:
        "Igual que micrófono.",
    },
    {
      id: "llamadas",
      grupo: "comunicacion",
      titulo: "Llamadas en pantalla completa",
      porQue: "Para que una llamada de StarSeed aparezca a pantalla completa con el teléfono bloqueado.",
      como: "solo-ajustes",
      lectura: "si",
      fase: 1,
      desde: 2,
      opcional: true,
      funciones: ["llamadas"],
      nota: "Android 14+; Play lo limita a apps de llamadas y alarmas.",
      enlace: {
        nivel: "directo",
        pantalla: "Ajustes > Aplicaciones > Acceso especial > Notificaciones a pantalla completa",
        pulsa: "Activa «Permitir notificaciones a pantalla completa». En Android 13 o anterior no hace falta.",
      },
      distinguirFaltaDeDenegado:
        "Si `Settings.canDrawOverlays` para USE_FULL_SCREEN_INTENT es false = falta o denegado; no hay rationale para este permiso.",
    },
    {
      id: "pantalla",
      grupo: "pantalla-control",
      titulo: "Grabar o compartir pantalla",
      porQue: "Para compartir tu pantalla en llamadas y salas.",
      como: "por-uso",
      lectura: "no",
      fase: 2,
      desde: 1,
      funciones: ["compartir-pantalla", "astraura-ve"],
      nota: "Android pregunta cada vez que empieza a compartirse (no se puede dar de antemano). Token vale una vez (14+).",
      enlace: {
        nivel: "aviso-sistema",
        pantalla: "Diálogo de MediaProjection del sistema",
        pulsa: "Elige «Pantalla completa» o «Una sola app» y pulsa «Empezar ahora».",
      },
      distinguirFaltaDeDenegado:
        "No se puede leer antes de pedir. Cada sesión es nueva: no hay «falta» ni «denegado» persistente.",
    },
    {
      id: "accesibilidad",
      grupo: "pantalla-control",
      titulo: "Servicio de accesibilidad",
      porQue: "Para que Astraura actúe en el aparato y para el control entre neuronas.",
      como: "solo-ajustes",
      lectura: "si",
      fase: 3,
      desde: 1,
      funciones: ["control-entre-neuronas", "astraura-actua"],
      nota: "Instalada fuera de la tienda, Android 13+ exige antes «Permitir ajustes restringidos» en la ficha de la app.",
      enlace: {
        nivel: "lista",
        pantalla: "Ajustes > Accesibilidad > Aplicaciones instaladas",
        pulsa: "Pulsa «StarSeed OS», activa el interruptor y confirma con «Permitir». Si sale en gris, antes pulsa ⋮ en la ficha de la app > «Permitir ajustes restringidos».",
      },
      distinguirFaltaDeDenegado:
        "Si `Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES` no contiene el servicio = falta; si está pero desactivado = denegado a mano. `shouldShowRequestPermissionRationale` no aplica aquí.",
    },
    {
      id: "superposicion",
      grupo: "pantalla-control",
      titulo: "Mostrar sobre otras apps",
      porQue: "Para enseñar siempre encima el aviso de «te están controlando» con su botón de parar, y la orbe de Astraura.",
      como: "solo-ajustes",
      lectura: "si",
      fase: 3,
      desde: 1,
      funciones: ["control-entre-neuronas", "astraura-actua"],
      nota: "",
      enlace: {
        nivel: "directo",
        pantalla: "Ajustes > Aplicaciones > Acceso especial > Mostrar sobre otras apps > StarSeed OS",
        pulsa: "Activa «Permitir mostrar sobre otras apps».",
      },
      distinguirFaltaDeDenegado:
        "Si `Settings.canDrawOverlays()` es false = falta o denegado; no hay rationale.",
    },
    {
      id: "bateria",
      grupo: "segundo-plano",
      titulo: "Sin límite de batería",
      porQue: "Para que las antenas sigan vivas con la pantalla apagada. Puedes dejarlo: se usarán solo con la app abierta.",
      como: "aviso-sistema",
      lectura: "si",
      fase: 1,
      desde: 1,
      opcional: true,
      funciones: ["siempre-disponible", "malla-radios"],
      nota: "Play lo limita a casos aceptados (mensajería/mesh entra).",
      enlace: {
        nivel: "aviso-sistema",
        pantalla: "Diálogo del sistema «¿Permitir que StarSeed OS ignore las optimizaciones de batería?»",
        pulsa: "Pulsa «Permitir».",
      },
      distinguirFaltaDeDenegado:
        "Si `PowerManager.isIgnoringBatteryOptimizations` es false y el diálogo no se mostró = falta; si se mostró y se denegó = denegado a mano.",
    },
    {
      id: "todos-archivos",
      grupo: "archivos-almacenamiento",
      titulo: "Acceso a todos los archivos",
      porQue: "Para compartir con tus neuronas cualquier carpeta o memoria del aparato, no solo las que elijas.",
      como: "solo-ajustes",
      lectura: "si",
      fase: 6,
      desde: 3,
      funciones: ["carpetas-compartidas"],
      nota: "Play solo para gestores de archivos/copias.",
      enlace: {
        nivel: "directo",
        pantalla: "Ajustes > Aplicaciones > Acceso especial > Acceso a todos los archivos > StarSeed OS",
        pulsa: "Activa «Permitir acceso para administrar todos los archivos».",
      },
      distinguirFaltaDeDenegado:
        "Si `Environment.isExternalStorageManager()` es false = falta o denegado; no hay rationale.",
    },
    {
      id: "instalar",
      grupo: "sistema-dispositivo",
      titulo: "Instalar apps desconocidas",
      porQue: "Para que la app se actualice sola desde el canal de StarSeed (la firma se comprueba antes).",
      como: "solo-ajustes",
      lectura: "si",
      fase: 1,
      desde: 1,
      opcional: true,
      funciones: ["actualizacion-sola"],
      nota: "Play lo prohíbe salvo tiendas; fuera de Play, sí.",
      enlace: {
        nivel: "directo",
        pantalla: "Ajustes > Aplicaciones > Acceso especial > Instalar apps desconocidas > StarSeed OS",
        pulsa: "Activa «Permitir desde esta fuente».",
      },
      distinguirFaltaDeDenegado:
        "Si `PackageManager.canRequestPackageInstalls()` es false = falta o denegado; no hay rationale.",
    },
    {
      id: "no-molestar",
      grupo: "sistema-dispositivo",
      titulo: "Acceso a No molestar",
      porQue: "Para que el centro de control encienda y apague el No molestar de verdad del aparato.",
      como: "solo-ajustes",
      lectura: "si",
      fase: 5,
      desde: 3,
      funciones: ["centro-control-nativo"],
      nota: "",
      enlace: {
        nivel: "lista",
        pantalla: "Ajustes > Notificaciones > Acceso a No molestar",
        pulsa: "Pulsa StarSeed OS y activa «Permitir acceso a No molestar».",
      },
      distinguirFaltaDeDenegado:
        "Si `NotificationManager.isNotificationPolicyAccessGranted()` es false = falta o denegado; no hay rationale.",
    },
    {
      id: "escribir-ajustes",
      grupo: "sistema-dispositivo",
      titulo: "Modificar ajustes del sistema",
      porQue: "Para que el centro de control cambie el brillo real de la pantalla.",
      como: "solo-ajustes",
      lectura: "si",
      fase: 5,
      desde: 3,
      funciones: ["centro-control-nativo"],
      nota: "",
      enlace: {
        nivel: "directo",
        pantalla: "Ajustes > Aplicaciones > Acceso especial > Modificar ajustes del sistema > StarSeed OS",
        pulsa: "Activa «Permitir modificar los ajustes del sistema».",
      },
      distinguirFaltaDeDenegado:
        "Si `Settings.System.canWrite()` es false = falta o denegado; no hay rationale.",
    },
    {
      id: "capacidades",
      grupo: "sistema-dispositivo",
      titulo: "Capacidades del aparato",
      porQue: "Procesador, memoria, disco, batería y temperatura: se leen sin pedir nada.",
      como: "nada-sistema",
      lectura: "si",
      fase: 1,
      desde: 1,
      funciones: ["prestar-proceso"],
      nota: "",
      enlace: {
        nivel: "no-hace-falta",
        pantalla: "—",
        pulsa: "Leer las capacidades del aparato no pide nada.",
      },
      distinguirFaltaDeDenegado: "No aplica: no se pide.",
    },
    {
      id: "bluetooth",
      grupo: "ubicacion-red",
      titulo: "Bluetooth (Classic)",
      porQue: "Para Bluetooth clásico (no BLE). En Android 12+ va por «Dispositivos cercanos».",
      como: "aviso-sistema",
      lectura: "si",
      fase: 1,
      desde: 1,
      funciones: ["malla-radios"],
      nota: "En Android 12+ usa el mismo permiso que «Dispositivos cercanos».",
      enlace: {
        nivel: "ficha-app",
        pantalla: "Información de la app StarSeed OS",
        pulsa: "Pulsa «Permisos» > «Dispositivos cercanos» > «Permitir».",
      },
      distinguirFaltaDeDenegado: "Ver «Dispositivos cercanos».",
    },
    {
      id: "red-local",
      grupo: "ubicacion-red",
      titulo: "Red local",
      porQue: "Android 16 anuncia protección opcional; hoy nada que pedir.",
      como: "nada-sistema",
      lectura: "no",
      fase: 1,
      desde: 1,
      funciones: [],
      nota: "Vigilar futuras versiones.",
      enlace: {
        nivel: "no-hace-falta",
        pantalla: "—",
        pulsa: "Hoy no hay permiso de red local en Android.",
      },
      distinguirFaltaDeDenegado: "No aplica.",
    },
    {
      id: "ubicacion-wifi",
      grupo: "ubicacion-red",
      titulo: "Ubicación (nombres de Wi-Fi)",
      porQue: "En Android es el mismo permiso que «Ubicación (mapa)».",
      como: "por-uso",
      lectura: "si",
      fase: 1,
      desde: 1,
      opcional: true,
      funciones: ["malla-radios"],
      nota: "Mismo permiso que ubicacion.",
      enlace: {
        nivel: "ficha-app",
        pantalla: "Información de la app StarSeed OS",
        pulsa: "Ver «Ubicación (mapa)».",
      },
      distinguirFaltaDeDenegado: "Ver «Ubicación (mapa)».",
    },
    {
      id: "arranque",
      grupo: "segundo-plano",
      titulo: "Abrir al encender",
      porQue: "Servicio en primer plano + RECEIVE_BOOT_COMPLETED (declaración).",
      como: "declaracion-manifiesto",
      lectura: "si",
      fase: 1,
      desde: 1,
      funciones: ["siempre-disponible"],
      nota: "Android 14+ cada tipo de servicio en primer plano se justifica.",
      enlace: {
        nivel: "no-hace-falta",
        pantalla: "—",
        pulsa: "Se declara en el manifiesto; no hay aviso.",
      },
      distinguirFaltaDeDenegado: "No aplica: se concede al instalar.",
    },
  ];
}

function matrizWindows(): DefPermisoMedio[] {
  return [
    {
      id: "bluetooth",
      grupo: "ubicacion-red",
      titulo: "Bluetooth",
      porQue: "Windows no pide permiso a las apps de escritorio para el Bluetooth.",
      como: "nada-sistema",
      lectura: "si",
      fase: 1,
      desde: 1,
      funciones: ["malla-radios"],
      nota: "Las API WinRT miran «Radios» en Ajustes.",
      enlace: {
        nivel: "directo",
        pantalla: "Configuración > Bluetooth y dispositivos",
        pulsa: "Activa «Bluetooth».",
        urlScheme: "ms-settings:bluetooth",
      },
      distinguirFaltaDeDenegado: "No aplica: no se pide permiso a apps de escritorio.",
    },
    {
      id: "red-local",
      grupo: "ubicacion-red",
      titulo: "Red local",
      porQue: "El Firewall de Windows pregunta la primera vez que la neurona escucha en la red: elige «Redes privadas».",
      como: "por-uso",
      lectura: "no",
      fase: 1,
      desde: 1,
      funciones: ["malla-radios", "llamadas", "control-entre-neuronas", "prestar-ventana"],
      nota: "",
      enlace: {
        nivel: "sin-enlace",
        pantalla: "Firewall de Windows (lo abre el propio Windows)",
        pulsa: "No hay pantalla de Configuración para esto: Windows pregunta solo la primera vez que StarSeed OS escucha en la red. Elige «Redes privadas».",
      },
      distinguirFaltaDeDenegado:
        "El Firewall pregunta una vez. Si la regla no existe = falta; si existe pero bloquea = denegado a mano (raro).",
    },
    {
      id: "ubicacion-wifi",
      grupo: "ubicacion-red",
      titulo: "Ubicación (nombres de Wi-Fi)",
      porQue: "Desde Windows 11 24H2 ver el nombre de las redes Wi-Fi pide «Ubicación» para apps de escritorio.",
      como: "por-uso",
      lectura: "no",
      fase: 1,
      desde: 1,
      opcional: true,
      funciones: ["malla-radios"],
      nota: "",
      enlace: {
        nivel: "directo",
        pantalla: "Configuración > Privacidad y seguridad > Ubicación",
        pulsa: "Activa «Servicios de ubicación» y «Permitir que las aplicaciones de escritorio accedan a tu ubicación».",
        urlScheme: "ms-settings:privacy-location",
      },
      distinguirFaltaDeDenegado:
        "No hay API para leer el estado para apps de escritorio. Si la API WLAN falla = falta o denegado.",
    },
    {
      id: "ubicacion",
      grupo: "ubicacion-red",
      titulo: "Ubicación (mapa)",
      porQue: "En Windows el mapa usa la ubicación del navegador; si no la da, Configuración > Privacidad y seguridad > Ubicación.",
      como: "por-uso",
      lectura: "no",
      fase: 1,
      desde: 1,
      opcional: true,
      funciones: ["mapa-senales"],
      nota: "",
      enlace: {
        nivel: "directo",
        pantalla: "Configuración > Privacidad y seguridad > Ubicación",
        pulsa: "Activa «Servicios de ubicación» y «Permitir que las aplicaciones de escritorio accedan a tu ubicación».",
        urlScheme: "ms-settings:privacy-location",
      },
      distinguirFaltaDeDenegado: "Igual que ubicacion-wifi.",
    },
    {
      id: "notificaciones",
      grupo: "comunicacion",
      titulo: "Notificaciones",
      porQue: "Activadas por defecto; se apagan en Configuración > Notificaciones.",
      como: "nada-sistema",
      lectura: "no",
      fase: 1,
      desde: 1,
      funciones: ["avisos", "llamadas"],
      nota: "",
      enlace: {
        nivel: "directo",
        pantalla: "Configuración > Sistema > Notificaciones",
        pulsa: "Activa «Notificaciones» y, en la lista, StarSeed OS.",
        urlScheme: "ms-settings:notifications",
      },
      distinguirFaltaDeDenegado: "No aplica: activadas por defecto.",
    },
    {
      id: "microfono",
      grupo: "audio-video",
      titulo: "Micrófono",
      porQue: "Permitido salvo que hayas apagado «Permitir que las apps de escritorio accedan al micrófono».",
      como: "por-uso",
      lectura: "no",
      fase: 1,
      desde: 1,
      funciones: ["llamadas"],
      nota: "",
      enlace: {
        nivel: "directo",
        pantalla: "Configuración > Privacidad y seguridad > Micrófono",
        pulsa: "Activa «Permitir que las aplicaciones de escritorio accedan al micrófono».",
        urlScheme: "ms-settings:privacy-microphone",
      },
      distinguirFaltaDeDenegado:
        "No hay API para leer el estado global. Si la captura falla = falta o denegado.",
    },
    {
      id: "camara",
      grupo: "audio-video",
      titulo: "Cámara",
      porQue: "Permitida salvo que hayas apagado «Permitir que las apps de escritorio accedan a la cámara».",
      como: "por-uso",
      lectura: "no",
      fase: 1,
      desde: 1,
      funciones: ["llamadas"],
      nota: "",
      enlace: {
        nivel: "directo",
        pantalla: "Configuración > Privacidad y seguridad > Cámara",
        pulsa: "Activa «Permitir que las aplicaciones de escritorio accedan a la cámara».",
        urlScheme: "ms-settings:privacy-webcam",
      },
      distinguirFaltaDeDenegado: "Igual que micrófono.",
    },
    {
      id: "pantalla",
      grupo: "pantalla-control",
      titulo: "Captura de pantalla",
      porQue: "Windows no pide permiso para capturar; marca con un borde la ventana que se comparte.",
      como: "nada-sistema",
      lectura: "si",
      fase: 1,
      desde: 1,
      funciones: ["compartir-pantalla", "prestar-ventana", "astraura-ve"],
      nota: "Graphics Capture enseña un borde amarillo.",
      enlace: {
        nivel: "no-hace-falta",
        pantalla: "—",
        pulsa: "Windows no pide permiso para compartir pantalla.",
      },
      distinguirFaltaDeDenegado: "No aplica: no se pide.",
    },
    {
      id: "accesibilidad",
      grupo: "pantalla-control",
      titulo: "Control (teclado/ratón)",
      porQue: "No pide permiso, pero no deja tocar ventanas de administrador ni la pantalla de inicio de sesión.",
      como: "nada-sistema",
      lectura: "si",
      fase: 1,
      desde: 1,
      funciones: ["control-entre-neuronas", "astraura-actua"],
      nota: "Saltarlo exige uiAccess=true firmado e instalado en Program Files.",
      enlace: {
        nivel: "no-hace-falta",
        pantalla: "—",
        pulsa: "Windows no pide permiso para mandar teclas y clics (no llega a ventanas elevadas).",
      },
      distinguirFaltaDeDenegado: "No aplica: no se pide.",
    },
    {
      id: "arranque",
      grupo: "segundo-plano",
      titulo: "Abrir al iniciar sesión",
      porQue: "La app lo activa (autostart).",
      como: "aviso-sistema",
      lectura: "si",
      fase: 1,
      desde: 1,
      opcional: true,
      funciones: ["siempre-disponible", "avisos", "control-entre-neuronas"],
      nota: "",
      enlace: {
        nivel: "directo",
        pantalla: "Configuración > Aplicaciones > Inicio",
        pulsa: "Activa StarSeed OS en la lista.",
        urlScheme: "ms-settings:startupapps",
      },
      distinguirFaltaDeDenegado:
        "Si la entrada de autostart no existe = falta; si existe pero desactivada = denegado a mano.",
    },
    {
      id: "capacidades",
      grupo: "sistema-dispositivo",
      titulo: "Capacidades del aparato",
      porQue: "Se leen sin pedir nada (WMI, APIs del sistema).",
      como: "nada-sistema",
      lectura: "si",
      fase: 1,
      desde: 1,
      funciones: ["prestar-proceso"],
      nota: "",
      enlace: {
        nivel: "no-hace-falta",
        pantalla: "—",
        pulsa: "Leer las capacidades del aparato no pide nada.",
      },
      distinguirFaltaDeDenegado: "No aplica.",
    },
  ];
}

function matrizLinuxX11(): DefPermisoMedio[] {
  return [
    {
      id: "bluetooth",
      grupo: "ubicacion-red",
      titulo: "Bluetooth",
      porQue: "BlueZ no pide permiso a la app; solo hace falta que el Bluetooth esté encendido.",
      como: "nada-sistema",
      lectura: "si",
      fase: 1,
      desde: 1,
      funciones: ["malla-radios"],
      nota: "Polkit solo si se empareja.",
      enlace: {
        nivel: "no-hace-falta",
        pantalla: "—",
        pulsa: "BlueZ no pide permiso a la app; solo hace falta que el Bluetooth esté encendido.",
      },
      distinguirFaltaDeDenegado: "No aplica.",
    },
    {
      id: "red-local",
      grupo: "ubicacion-red",
      titulo: "Red local",
      porQue: "Linux no pide permiso para la red local.",
      como: "nada-sistema",
      lectura: "si",
      fase: 1,
      desde: 1,
      funciones: ["malla-radios"],
      nota: "",
      enlace: {
        nivel: "no-hace-falta",
        pantalla: "—",
        pulsa: "Linux no pide permiso para la red local.",
      },
      distinguirFaltaDeDenegado: "No aplica.",
    },
    {
      id: "notificaciones",
      grupo: "comunicacion",
      titulo: "Notificaciones",
      porQue: "Linux no pide permiso para las notificaciones.",
      como: "nada-sistema",
      lectura: "no",
      fase: 1,
      desde: 1,
      funciones: ["avisos"],
      nota: "",
      enlace: {
        nivel: "no-hace-falta",
        pantalla: "—",
        pulsa: "Linux no pide permiso para las notificaciones.",
      },
      distinguirFaltaDeDenegado: "No aplica.",
    },
    {
      id: "microfono",
      grupo: "audio-video",
      titulo: "Micrófono",
      porQue: "WebKitGTK pregunta a la app, que decide por origen.",
      como: "nada-sistema",
      lectura: "no",
      fase: 1,
      desde: 1,
      funciones: ["llamadas"],
      nota: "",
      enlace: {
        nivel: "sin-enlace",
        pantalla: "Los ajustes de sonido de tu escritorio",
        pulsa: "Linux no tiene una pantalla de permisos única: cada escritorio (GNOME, KDE…) pone la suya y la app no puede saber cuál es, así que no abre ninguna. Si la app no oye, mira Sonido > Entrada y que el micrófono no esté silenciado.",
      },
      distinguirFaltaDeDenegado:
        "En X11 no hay aislamiento: si no funciona es configuración del escritorio, no permiso.",
    },
    {
      id: "camara",
      grupo: "audio-video",
      titulo: "Cámara",
      porQue: "WebKitGTK pregunta a la app, que decide por origen.",
      como: "nada-sistema",
      lectura: "no",
      fase: 1,
      desde: 1,
      funciones: ["llamadas"],
      nota: "",
      enlace: {
        nivel: "sin-enlace",
        pantalla: "Los ajustes de privacidad de tu escritorio",
        pulsa: "Linux no tiene una pantalla de permisos única: cada escritorio (GNOME, KDE…) pone la suya y la app no puede saber cuál es, así que no abre ninguna. Si la cámara no sale, comprueba que no la use otra app.",
      },
      distinguirFaltaDeDenegado: "Igual que micrófono.",
    },
    {
      id: "pantalla",
      grupo: "pantalla-control",
      titulo: "Captura de pantalla (X11)",
      porQue: "En X11 cualquier app puede ver la pantalla: no hay nada que pedir (ni que proteger).",
      como: "nada-sistema",
      lectura: "si",
      fase: 1,
      desde: 1,
      funciones: ["compartir-pantalla", "prestar-ventana", "astraura-ve"],
      nota: "",
      enlace: {
        nivel: "no-hace-falta",
        pantalla: "—",
        pulsa: "En X11 cualquier app puede ver la pantalla: no hay nada que pedir.",
      },
      distinguirFaltaDeDenegado: "No aplica.",
    },
    {
      id: "accesibilidad",
      grupo: "pantalla-control",
      titulo: "Control (teclado/ratón X11)",
      porQue: "En X11 cualquier app puede mandar teclas y clics: no hay nada que pedir.",
      como: "nada-sistema",
      lectura: "si",
      fase: 1,
      desde: 1,
      funciones: ["control-entre-neuronas", "astraura-actua"],
      nota: "Usa XTest (enigo).",
      enlace: {
        nivel: "no-hace-falta",
        pantalla: "—",
        pulsa: "En X11 cualquier app puede mandar teclas y clics: no hay nada que pedir.",
      },
      distinguirFaltaDeDenegado: "No aplica.",
    },
    {
      id: "arranque",
      grupo: "segundo-plano",
      titulo: "Abrir al iniciar sesión",
      porQue: ".desktop en ~/.config/autostart.",
      como: "aviso-sistema",
      lectura: "si",
      fase: 1,
      desde: 1,
      opcional: true,
      funciones: ["siempre-disponible"],
      nota: "",
      enlace: {
        nivel: "sin-enlace",
        pantalla: "Aplicaciones al inicio de tu escritorio",
        pulsa: "Linux no tiene una pantalla de permisos única: cada escritorio (GNOME, KDE…) pone la suya y la app no puede saber cuál es, así que no abre ninguna. StarSeed OS crea su entrada en ~/.config/autostart; para quitarla, bórrala desde el gestor de inicio de tu escritorio.",
      },
      distinguirFaltaDeDenegado:
        "Si el archivo .desktop no existe en ~/.config/autostart = falta; si existe pero desactivado = denegado a mano.",
    },
    {
      id: "capacidades",
      grupo: "sistema-dispositivo",
      titulo: "Capacidades del aparato",
      porQue: "Se leen sin pedir nada (procfs, sysfs, lm-sensors).",
      como: "nada-sistema",
      lectura: "si",
      fase: 1,
      desde: 1,
      funciones: ["prestar-proceso"],
      nota: "",
      enlace: {
        nivel: "no-hace-falta",
        pantalla: "—",
        pulsa: "Leer las capacidades del aparato no pide nada.",
      },
      distinguirFaltaDeDenegado: "No aplica.",
    },
  ];
}

function matrizLinuxWayland(): DefPermisoMedio[] {
  const base = matrizLinuxX11();
  return base.map((p) => {
    if (p.id === "pantalla") {
      return {
        ...p,
        titulo: "Captura de pantalla (Wayland)",
        porQue: "Wayland pregunta qué compartir cada vez, con su propio selector.",
        como: "por-uso",
        lectura: "no",
        nota: "Portal org.freedesktop.portal.ScreenCast con selector en cada sesión (se puede recordar con restore token).",
        enlace: {
          nivel: "aviso-sistema",
          pantalla: "Selector de compartición de Wayland (portal ScreenCast)",
          pulsa: "Elige la pantalla o ventana y pulsa «Compartir».",
        },
        distinguirFaltaDeDenegado:
          "Cada sesión es nueva: no hay estado persistente. Si el portal deniega = denegado en esa sesión; no hay «falta» global.",
      };
    }
    if (p.id === "accesibilidad") {
      return {
        ...p,
        titulo: "Control (teclado/ratón Wayland)",
        porQue: "Wayland solo deja mandar teclas y clics por el portal de Escritorio remoto, que pregunta en cada sesión.",
        como: "por-uso",
        lectura: "no",
        fase: 3,
        nota: "Enigo en Wayland no funciona hoy salvo libei experimental.",
        enlace: {
          nivel: "aviso-sistema",
          pantalla: "Portal RemoteDesktop de Wayland",
          pulsa: "Pulsa «Permitir» en el diálogo del portal.",
        },
        distinguirFaltaDeDenegado:
          "Cada sesión es nueva. Si el portal deniega = denegado en esa sesión.",
      };
    }
    return p;
  });
}

function matrizIOS(): DefPermisoMedio[] {
  // iOS / iPadOS: solo PWA y navegador (no hay app nativa Tauri en iOS aún)
  return [
    {
      id: "microfono",
      grupo: "audio-video",
      titulo: "Micrófono",
      porQue: "Solo cuando tú lo pides: llamadas, transmisiones y grabaciones.",
      como: "por-uso",
      lectura: "parcial",
      fase: 1,
      desde: 1,
      funciones: ["llamadas"],
      nota: "iOS Safari pregunta al usar getUserMedia.",
      enlace: {
        nivel: "ficha-app",
        pantalla: "Ajustes > StarSeed OS > Permisos",
        pulsa: "Activa «Micrófono» en la lista de permisos de la app.",
      },
      distinguirFaltaDeDenegado:
        "Si `navigator.permissions.query({name:'microphone'})` dice `prompt` = falta; `denied` = denegado a mano.",
    },
    {
      id: "camara",
      grupo: "audio-video",
      titulo: "Cámara",
      porQue: "Solo cuando tú lo pides: videollamadas, transmisiones y grabaciones.",
      como: "por-uso",
      lectura: "parcial",
      fase: 1,
      desde: 1,
      funciones: ["llamadas"],
      nota: "iOS Safari pregunta al usar getUserMedia.",
      enlace: {
        nivel: "ficha-app",
        pantalla: "Ajustes > StarSeed OS > Permisos",
        pulsa: "Activa «Cámara» en la lista de permisos de la app.",
      },
      distinguirFaltaDeDenegado: "Igual que micrófono.",
    },
    {
      id: "pantalla",
      grupo: "pantalla-control",
      titulo: "Compartir pantalla",
      porQue: "Para compartir tu pantalla en llamadas (getDisplayMedia).",
      como: "por-uso",
      lectura: "no",
      fase: 2,
      desde: 1,
      funciones: ["compartir-pantalla"],
      nota: "iOS 15+ soporta getDisplayMedia en Safari; PWA instalada también.",
      enlace: {
        nivel: "aviso-sistema",
        pantalla: "Selector de compartición de iOS Safari",
        pulsa: "Elige «Pantalla» o «Ventana» y pulsa «Iniciar transmisión».",
      },
      distinguirFaltaDeDenegado:
        "Cada sesión es nueva. `navigator.permissions.query({name:'display-capture'})` no está implementado en Safari.",
    },
    {
      id: "ubicacion",
      grupo: "ubicacion-red",
      titulo: "Ubicación (mapa)",
      porQue: "Para situar este aparato en el mapa de Señales y en «Usar mi ubicación».",
      como: "por-uso",
      lectura: "parcial",
      fase: 1,
      desde: 1,
      opcional: true,
      funciones: ["mapa-senales"],
      nota: "iOS pregunta «Permitir mientras se usa la app» / «Permitir una vez» / «No permitir».",
      enlace: {
        nivel: "ficha-app",
        pantalla: "Ajustes > StarSeed OS > Permisos",
        pulsa: "Activa «Ubicación» y elige «Mientras se usa la app» o «Siempre».",
      },
      distinguirFaltaDeDenegado:
        "Si `navigator.permissions.query({name:'geolocation'})` dice `prompt` = falta; `denied` = denegado a mano.",
    },
    {
      id: "ubicacion-wifi",
      grupo: "ubicacion-red",
      titulo: "Ubicación (nombres de Wi-Fi)",
      porQue: "En iOS es el mismo permiso que «Ubicación (mapa)».",
      como: "por-uso",
      lectura: "parcial",
      fase: 1,
      desde: 1,
      opcional: true,
      funciones: ["malla-radios"],
      nota: "Mismo permiso que ubicacion.",
      enlace: {
        nivel: "ficha-app",
        pantalla: "Ajustes > StarSeed OS > Permisos",
        pulsa: "Ver «Ubicación (mapa)».",
      },
      distinguirFaltaDeDenegado: "Ver «Ubicación (mapa)».",
    },
    {
      id: "bluetooth",
      grupo: "ubicacion-red",
      titulo: "Bluetooth",
      porQue: "Para Web Bluetooth (BLE) en iOS Safari / PWA.",
      como: "por-uso",
      lectura: "parcial",
      fase: 1,
      desde: 1,
      funciones: ["malla-radios"],
      nota: "iOS requiere interacción de usuario para requestDevice().",
      enlace: {
        nivel: "aviso-sistema",
        pantalla: "Aviso de Web Bluetooth en Safari",
        pulsa: "Pulsa «Permitir» cuando el navegador lo pida al escanear.",
      },
      distinguirFaltaDeDenegado:
        "No hay API de permisos para Bluetooth en Safari. Si requestDevice() rechaza = denegado en esa sesión.",
    },
    {
      id: "red-local",
      grupo: "ubicacion-red",
      titulo: "Red local",
      porQue: "iOS 14+ pide «Red local» para acceso a dispositivos en la red.",
      como: "aviso-sistema",
      lectura: "parcial",
      fase: 1,
      desde: 1,
      funciones: ["malla-radios"],
      nota: "El aviso sale al primer intento de mDNS/SSDP.",
      enlace: {
        nivel: "ficha-app",
        pantalla: "Ajustes > StarSeed OS > Permisos",
        pulsa: "Activa «Red local» en la lista de permisos de la app.",
      },
      distinguirFaltaDeDenegado:
        "Si el aviso no salió = falta; si salió y se denegó = denegado a mano (se ve en Ajustes > StarSeed OS > Red local).",
    },
    {
      id: "notificaciones",
      grupo: "comunicacion",
      titulo: "Notificaciones",
      porQue: "Para avisarte de mensajes y llamadas aunque la ventana esté cerrada.",
      como: "aviso-sistema",
      lectura: "parcial",
      fase: 1,
      desde: 1,
      funciones: ["avisos", "llamadas"],
      nota: "PWA instalada y web push en Safari 16.4+.",
      enlace: {
        nivel: "ficha-app",
        pantalla: "Ajustes > StarSeed OS > Permisos / Notificaciones",
        pulsa: "Activa «Permitir notificaciones».",
      },
      distinguirFaltaDeDenegado:
        "Si `Notification.permission` es `default` = falta; `denied` = denegado a mano.",
    },
    {
      id: "nfc",
      grupo: "ubicacion-red",
      titulo: "NFC",
      porQue: "Para enlazar dos aparatos acercándolos (Web NFC en Android; en iOS solo apps nativas).",
      como: "no-aplica",
      lectura: "no-aplica",
      fase: 6,
      desde: 3,
      funciones: [],
      nota: "Web NFC no está en iOS Safari.",
      enlace: {
        nivel: "no-hace-falta",
        pantalla: "—",
        pulsa: "iOS no expone NFC a la web/PWA.",
      },
      distinguirFaltaDeDenegado: "No aplica.",
    },
    {
      id: "almacenamiento",
      grupo: "archivos-almacenamiento",
      titulo: "Almacenamiento (File System Access API)",
      porQue: "Para acceder a archivos y carpetas elegidos por la persona.",
      como: "por-uso",
      lectura: "parcial",
      fase: 1,
      desde: 1,
      funciones: ["carpetas-compartidas"],
      nota: "File System Access API no está en iOS Safari; usar file picker nativo.",
      enlace: {
        nivel: "aviso-sistema",
        pantalla: "Selector de archivos de iOS",
        pulsa: "Elige el archivo o carpeta.",
      },
      distinguirFaltaDeDenegado:
        "Cada picker es nuevo. No hay estado persistente.",
    },
    {
      id: "capacidades",
      grupo: "sistema-dispositivo",
      titulo: "Capacidades del aparato",
      porQue: "Procesador, memoria, batería: se leen vía APIs web (Navigator, Battery API).",
      como: "nada-sistema",
      lectura: "si",
      fase: 1,
      desde: 1,
      funciones: ["prestar-proceso"],
      nota: "",
      enlace: {
        nivel: "no-hace-falta",
        pantalla: "—",
        pulsa: "Leer las capacidades del aparato no pide nada.",
      },
      distinguirFaltaDeDenegado: "No aplica.",
    },
    {
      id: "accesibilidad",
      grupo: "pantalla-control",
      titulo: "Accesibilidad / control del aparato",
      porQue: "La web no tiene acceso a controlar otras apps ni leer entrada global.",
      como: "no-aplica",
      lectura: "no-aplica",
      fase: 1,
      desde: 1,
      funciones: [],
      nota: "Solo la app nativa puede pedir esto.",
      enlace: {
        nivel: "no-hace-falta",
        pantalla: "—",
        pulsa: "La web no tiene acceso a controlar otras apps ni leer entrada global.",
      },
      distinguirFaltaDeDenegado: "No aplica: la web no pide este permiso.",
    },
  ];
}