/**
 * Matriz de permisos por medio — Módulo PURO
 * Contrato PRM1119 · Fuente de verdad para «qué pedir al instalar y al abrir»
 * No importa node:*, no lanza procesos, sin red, sin disco.
 */

export type Medio =
  | "macos"
  | "windows"
  | "linux-x11"
  | "linux-wayland"
  | "android"
  | "ios"
  | "web-chrome"
  | "web-firefox"
  | "web-safari"
  | "web-embedded"
  | "terminal";

export type PermisoId =
  | "microfono"
  | "camara"
  | "pantalla"
  | "accesibilidad"
  | "monitor-entrada"
  | "ubicacion"
  | "ubicacion-wifi"
  | "cercanos"
  | "bluetooth"
  | "red-local"
  | "nfc"
  | "notificaciones"
  | "llamadas"
  | "almacenamiento"
  | "archivos"
  | "carpetas"
  | "disco-completo"
  | "todos-archivos"
  | "segundo-plano"
  | "arranque"
  | "bateria"
  | "superposicion"
  | "automatizacion"
  | "no-molestar"
  | "escribir-ajustes"
  | "instalar"
  | "capacidades";

export type EstadoSistema = "concedido" | "denegado" | "sin-preguntar" | "no-concedido" | "desconocido" | "no-aplica";

export type ComoSePide = "aviso" | "aviso-y-panel" | "panel" | "por-uso" | "declaracion" | "nada";

export type AccionPermiso = "pedir" | "abrir-ajustes" | "por-uso" | "nada" | "mas-adelante" | "listo";

export interface DefPermisoMedio {
  id: PermisoId;
  titulo: string;
  porQue: string;
  como: ComoSePide;
  lectura: "si" | "parcial" | "no";
  fase: number;
  opcional?: boolean;
  funciones: string[];
  nota?: string;
  /** Enlace a ajustes en este medio (null = no hay enlace fiable) */
  enlace: EnlaceAjustes | null;
}

export interface EnlaceAjustes {
  nivel: "directo" | "lista" | "ficha" | "aviso" | "sin-enlace" | "no-hace-falta";
  pantalla: string;
  pulsa: string;
}

export interface EstadoPermisoMedio {
  permiso: PermisoId;
  estado: EstadoSistema;
  accion: AccionPermiso;
  /** true si el aviso del sistema YA salió una vez (macOS no lo repite) */
  yaPedido: boolean;
  /** Texto honesto para la UI */
  texto: string;
  /** Si hay botón «Abrir ajustes» (solo si la acción lo requiere y hay enlace) */
  hayBotonAjustes: boolean;
  /** Enlace a ajustes (para mostrar en UI) */
  enlace: EnlaceAjustes | null;
}

export const FASE_ACTUAL = 1;

/** Detecta el medio actual (lado cliente, SSR-safe). */
export function detectarMedio(): Medio {
  if (typeof navigator === "undefined") return "terminal";
  const ua = navigator.userAgent;
  if (/Tauri\//i.test(ua) || (typeof window !== "undefined" && "__TAURI__" in window)) {
    if (/Mac/i.test(ua)) return "macos";
    if (/Win/i.test(ua)) return "windows";
    if (/Linux/i.test(ua)) return (typeof navigator !== "undefined" && "deviceMemory" in navigator) ? "linux-wayland" : "linux-x11";
  }
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Edg\//.test(ua)) return "web-chrome";
  if (/Chrome\//.test(ua)) return "web-chrome";
  if (/Firefox\//.test(ua)) return "web-firefox";
  if (/Safari\//.test(ua)) return "web-safari";
  if (/Claude\//.test(ua) || /Electron\//.test(ua)) return "web-embedded";
  return "web-chrome";
}

/** Normaliza estado crudo del sistema al vocabulario canónico. */
export function normalizarEstadoSistema(raw: unknown, medio: Medio, permiso: PermisoId): EstadoSistema {
  if (typeof raw !== "string") return "desconocido";
  const r = raw.toLowerCase();
  if (["granted", "allowed", "authorized", "concedido", "enabled"].includes(r)) return "concedido";
  if (["denied", "blocked", "rejected", "denegado", "disabled"].includes(r)) return "denegado";
  if (["prompt", "default", "ask", "sin-preguntar", "unasked"].includes(r)) return "sin-preguntar";
  if (["unsupported", "unavailable", "no-disponible", "n/a"].includes(r)) return "no-aplica";
  return "desconocido";
}

/** Decide la acción para un permiso en un medio dado su estado y si ya se pidió. */
export function accionPara(
  def: DefPermisoMedio,
  estado: EstadoSistema,
  yaPedido: boolean
): AccionPermiso {
  if (estado === "concedido" || estado === "no-aplica") return "listo";
  if (def.fase > FASE_ACTUAL) return "mas-adelante";
  switch (def.como) {
    case "nada":
    case "declaracion":
      return "nada";
    case "por-uso":
      return "por-uso";
    case "panel":
      return "abrir-ajustes";
    case "aviso-y-panel":
      return yaPedido || estado === "denegado" ? "abrir-ajustes" : "pedir";
    case "aviso":
      return estado === "denegado" ? "abrir-ajustes" : "pedir";
  }
}

/** Texto honesto para la UI según acción y estado. */
export function textoPara(def: DefPermisoMedio, estado: EstadoSistema, accion: AccionPermiso): string {
  if (accion === "mas-adelante") return `Llega con la fase ${def.fase}: aún no se pide`;
  if (estado === "concedido") return "Concedido";
  if (estado === "no-aplica") return "Este medio no lo pide";
  if (accion === "nada") return "Nada que hacer";
  if (accion === "por-uso") return "El sistema lo pregunta al usarlo";
  if (estado === "denegado") return "Denegado: se cambia en Ajustes";
  if (def.lectura === "no") return "El sistema no deja saber su estado";
  if (estado === "desconocido" || estado === "sin-preguntar") return "Sin preguntar";
  if (estado === "no-concedido") return "Sin conceder";
  return "Pendiente";
}

/** ¿Hay botón «Abrir ajustes»? */
export function hayBotonAjustes(enlace: EnlaceAjustes | null): boolean {
  return !!enlace && ["directo", "lista", "ficha"].includes(enlace.nivel);
}

/* ═══════════════════════════════════════════════════════════════════════════
   CATÁLOGO BASE DE PERMISOS (común a todos los medios)
   ═══════════════════════════════════════════════════════════════════════════ */

const BASE_PERMISOS: Record<PermisoId, Omit<DefPermisoMedio, "id" | "como" | "lectura" | "fase" | "enlace" | "opcional" | "nota">> = {
  microfono: { titulo: "Micrófono", porQue: "Para llamadas, comandos de voz y grabaciones", funciones: ["llamadas", "voz"] },
  camara: { titulo: "Cámara", porQue: "Para videollamadas, visión y grabaciones", funciones: ["videollamadas", "vision"] },
  pantalla: { titulo: "Grabación de pantalla", porQue: "Para compartir pantalla en llamadas, prestar ventana, que Astraura vea", funciones: ["compartir-pantalla", "prestar-ventana", "astraura-ve"] },
  accesibilidad: { titulo: "Accesibilidad (controlar el aparato)", porQue: "Para que otras neuronas y Astraura puedan pulsar y escribir aquí", funciones: ["control-entre-neuronas", "astraura-actua", "prestar-ventana"] },
  "monitor-entrada": { titulo: "Monitorización de entrada", porQue: "Para detectar uso de teclado/ratón y pausar control remoto", funciones: ["control-entre-neuronas", "astraura-actua"] },
  ubicacion: { titulo: "Ubicación (mapa)", porQue: "Para situar este aparato en el mapa de Señales y «Usar mi ubicación»", funciones: ["mapa-senales"] },
  "ubicacion-wifi": { titulo: "Ubicación (nombres de Wi-Fi)", porQue: "Para ver SSID de redes cercanas y conexión directa con Android", funciones: ["malla-radios"] },
  cercanos: { titulo: "Dispositivos cercanos", porQue: "Para anunciarse y conectar por Bluetooth y Wi-Fi P2P", funciones: ["malla-radios", "llamadas"] },
  bluetooth: { titulo: "Bluetooth", porQue: "Para hablar directamente con otras neuronas cercanas sin Wi-Fi ni internet", funciones: ["malla-radios", "llamadas"] },
  "red-local": { titulo: "Red local", porQue: "Para encontrar otras neuronas en esta red sin internet", funciones: ["malla-radios", "llamadas", "control-entre-neuronas"] },
  nfc: { titulo: "NFC", porQue: "Para enlazar dos aparatos acercándolos", funciones: ["malla-radios"] },
  notificaciones: { titulo: "Notificaciones", porQue: "Para avisar de mensajes y llamadas con la app cerrada", funciones: ["avisos", "llamadas"] },
  llamadas: { titulo: "Llamadas en pantalla de bloqueo", porQue: "Para que la llamada aparezca a pantalla completa con el teléfono bloqueado", funciones: ["llamadas"] },
  almacenamiento: { titulo: "Almacenamiento persistente", porQue: "Para que los datos persistan en el navegador (IndexedDB, Cache)", funciones: ["persistencia"] },
  archivos: { titulo: "Archivos (carpetas)", porQue: "Para acceder a carpetas que elijas con el selector del navegador", funciones: ["archivos-compartidos"] },
  carpetas: { titulo: "Carpetas protegidas", porQue: "Para acceder a Escritorio, Documentos, Descargas (pide confirmación)", funciones: ["carpetas-compartidas"] },
  "disco-completo": { titulo: "Acceso total al disco", porQue: "Para compartir cualquier carpeta o volumen sin elegir una a una", funciones: ["carpetas-compartidas"] },
  "todos-archivos": { titulo: "Acceso a todos los archivos", porQue: "Para compartir cualquier carpeta o memoria del aparato", funciones: ["carpetas-compartidas"] },
  "segundo-plano": { titulo: "Ejecución en segundo plano", porQue: "Para que la neurona siga viva con la pantalla apagada", funciones: ["siempre-disponible", "malla-radios"] },
  arranque: { titulo: "Autoarranque al iniciar sesión", porQue: "Para que la neurona esté disponible sin abrir la app manualmente", funciones: ["siempre-disponible", "avisos"] },
  bateria: { titulo: "Sin límite de batería", porQue: "Para que las antenas sigan vivas con la pantalla apagada", funciones: ["siempre-disponible", "malla-radios"] },
  superposicion: { titulo: "Mostrar sobre otras apps", porQue: "Para enseñar el aviso «te están controlando» y la orbe de Astraura", funciones: ["control-entre-neuronas", "astraura-actua"] },
  automatizacion: { titulo: "Automatización de otras apps", porQue: "Para que Astraura pida acciones a otras apps (Música, Finder...)", funciones: ["astraura-actua"] },
  "no-molestar": { titulo: "Acceso a No Molestar", porQue: "Para que el centro de control encienda/apague No Molestar real", funciones: ["centro-control-nativo"] },
  "escribir-ajustes": { titulo: "Modificar ajustes del sistema", porQue: "Para que el centro de control cambie el brillo real de la pantalla", funciones: ["centro-control-nativo"] },
  instalar: { titulo: "Instalar apps de fuentes desconocidas", porQue: "Para auto-actualización desde el canal de StarSeed", funciones: ["actualizacion-sola"] },
  capacidades: { titulo: "Capacidades del aparato", porQue: "CPU, RAM, disco, batería, temperatura: se leen sin pedir nada", funciones: ["prestar-proceso"] },
};

/* ═══════════════════════════════════════════════════════════════════════════
   ESPECÍFICOS POR MEDIO (cómo se pide, lectura, fase, enlace, nota)
   ═══════════════════════════════════════════════════════════════════════════ */

type EspMedio = Partial<Record<PermisoId, {
  como: ComoSePide;
  lectura: "si" | "parcial" | "no";
  fase: number;
  opcional?: boolean;
  nota?: string;
  titulo?: string;
  porQue?: string;
  enlace: EnlaceAjustes | null;
}>>;

const MACOS: EspMedio = {
  microfono: { como: "aviso", lectura: "si", fase: 1, enlace: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Micrófono", pulsa: "Activa el interruptor de StarSeed OS." } },
  camara: { como: "aviso", lectura: "si", fase: 1, enlace: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Cámara", pulsa: "Activa el interruptor de StarSeed OS." } },
  pantalla: { como: "aviso-y-panel", lectura: "si", fase: 1, opcional: true, enlace: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Grabación de pantalla y audio del sistema", pulsa: "Activa el interruptor de StarSeed OS y, si macOS lo pide, pulsa «Salir y volver a abrir»." } },
  accesibilidad: { como: "aviso-y-panel", lectura: "si", fase: 1, opcional: true, enlace: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Accesibilidad", pulsa: "Activa el interruptor de StarSeed OS (te pedirá tu contraseña o Touch ID)." } },
  "monitor-entrada": { como: "aviso-y-panel", lectura: "si", fase: 3, enlace: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Monitorización de entrada", pulsa: "Activa el interruptor de StarSeed OS." } },
  ubicacion: { como: "por-uso", lectura: "si", fase: 1, opcional: true, nota: "Mismo permiso «Localización» que nombres de Wi-Fi. Aviso al pulsar «Usar mi ubicación».", enlace: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Localización", pulsa: "Activa «Localización» arriba y el interruptor de StarSeed OS." } },
  "ubicacion-wifi": { como: "aviso", lectura: "si", fase: 1, opcional: true, enlace: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Localización", pulsa: "Activa «Localización» arriba y el interruptor de StarSeed OS." } },
  cercanos: { como: "nada", lectura: "no", fase: 1, nota: "En macOS usa bluetooth + red-local", enlace: null },
  bluetooth: { como: "aviso", lectura: "si", fase: 1, enlace: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Bluetooth", pulsa: "Activa el interruptor de StarSeed OS." } },
  "red-local": { como: "aviso", lectura: "parcial", fase: 1, nota: "macOS 15+ lo pide; se deduce si malla local responde", enlace: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Red local", pulsa: "Activa el interruptor de StarSeed OS." } },
  nfc: { como: "nada", lectura: "no", fase: 1, nota: "No disponible en macOS", enlace: null },
  notificaciones: { como: "aviso", lectura: "parcial", fase: 1, enlace: { nivel: "lista", pantalla: "Ajustes del Sistema › Notificaciones", pulsa: "Busca StarSeed OS y activa «Permitir notificaciones»." } },
  llamadas: { como: "nada", lectura: "no", fase: 1, nota: "No existe en macOS", enlace: null },
  almacenamiento: { como: "aviso", lectura: "si", fase: 1, enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "El navegador decide la persistencia." } },
  archivos: { como: "por-uso", lectura: "no", fase: 1, nota: "File System Access en Chromium; Safari/Firefox no lo tienen", enlace: { nivel: "sin-enlace", pantalla: "Selector nativo del navegador", pulsa: "Elige la carpeta cada vez." } },
  carpetas: { como: "por-uso", lectura: "no", fase: 1, enlace: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Archivos y carpetas", pulsa: "Activa las carpetas que quieras bajo StarSeed OS." } },
  "disco-completo": { como: "panel", lectura: "no", fase: 6, nota: "macOS no deja saber si se dio: se ve por lo que se abre", enlace: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Acceso total al disco", pulsa: "Activa el interruptor de StarSeed OS y reabre la app." } },
  "todos-archivos": { como: "nada", lectura: "no", fase: 1, nota: "No aplica en macOS (usa disco-completo)", enlace: null },
  "segundo-plano": { como: "aviso", lectura: "si", fase: 1, opcional: true, nota: "App nativa: LSUIElement + performExpiringActivity", enlace: { nivel: "sin-enlace", pantalla: "Código de la app", pulsa: "No hay pantalla de usuario." } },
  arranque: { como: "aviso", lectura: "si", fase: 1, opcional: true, enlace: { nivel: "lista", pantalla: "Ajustes del Sistema › General › Ítems de inicio", pulsa: "En «Permitir en segundo plano» activa StarSeed OS." } },
  bateria: { como: "aviso", lectura: "si", fase: 1, opcional: true, nota: "performExpiringActivity + avisos de batería", enlace: { nivel: "sin-enlace", pantalla: "Código de la app", pulsa: "No hay pantalla de usuario." } },
  superposicion: { como: "nada", lectura: "no", fase: 1, nota: "No aplica en macOS", enlace: null },
  automatizacion: { como: "por-uso", lectura: "no", fase: 4, nota: "macOS pregunta app por app al usarla", enlace: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Automatización", pulsa: "Se rellena sola la primera vez que StarSeed maneja otra app." } },
  "no-molestar": { como: "nada", lectura: "no", fase: 1, nota: "Se gestiona por Shortcuts/Focus, no permiso de app", enlace: null },
  "escribir-ajustes": { como: "nada", lectura: "no", fase: 1, nota: "No aplica en macOS", enlace: null },
  instalar: { como: "nada", lectura: "no", fase: 1, nota: "App firmada y notarizada; actualización vía Sparkle", enlace: null },
  capacidades: { como: "nada", lectura: "si", fase: 1, enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Se leen sin pedir nada (sysctl, IOKit)." } },
};

const WINDOWS: EspMedio = {
  microfono: { como: "por-uso", lectura: "no", fase: 1, nota: "Permitido salvo global OFF", enlace: { nivel: "directo", pantalla: "Configuración › Privacidad y seguridad › Micrófono", pulsa: "Activa «Permitir que las apps de escritorio accedan al micrófono»." } },
  camara: { como: "por-uso", lectura: "no", fase: 1, nota: "Permitida salvo global OFF", enlace: { nivel: "directo", pantalla: "Configuración › Privacidad y seguridad › Cámara", pulsa: "Activa «Permitir que las apps de escritorio accedan a la cámara»." } },
  pantalla: { como: "nada", lectura: "si", fase: 1, nota: "Windows no pide permiso; marca con borde la ventana", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Windows no pide permiso para capturar." } },
  accesibilidad: { como: "nada", lectura: "si", fase: 1, nota: "No pide permiso (no llega a admin/login)", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Windows no pide permiso para mandar teclas/clics." } },
  "monitor-entrada": { como: "nada", lectura: "no", fase: 1, nota: "No existe como permiso", enlace: null },
  ubicacion: { como: "por-uso", lectura: "no", fase: 1, opcional: true, nota: "Mapa usa geolocation del navegador", enlace: { nivel: "directo", pantalla: "Configuración › Privacidad y seguridad › Ubicación", pulsa: "Activa «Servicios de ubicación» y «Permitir apps de escritorio»." } },
  "ubicacion-wifi": { como: "por-uso", lectura: "no", fase: 1, opcional: true, nota: "Win 11 24H2+ pide «Ubicación» para ver SSID", enlace: { nivel: "directo", pantalla: "Configuración › Privacidad y seguridad › Ubicación", pulsa: "Activa «Servicios de ubicación» y «Permitir apps de escritorio»." } },
  cercanos: { como: "nada", lectura: "no", fase: 1, nota: "No existe permiso separado", enlace: null },
  bluetooth: { como: "nada", lectura: "si", fase: 1, nota: "Apps escritorio no piden permiso Bluetooth", enlace: { nivel: "directo", pantalla: "Configuración › Bluetooth y dispositivos", pulsa: "Activa «Bluetooth»." } },
  "red-local": { como: "por-uso", lectura: "no", fase: 1, nota: "Firewall pregunta al primer listen", enlace: { nivel: "sin-enlace", pantalla: "Firewall de Windows", pulsa: "Elige «Redes privadas» cuando Windows pregunte." } },
  nfc: { como: "nada", lectura: "no", fase: 1, nota: "No para apps escritorio", enlace: null },
  notificaciones: { como: "nada", lectura: "no", fase: 1, nota: "Activadas por defecto", enlace: { nivel: "directo", pantalla: "Configuración › Sistema › Notificaciones", pulsa: "Activa «Notificaciones» y StarSeed OS en la lista." } },
  llamadas: { como: "nada", lectura: "no", fase: 1, nota: "No existe", enlace: null },
  almacenamiento: { como: "aviso", lectura: "si", fase: 1, enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "El navegador decide." } },
  archivos: { como: "por-uso", lectura: "no", fase: 1, nota: "File System Access en Chromium", enlace: { nivel: "sin-enlace", pantalla: "Selector nativo", pulsa: "Elige la carpeta cada vez." } },
  carpetas: { como: "nada", lectura: "no", fase: 1, nota: "Selector nativo por uso", enlace: null },
  "disco-completo": { como: "nada", lectura: "no", fase: 1, nota: "No existe equivalente", enlace: null },
  "todos-archivos": { como: "nada", lectura: "no", fase: 1, nota: "No aplica", enlace: null },
  "segundo-plano": { como: "aviso", lectura: "si", fase: 1, opcional: true, nota: "Service / Startup task", enlace: { nivel: "sin-enlace", pantalla: "Código de la app", pulsa: "No hay pantalla de usuario." } },
  arranque: { como: "aviso", lectura: "si", fase: 1, opcional: true, enlace: { nivel: "directo", pantalla: "Configuración › Aplicaciones › Inicio", pulsa: "Activa StarSeed OS en la lista." } },
  bateria: { como: "aviso", lectura: "si", fase: 1, opcional: true, nota: "Power Throttling API", enlace: { nivel: "sin-enlace", pantalla: "Código de la app", pulsa: "No hay pantalla de usuario." } },
  superposicion: { como: "nada", lectura: "no", fase: 1, nota: "No aplica", enlace: null },
  automatizacion: { como: "nada", lectura: "no", fase: 1, nota: "No estándar", enlace: null },
  "no-molestar": { como: "nada", lectura: "no", fase: 1, nota: "No acceso app", enlace: null },
  "escribir-ajustes": { como: "nada", lectura: "no", fase: 1, nota: "No aplica", enlace: null },
  instalar: { como: "nada", lectura: "no", fase: 1, nota: "MSIX/Store firmado", enlace: null },
  capacidades: { como: "nada", lectura: "si", fase: 1, enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Se leen sin pedir (WMI, GetSystemInfo)." } },
};

const LINUX_X11: EspMedio = {
  microfono: { como: "nada", lectura: "no", fase: 1, nota: "PulseAudio/PipeWire sin permisos app", enlace: { nivel: "sin-enlace", pantalla: "Ajustes de sonido › Entrada", pulsa: "Si no oye, mira que el micrófono no esté silenciado." } },
  camara: { como: "nada", lectura: "no", fase: 1, nota: "V4L2 sin permisos app", enlace: { nivel: "sin-enlace", pantalla: "Ajustes de privacidad del escritorio", pulsa: "Si no sale, comprueba que no la use otra app." } },
  pantalla: { como: "nada", lectura: "si", fase: 1, nota: "X11: cualquier app ve todo", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "En X11 cualquier app puede ver la pantalla." } },
  accesibilidad: { como: "nada", lectura: "si", fase: 1, nota: "XTEST/X11 permite input", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "En X11 cualquier app puede mandar teclas/clics." } },
  "monitor-entrada": { como: "nada", lectura: "no", fase: 1, nota: "No existe", enlace: null },
  ubicacion: { como: "por-uso", lectura: "parcial", fase: 1, opcional: true, nota: "Geolocation del navegador (si hay Wi-Fi/DB)", enlace: { nivel: "sin-enlace", pantalla: "Configuración del escritorio › Privacidad", pulsa: "Varía por escritorio (GNOME/KDE)." } },
  "ubicacion-wifi": { como: "nada", lectura: "no", fase: 1, nota: "NetworkManager/DBus sin permiso app", enlace: null },
  cercanos: { como: "nada", lectura: "no", fase: 1, nota: "No permiso separado", enlace: null },
  bluetooth: { como: "nada", lectura: "si", fase: 1, enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "BlueZ no pide permiso; solo hace falta Bluetooth encendido." } },
  "red-local": { como: "nada", lectura: "si", fase: 1, enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Linux no pide permiso para red local." } },
  nfc: { como: "nada", lectura: "no", fase: 1, nota: "No estándar", enlace: null },
  notificaciones: { como: "nada", lectura: "no", fase: 1, nota: "libnotify/dbus sin permiso", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Linux no pide permiso para notificaciones." } },
  llamadas: { como: "nada", lectura: "no", fase: 1, nota: "No existe", enlace: null },
  almacenamiento: { como: "aviso", lectura: "si", fase: 1, enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "El navegador decide." } },
  archivos: { como: "por-uso", lectura: "no", fase: 1, nota: "File System Access en Chromium", enlace: { nivel: "sin-enlace", pantalla: "Selector nativo", pulsa: "Elige la carpeta cada vez." } },
  carpetas: { como: "nada", lectura: "no", fase: 1, nota: "No pide", enlace: null },
  "disco-completo": { como: "nada", lectura: "no", fase: 1, nota: "No existe", enlace: null },
  "todos-archivos": { como: "nada", lectura: "no", fase: 1, nota: "No aplica", enlace: null },
  "segundo-plano": { como: "aviso", lectura: "si", fase: 1, opcional: true, nota: "systemd/user service o autostart", enlace: { nivel: "sin-enlace", pantalla: "Aplicaciones al inicio del escritorio", pulsa: "StarSeed OS crea entrada en ~/.config/autostart." } },
  arranque: { como: "aviso", lectura: "si", fase: 1, opcional: true, enlace: { nivel: "sin-enlace", pantalla: "Aplicaciones al inicio del escritorio", pulsa: "Bórrala desde el gestor de inicio de tu escritorio." } },
  bateria: { como: "aviso", lectura: "si", fase: 1, opcional: true, nota: "systemd-inhibit", enlace: { nivel: "sin-enlace", pantalla: "Código de la app", pulsa: "No hay pantalla de usuario." } },
  superposicion: { como: "nada", lectura: "no", fase: 1, nota: "No aplica", enlace: null },
  automatizacion: { como: "nada", lectura: "no", fase: 1, nota: "D-Bus/portal sin permiso previo", enlace: null },
  "no-molestar": { como: "nada", lectura: "no", fase: 1, nota: "No acceso app", enlace: null },
  "escribir-ajustes": { como: "nada", lectura: "no", fase: 1, nota: "No aplica", enlace: null },
  instalar: { como: "nada", lectura: "no", fase: 1, nota: "Gestor de paquetes del sistema", enlace: null },
  capacidades: { como: "nada", lectura: "si", fase: 1, enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Se leen sin pedir (/proc, /sys, lscpu)." } },
};

const LINUX_WAYLAND: EspMedio = {
  ...LINUX_X11,
  pantalla: { como: "por-uso", lectura: "no", fase: 1, nota: "Wayland pregunta qué compartir cada vez con su selector", enlace: { nivel: "aviso", pantalla: "Selector del portal Wayland (GNOME/KDE)", pulsa: "Elige la pantalla o ventana y pulsa «Compartir»." } },
  accesibilidad: { como: "por-uso", lectura: "no", fase: 3, nota: "Solo por portal Escritorio Remoto, pregunta cada sesión", enlace: { nivel: "aviso", pantalla: "Portal de Escritorio Remoto", pulsa: "Pulsa «Permitir» en cada sesión." } },
};

const ANDROID: EspMedio = {
  microfono: { como: "aviso", lectura: "si", fase: 1, enlace: { nivel: "ficha", pantalla: "Información de la app StarSeed OS", pulsa: "Pulsa «Permisos» › «Micrófono» › «Permitir solo mientras la app está en uso»." } },
  camara: { como: "aviso", lectura: "si", fase: 1, enlace: { nivel: "ficha", pantalla: "Información de la app StarSeed OS", pulsa: "Pulsa «Permisos» › «Cámara» › «Permitir solo mientras la app está en uso»." } },
  pantalla: { como: "por-uso", lectura: "no", fase: 2, nota: "Android pregunta cada vez que empieza a compartirse", enlace: { nivel: "aviso", pantalla: "Diálogo «Grabar pantalla» del sistema", pulsa: "Elige «Pantalla completa» o «Una sola app» y pulsa «Empezar ahora»." } },
  accesibilidad: { como: "panel", lectura: "si", fase: 1, nota: "Android 13+ exige «Permitir ajustes restringidos» antes", enlace: { nivel: "lista", pantalla: "Ajustes › Accesibilidad › Aplicaciones instaladas", pulsa: "Pulsa «StarSeed OS», activa el interruptor y confirma «Permitir». Si sale en gris, antes pulsa ⋮ › «Permitir ajustes restringidos»." } },
  "monitor-entrada": { como: "nada", lectura: "no", fase: 1, nota: "No existe separado", enlace: null },
  ubicacion: { como: "por-uso", lectura: "si", fase: 1, opcional: true, nota: "Android 12+ permite ubicación aproximada", enlace: { nivel: "ficha", pantalla: "Información de la app StarSeed OS", pulsa: "Pulsa «Permisos» › «Ubicación» › «Permitir solo mientras la app está en uso» (y «Usar ubicación precisa» si quieres el punto exacto)." } },
  "ubicacion-wifi": { como: "nada", lectura: "no", fase: 1, nota: "Usa cercanos para Bluetooth/Wi-Fi P2P", enlace: null },
  cercanos: { como: "aviso", lectura: "si", fase: 1, enlace: { nivel: "ficha", pantalla: "Información de la app StarSeed OS", pulsa: "Pulsa «Permisos» › «Dispositivos cercanos» › «Permitir»." } },
  bluetooth: { como: "aviso", lectura: "si", fase: 1, nota: "Incluido en cercanos (BLUETOOTH_CONNECT/SCAN)", enlace: { nivel: "ficha", pantalla: "Información de la app StarSeed OS", pulsa: "Pulsa «Permisos» › «Dispositivos cercanos» › «Permitir»." } },
  "red-local": { como: "declaracion", lectura: "si", fase: 1, nota: "Permisos normales al instalar (CHANGE_WIFI_MULTICAST_STATE, ACCESS_WIFI_STATE)", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Se conceden al instalar la app." } },
  nfc: { como: "declaracion", lectura: "si", fase: 6, nota: "Basta con NFC encendido en el aparato", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "NFC no pide permiso: basta con que esté encendido." } },
  notificaciones: { como: "aviso", lectura: "si", fase: 1, enlace: { nivel: "directo", pantalla: "Ajustes › Aplicaciones › StarSeed OS › Notificaciones", pulsa: "Activa «Permitir notificaciones»." } },
  llamadas: { como: "panel", lectura: "si", fase: 1, opcional: true, enlace: { nivel: "directo", pantalla: "Ajustes › Aplicaciones › Acceso especial › Notificaciones a pantalla completa", pulsa: "Activa «Permitir notificaciones a pantalla completa»." } },
  almacenamiento: { como: "aviso", lectura: "si", fase: 1, enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "El navegador decide." } },
  archivos: { como: "por-uso", lectura: "no", fase: 1, nota: "File System Access en Chrome Android", enlace: { nivel: "sin-enlace", pantalla: "Selector nativo", pulsa: "Elige la carpeta cada vez." } },
  carpetas: { como: "nada", lectura: "no", fase: 1, nota: "Usa todos-archivos", enlace: null },
  "disco-completo": { como: "nada", lectura: "no", fase: 1, nota: "Usa todos-archivos", enlace: null },
  "todos-archivos": { como: "panel", lectura: "si", fase: 6, enlace: { nivel: "directo", pantalla: "Ajustes › Aplicaciones › Acceso especial › Acceso a todos los archivos › StarSeed OS", pulsa: "Activa «Permitir acceso para administrar todos los archivos»." } },
  "segundo-plano": { como: "aviso", lectura: "si", fase: 1, nota: "FOREGROUND_SERVICE + notificación visible", enlace: { nivel: "sin-enlace", pantalla: "Código de la app", pulsa: "Servicio en primer plano con notificación." } },
  arranque: { como: "declaracion", lectura: "si", fase: 1, nota: "RECEIVE_BOOT_COMPLETED se declara en Manifest", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Se concede al instalar." } },
  bateria: { como: "aviso", lectura: "si", fase: 1, opcional: true, enlace: { nivel: "directo", pantalla: "Diálogo «¿Permitir que StarSeed OS ignore las optimizaciones de batería?»", pulsa: "Pulsa «Permitir»." } },
  superposicion: { como: "panel", lectura: "si", fase: 3, enlace: { nivel: "directo", pantalla: "Ajustes › Aplicaciones › Acceso especial › Mostrar sobre otras apps › StarSeed OS", pulsa: "Activa «Permitir mostrar sobre otras apps»." } },
  automatizacion: { como: "nada", lectura: "no", fase: 1, nota: "No estándar", enlace: null },
  "no-molestar": { como: "panel", lectura: "si", fase: 5, enlace: { nivel: "lista", pantalla: "Ajustes › Notificaciones › Acceso a No molestar", pulsa: "Pulsa StarSeed OS y activa «Permitir acceso a No molestar»." } },
  "escribir-ajustes": { como: "panel", lectura: "si", fase: 5, enlace: { nivel: "directo", pantalla: "Ajustes › Aplicaciones › Acceso especial › Modificar ajustes del sistema › StarSeed OS", pulsa: "Activa «Permitir modificar los ajustes del sistema»." } },
  instalar: { como: "panel", lectura: "si", fase: 1, opcional: true, enlace: { nivel: "directo", pantalla: "Ajustes › Aplicaciones › Acceso especial › Instalar apps desconocidas › StarSeed OS", pulsa: "Activa «Permitir desde esta fuente»." } },
  capacidades: { como: "nada", lectura: "si", fase: 1, enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Se leen sin pedir (ActivityManager, BatteryManager)." } },
};

const IOS: EspMedio = {
  microfono: { como: "aviso", lectura: "si", fase: 1, enlace: { nivel: "directo", pantalla: "Ajustes › Safari › Micrófono", pulsa: "Activa para este sitio y recarga." } },
  camara: { como: "aviso", lectura: "si", fase: 1, enlace: { nivel: "directo", pantalla: "Ajustes › Safari › Cámara", pulsa: "Activa para este sitio y recarga." } },
  pantalla: { como: "nada", lectura: "no", fase: 1, nota: "getDisplayMedia no soportado en Safari iOS", enlace: { nivel: "sin-enlace", pantalla: "—", pulsa: "No disponible en PWA iOS." } },
  accesibilidad: { como: "nada", lectura: "no", fase: 1, nota: "No disponible en PWA", enlace: null },
  "monitor-entrada": { como: "nada", lectura: "no", fase: 1, nota: "No existe", enlace: null },
  ubicacion: { como: "por-uso", lectura: "si", fase: 1, opcional: true, enlace: { nivel: "directo", pantalla: "Ajustes › Safari › Ubicación", pulsa: "Activa para este sitio." } },
  "ubicacion-wifi": { como: "nada", lectura: "no", fase: 1, nota: "No aplica", enlace: null },
  cercanos: { como: "nada", lectura: "no", fase: 1, nota: "No en PWA", enlace: null },
  bluetooth: { como: "nada", lectura: "no", fase: 1, nota: "Web Bluetooth no en Safari iOS", enlace: null },
  "red-local": { como: "aviso", lectura: "si", fase: 1, nota: "NSLocalNetworkUsageDescription al instalar/primer uso", enlace: { nivel: "directo", pantalla: "Ajustes › StarSeed OS › Red local", pulsa: "Activa el interruptor." } },
  nfc: { como: "nada", lectura: "no", fase: 1, nota: "No en PWA", enlace: null },
  notificaciones: { como: "aviso", lectura: "si", fase: 1, enlace: { nivel: "directo", pantalla: "Ajustes › Notificaciones › StarSeed OS", pulsa: "Activa «Permitir notificaciones»." } },
  llamadas: { como: "nada", lectura: "no", fase: 1, nota: "No en PWA", enlace: null },
  almacenamiento: { como: "aviso", lectura: "si", fase: 1, enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "El navegador decide." } },
  archivos: { como: "nada", lectura: "no", fase: 1, nota: "showDirectoryPicker no existe en Safari iOS", enlace: { nivel: "sin-enlace", pantalla: "—", pulsa: "Usa «subir carpeta» (<input webkitdirectory>) o backend de la neurona." } },
  carpetas: { como: "nada", lectura: "no", fase: 1, nota: "No aplica", enlace: null },
  "disco-completo": { como: "nada", lectura: "no", fase: 1, nota: "No aplica", enlace: null },
  "todos-archivos": { como: "nada", lectura: "no", fase: 1, nota: "No aplica", enlace: null },
  "segundo-plano": { como: "nada", lectura: "no", fase: 1, nota: "PWA no corre en segundo plano", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No disponible en PWA iOS." } },
  arranque: { como: "nada", lectura: "no", fase: 1, nota: "PWA no arranca con el sistema", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No disponible en PWA iOS." } },
  bateria: { como: "nada", lectura: "no", fase: 1, nota: "No en PWA", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No disponible en PWA iOS." } },
  superposicion: { como: "nada", lectura: "no", fase: 1, nota: "No aplica", enlace: null },
  automatizacion: { como: "nada", lectura: "no", fase: 1, nota: "No en PWA", enlace: null },
  "no-molestar": { como: "nada", lectura: "no", fase: 1, nota: "No acceso app", enlace: null },
  "escribir-ajustes": { como: "nada", lectura: "no", fase: 1, nota: "No aplica", enlace: null },
  instalar: { como: "nada", lectura: "no", fase: 1, nota: "No app nativa firmada; se usa PWA", enlace: null },
  capacidades: { como: "nada", lectura: "parcial", fase: 1, nota: "Solo deviceMemory, hardwareConcurrency, battery API", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Lo que expone Safari." } },
};

const WEB_CHROME: EspMedio = {
  microfono: { como: "aviso", lectura: "si", fase: 1, enlace: { nivel: "directo", pantalla: "🔒 › Configuración del sitio › Micrófono", pulsa: "Cambia a «Permitir» y recarga." } },
  camara: { como: "aviso", lectura: "si", fase: 1, enlace: { nivel: "directo", pantalla: "🔒 › Configuración del sitio › Cámara", pulsa: "Cambia a «Permitir» y recarga." } },
  pantalla: { como: "aviso", lectura: "parcial", fase: 1, enlace: { nivel: "directo", pantalla: "🔒 › Configuración del sitio › Pantalla", pulsa: "Cambia a «Permitir» (si se dio antes) y recarga." } },
  accesibilidad: { como: "nada", lectura: "no", fase: 1, nota: "No en web", enlace: null },
  "monitor-entrada": { como: "nada", lectura: "no", fase: 1, nota: "No en web", enlace: null },
  ubicacion: { como: "por-uso", lectura: "si", fase: 1, opcional: true, enlace: { nivel: "directo", pantalla: "🔒 › Configuración del sitio › Ubicación", pulsa: "Cambia a «Permitir» y recarga." } },
  "ubicacion-wifi": { como: "nada", lectura: "no", fase: 1, nota: "Web no ve SSID", enlace: null },
  cercanos: { como: "nada", lectura: "no", fase: 1, nota: "Web Bluetooth pide por dispositivo", enlace: { nivel: "aviso", pantalla: "Selector de dispositivo Web Bluetooth", pulsa: "Elige el dispositivo cada vez." } },
  bluetooth: { como: "aviso", lectura: "parcial", fase: 1, nota: "Web Bluetooth: selector por dispositivo", enlace: { nivel: "aviso", pantalla: "Selector de dispositivo Web Bluetooth", pulsa: "Elige el dispositivo cada vez." } },
  "red-local": { como: "nada", lectura: "no", fase: 1, nota: "Web no tiene mDNS/UPnP", enlace: null },
  nfc: { como: "aviso", lectura: "no", fase: 1, nota: "Web NFC solo Chrome Android, origen seguro", enlace: { nivel: "aviso", pantalla: "Selector Web NFC", pulsa: "Acerca la etiqueta cada vez." } },
  notificaciones: { como: "aviso", lectura: "si", fase: 1, enlace: { nivel: "directo", pantalla: "🔒 › Configuración del sitio › Notificaciones", pulsa: "Cambia a «Permitir» y recarga." } },
  llamadas: { como: "nada", lectura: "no", fase: 1, nota: "No estándar web", enlace: null },
  almacenamiento: { como: "aviso", lectura: "si", fase: 1, enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "El navegador decide la persistencia." } },
  archivos: { como: "por-uso", lectura: "no", fase: 1, nota: "File System Access (Chromium)", enlace: { nivel: "sin-enlace", pantalla: "Selector nativo showDirectoryPicker()", pulsa: "Elige la carpeta cada vez." } },
  carpetas: { como: "nada", lectura: "no", fase: 1, nota: "FSA elige cualquier carpeta", enlace: null },
  "disco-completo": { como: "nada", lectura: "no", fase: 1, nota: "No en web", enlace: null },
  "todos-archivos": { como: "nada", lectura: "no", fase: 1, nota: "No en web", enlace: null },
  "segundo-plano": { como: "nada", lectura: "no", fase: 1, nota: "Service Worker limitado", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No corre en segundo plano real." } },
  arranque: { como: "nada", lectura: "no", fase: 1, nota: "PWA no arranca con sistema", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No disponible en web." } },
  bateria: { como: "nada", lectura: "no", fase: 1, nota: "Battery API (solo lectura)", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Solo lectura, no permiso." } },
  superposicion: { como: "nada", lectura: "no", fase: 1, nota: "No en web", enlace: null },
  automatizacion: { como: "nada", lectura: "no", fase: 1, nota: "No en web", enlace: null },
  "no-molestar": { como: "nada", lectura: "no", fase: 1, nota: "No en web", enlace: null },
  "escribir-ajustes": { como: "nada", lectura: "no", fase: 1, nota: "No en web", enlace: null },
  instalar: { como: "nada", lectura: "no", fase: 1, nota: "PWA se instala desde el navegador", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Menú › Instalar StarSeed OS." } },
  capacidades: { como: "nada", lectura: "parcial", fase: 1, nota: "deviceMemory, hardwareConcurrency, battery API", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Lo que expone el navegador." } },
};

const WEB_FIREFOX: EspMedio = {
  ...WEB_CHROME,
  microfono: { como: "aviso", lectura: "si", fase: 1, enlace: { nivel: "directo", pantalla: "🛡️ › Permisos › Micrófono", pulsa: "Quita el bloqueo y recarga." } },
  camara: { como: "aviso", lectura: "si", fase: 1, enlace: { nivel: "directo", pantalla: "🛡️ › Permisos › Cámara", pulsa: "Quita el bloqueo y recarga." } },
  pantalla: { como: "aviso", lectura: "parcial", fase: 1, enlace: { nivel: "directo", pantalla: "🛡️ › Permisos › Pantalla", pulsa: "Quita el bloqueo y recarga." } },
  ubicacion: { como: "por-uso", lectura: "si", fase: 1, opcional: true, enlace: { nivel: "directo", pantalla: "🛡️ › Permisos › Ubicación", pulsa: "Quita el bloqueo y recarga." } },
  notificaciones: { como: "aviso", lectura: "si", fase: 1, enlace: { nivel: "directo", pantalla: "🛡️ › Permisos › Notificaciones", pulsa: "Quita el bloqueo y recarga." } },
  archivos: { como: "nada", lectura: "no", fase: 1, nota: "File System Access NO en Firefox", enlace: { nivel: "sin-enlace", pantalla: "—", pulsa: "Usa «subir carpeta» o backend de la neurona." } },
  bluetooth: { como: "nada", lectura: "no", fase: 1, nota: "Web Bluetooth NO en Firefox", enlace: null },
  nfc: { como: "nada", lectura: "no", fase: 1, nota: "Web NFC NO en Firefox", enlace: null },
};

const WEB_SAFARI: EspMedio = {
  ...WEB_CHROME,
  microfono: { como: "aviso", lectura: "si", fase: 1, enlace: { nivel: "directo", pantalla: "Safari › Ajustes › Sitios web › Micrófono", pulsa: "Pon «Permitir» para este sitio y recarga." } },
  camara: { como: "aviso", lectura: "si", fase: 1, enlace: { nivel: "directo", pantalla: "Safari › Ajustes › Sitios web › Cámara", pulsa: "Pon «Permitir» para este sitio y recarga." } },
  pantalla: { como: "aviso", lectura: "parcial", fase: 1, enlace: { nivel: "directo", pantalla: "Safari › Ajustes › Sitios web › Pantalla", pulsa: "Pon «Permitir» para este sitio y recarga." } },
  ubicacion: { como: "por-uso", lectura: "si", fase: 1, opcional: true, enlace: { nivel: "directo", pantalla: "Safari › Ajustes › Sitios web › Ubicación", pulsa: "Pon «Permitir» para este sitio y recarga." } },
  notificaciones: { como: "aviso", lectura: "si", fase: 1, enlace: { nivel: "directo", pantalla: "Safari › Ajustes › Sitios web › Notificaciones", pulsa: "Pon «Permitir» para este sitio y recarga." } },
  archivos: { como: "nada", lectura: "no", fase: 1, nota: "File System Access NO en Safari", enlace: { nivel: "sin-enlace", pantalla: "—", pulsa: "Usa «subir carpeta» o backend de la neurona." } },
  bluetooth: { como: "nada", lectura: "no", fase: 1, nota: "Web Bluetooth NO en Safari", enlace: null },
  nfc: { como: "nada", lectura: "no", fase: 1, nota: "Web NFC NO en Safari", enlace: null },
};

const WEB_EMBEDDED: EspMedio = {
  microfono: { como: "nada", lectura: "no", fase: 1, nota: "Visor no muestra diálogos", enlace: { nivel: "aviso", pantalla: "Aviso del visor", pulsa: "Abre en tu navegador y concédelo allí." } },
  camara: { como: "nada", lectura: "no", fase: 1, nota: "Visor no muestra diálogos", enlace: { nivel: "aviso", pantalla: "Aviso del visor", pulsa: "Abre en tu navegador y concédelo allí." } },
  pantalla: { como: "nada", lectura: "no", fase: 1, nota: "Visor no muestra diálogos", enlace: { nivel: "aviso", pantalla: "Aviso del visor", pulsa: "Abre en tu navegador y concédelo allí." } },
  accesibilidad: { como: "nada", lectura: "no", fase: 1, nota: "No en web", enlace: null },
  "monitor-entrada": { como: "nada", lectura: "no", fase: 1, nota: "No en web", enlace: null },
  ubicacion: { como: "nada", lectura: "no", fase: 1, nota: "Visor no muestra diálogos", enlace: { nivel: "aviso", pantalla: "Aviso del visor", pulsa: "Abre en tu navegador y concédelo allí." } },
  "ubicacion-wifi": { como: "nada", lectura: "no", fase: 1, nota: "No en web", enlace: null },
  cercanos: { como: "nada", lectura: "no", fase: 1, nota: "No en visor", enlace: null },
  bluetooth: { como: "nada", lectura: "no", fase: 1, nota: "No en visor", enlace: null },
  "red-local": { como: "nada", lectura: "no", fase: 1, nota: "No en web", enlace: null },
  nfc: { como: "nada", lectura: "no", fase: 1, nota: "No en visor", enlace: null },
  notificaciones: { como: "nada", lectura: "no", fase: 1, nota: "Visor no muestra diálogos", enlace: { nivel: "aviso", pantalla: "Aviso del visor", pulsa: "Abre en tu navegador y concédelo allí." } },
  llamadas: { como: "nada", lectura: "no", fase: 1, nota: "No en web", enlace: null },
  almacenamiento: { como: "aviso", lectura: "si", fase: 1, nota: "Persistencia puede funcionar", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "El navegador decide." } },
  archivos: { como: "nada", lectura: "no", fase: 1, nota: "FSA no en visor", enlace: { nivel: "aviso", pantalla: "Aviso del visor", pulsa: "Abre en tu navegador." } },
  carpetas: { como: "nada", lectura: "no", fase: 1, nota: "No en web", enlace: null },
  "disco-completo": { como: "nada", lectura: "no", fase: 1, nota: "No en web", enlace: null },
  "todos-archivos": { como: "nada", lectura: "no", fase: 1, nota: "No en web", enlace: null },
  "segundo-plano": { como: "nada", lectura: "no", fase: 1, nota: "No en visor", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No disponible." } },
  arranque: { como: "nada", lectura: "no", fase: 1, nota: "No en visor", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No disponible." } },
  bateria: { como: "nada", lectura: "no", fase: 1, nota: "No en visor", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No disponible." } },
  superposicion: { como: "nada", lectura: "no", fase: 1, nota: "No en web", enlace: null },
  automatizacion: { como: "nada", lectura: "no", fase: 1, nota: "No en web", enlace: null },
  "no-molestar": { como: "nada", lectura: "no", fase: 1, nota: "No en web", enlace: null },
  "escribir-ajustes": { como: "nada", lectura: "no", fase: 1, nota: "No en web", enlace: null },
  instalar: { como: "nada", lectura: "no", fase: 1, nota: "No en visor", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No disponible." } },
  capacidades: { como: "nada", lectura: "parcial", fase: 1, nota: "Lo que expone el navegador del visor", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Lo que expone el navegador." } },
};

const TERMINAL: EspMedio = {
  microfono: { como: "nada", lectura: "no", fase: 1, nota: "Sin interfaz gráfica", enlace: null },
  camara: { como: "nada", lectura: "no", fase: 1, nota: "Sin interfaz gráfica", enlace: null },
  pantalla: { como: "nada", lectura: "no", fase: 1, nota: "Sin interfaz gráfica", enlace: null },
  accesibilidad: { como: "nada", lectura: "no", fase: 1, nota: "Sin interfaz gráfica", enlace: null },
  "monitor-entrada": { como: "nada", lectura: "no", fase: 1, nota: "Sin interfaz gráfica", enlace: null },
  ubicacion: { como: "nada", lectura: "no", fase: 1, nota: "Sin interfaz gráfica", enlace: null },
  "ubicacion-wifi": { como: "nada", lectura: "no", fase: 1, nota: "Sin interfaz gráfica", enlace: null },
  cercanos: { como: "nada", lectura: "no", fase: 1, nota: "Sin interfaz gráfica", enlace: null },
  bluetooth: { como: "nada", lectura: "no", fase: 1, nota: "Sin interfaz gráfica", enlace: null },
  "red-local": { como: "nada", lectura: "no", fase: 1, nota: "Sin interfaz gráfica", enlace: null },
  nfc: { como: "nada", lectura: "no", fase: 1, nota: "Sin interfaz gráfica", enlace: null },
  notificaciones: { como: "nada", lectura: "no", fase: 1, nota: "Sin interfaz gráfica", enlace: null },
  llamadas: { como: "nada", lectura: "no", fase: 1, nota: "Sin interfaz gráfica", enlace: null },
  almacenamiento: { como: "nada", lectura: "no", fase: 1, nota: "FS nativo", enlace: null },
  archivos: { como: "nada", lectura: "no", fase: 1, nota: "FS nativo", enlace: null },
  carpetas: { como: "nada", lectura: "no", fase: 1, nota: "FS nativo", enlace: null },
  "disco-completo": { como: "nada", lectura: "no", fase: 1, nota: "FS nativo", enlace: null },
  "todos-archivos": { como: "nada", lectura: "no", fase: 1, nota: "FS nativo", enlace: null },
  "segundo-plano": { como: "aviso", lectura: "si", fase: 1, nota: "Daemon/systemd service", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Configuración de servicio." } },
  arranque: { como: "aviso", lectura: "si", fase: 1, nota: "systemd/user enable", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "systemctl --user enable." } },
  bateria: { como: "nada", lectura: "no", fase: 1, nota: "N/A", enlace: null },
  superposicion: { como: "nada", lectura: "no", fase: 1, nota: "N/A", enlace: null },
  automatizacion: { como: "nada", lectura: "no", fase: 1, nota: "N/A", enlace: null },
  "no-molestar": { como: "nada", lectura: "no", fase: 1, nota: "N/A", enlace: null },
  "escribir-ajustes": { como: "nada", lectura: "no", fase: 1, nota: "N/A", enlace: null },
  instalar: { como: "nada", lectura: "no", fase: 1, nota: "Gestor de paquetes", enlace: null },
  capacidades: { como: "aviso", lectura: "si", fase: 1, nota: "Se leen del sistema", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Comandos del sistema." } },
};

const POR_MEDIO: Record<Medio, EspMedio> = {
  macos: MACOS,
  windows: WINDOWS,
  "linux-x11": LINUX_X11,
  "linux-wayland": LINUX_WAYLAND,
  android: ANDROID,
  ios: IOS,
  "web-chrome": WEB_CHROME,
  "web-firefox": WEB_FIREFOX,
  "web-safari": WEB_SAFARI,
  "web-embedded": WEB_EMBEDDED,
  terminal: TERMINAL,
};

/** Construye la definición completa de un permiso en un medio. */
function construirDef(medio: Medio, id: PermisoId): DefPermisoMedio {
  const base = BASE_PERMISOS[id];
  const esp = POR_MEDIO[medio][id];
  return {
    id,
    ...base,
    como: esp?.como ?? "nada",
    lectura: esp?.lectura ?? "no",
    fase: esp?.fase ?? 1,
    opcional: esp?.opcional,
    nota: esp?.nota,
    titulo: esp?.titulo ?? base.titulo,
    porQue: esp?.porQue ?? base.porQue,
    enlace: esp?.enlace ?? null,
  };
}

/** Devuelve todos los permisos definidos para un medio, en orden lógico. */
export function catalogoMedio(medio: Medio): DefPermisoMedio[] {
  const orden: PermisoId[] = [
    "microfono", "camara", "pantalla", "accesibilidad", "monitor-entrada",
    "ubicacion", "ubicacion-wifi", "cercanos", "bluetooth", "red-local", "nfc",
    "notificaciones", "llamadas",
    "almacenamiento", "archivos", "carpetas", "disco-completo", "todos-archivos",
    "segundo-plano", "arranque", "bateria",
    "superposicion", "automatizacion", "no-molestar", "escribir-ajustes", "instalar",
    "capacidades",
  ];
  return orden.map((id) => construirDef(medio, id));
}

/** Evalúa el estado de un permiso en un medio (pura: recibe estado crudo y yaPedido). */
export function evaluarPermiso(
  medio: Medio,
  id: PermisoId,
  estadoCrudo: unknown,
  yaPedido: boolean
): EstadoPermisoMedio {
  const def = construirDef(medio, id);
  const estado = normalizarEstadoSistema(estadoCrudo, medio, id);
  const accion = accionPara(def, estado, yaPedido);
  const hayBoton = (accion === "abrir-ajustes" || accion === "pedir") && hayBotonAjustes(def.enlace);
  return {
    permiso: id,
    estado,
    accion,
    yaPedido,
    texto: textoPara(def, estado, accion),
    hayBotonAjustes: hayBoton,
    enlace: def.enlace,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   REGLAS DE PETICIÓN: «al instalar y al abrir, pedir lo que falte y sea útil»
   ═══════════════════════════════════════════════════════════════════════════ */

/** Qué permisos útiles faltan en este medio según estados leídos del sistema. */
export interface PermisoQueFalta {
  permiso: PermisoId;
  titulo: string;
  porQue: string;
  accion: AccionPermiso;
  enlace: EnlaceAjustes | null;
  fase: number;
  opcional: boolean;
}

/**
 * Calcula qué permisos hay que pedir al instalar/abrir en este medio.
 * @param medio Medio detectado
 * @param estadosCrudos Mapa permiso → estado crudo del sistema (lo que el SO/navegador dice)
 * @param yaPedidos Permisos cuyo aviso del sistema YA salió (para aviso-y-panel)
 * @returns Lista de permisos que faltan y son útiles (fase ≤ FASE_ACTUAL), con su acción
 */
export function necesitaParaMedio(
  medio: Medio,
  estadosCrudos: Partial<Record<PermisoId, unknown>> = {},
  yaPedidos: readonly PermisoId[] = []
): PermisoQueFalta[] {
  const catalogo = catalogoMedio(medio);
  const faltan: PermisoQueFalta[] = [];
  for (const def of catalogo) {
    if (def.fase > FASE_ACTUAL) continue; // fases futuras: no se piden aún
    const estadoCrudo = estadosCrudos[def.id];
    const yaPedido = yaPedidos.includes(def.id);
    const ev = evaluarPermiso(medio, def.id, estadoCrudo, yaPedido);
    if (ev.accion === "pedir" || ev.accion === "abrir-ajustes" || ev.accion === "por-uso") {
      faltan.push({
        permiso: def.id,
        titulo: def.titulo,
        porQue: def.porQue,
        accion: ev.accion,
        enlace: def.enlace,
        fase: def.fase,
        opcional: def.opcional ?? false,
      });
    }
  }
  return faltan;
}

/**
 * Regla canónica PRM1119: al instalar y al abrir, pedir lo que falte y sea útil.
 * Si la persona lo denegó a mano → no volver a pedir solo, pero mostrar en lista con «Abrir ajustes».
 * Devuelve la lista ordenada para la UI: primero los de «pedir», luego «abrir-ajustes», luego «por-uso».
 */
export function pedirAlInstalarYAbrir(
  medio: Medio,
  estadosCrudos: Partial<Record<PermisoId, unknown>> = {},
  yaPedidos: readonly PermisoId[] = []
): PermisoQueFalta[] {
  const faltan = necesitaParaMedio(medio, estadosCrudos, yaPedidos);
  const ordenAccion: Record<AccionPermiso, number> = {
    pedir: 0,
    "abrir-ajustes": 1,
    "por-uso": 2,
    nada: 3,
    "mas-adelante": 4,
    listo: 5,
  };
  return [...faltan].sort((a, b) => ordenAccion[a.accion] - ordenAccion[b.accion]);
}

/** Texto para el botón de acción según la acción. */
export function textoBotonAccion(accion: AccionPermiso): string {
  switch (accion) {
    case "pedir": return "Permitir";
    case "abrir-ajustes": return "Abrir ajustes";
    case "por-uso": return "Se pedirá al usarlo";
    default: return "";
  }
}