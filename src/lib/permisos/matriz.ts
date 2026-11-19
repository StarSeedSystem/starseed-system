/**
 * matriz — matriz pura de permisos × medio y regla de petición (PRM1119B, 2026-11-19).
 *
 * MÓDULO PURO: sin `node:*`, sin E/S, sin procesos. Solo tipos, datos y funciones
 * entrada→salida. Lo importan la UI, el asistente de permisos y las pruebas.
 *
 * Contrato: docs/contratos/permisos-por-medio.md (una prueba vigila que no se separen).
 */

export type Medio =
  | "macos"
  | "android"
  | "windows"
  | "linux-x11"
  | "linux-wayland"
  | "web"
  | "terminal"
  | "ios";

export type IdPermiso =
  | "bluetooth"
  | "red-local"
  | "ubicacion-wifi"
  | "ubicacion"
  | "cercanos"
  | "nfc"
  | "notificaciones"
  | "microfono"
  | "camara"
  | "llamadas"
  | "pantalla"
  | "accesibilidad"
  | "monitor-entrada"
  | "automatizacion"
  | "superposicion"
  | "arranque"
  | "bateria"
  | "carpetas"
  | "disco-completo"
  | "todos-archivos"
  | "instalar"
  | "no-molestar"
  | "escribir-ajustes"
  | "capacidades";

export type GrupoPermiso =
  | "malla"
  | "comunicacion"
  | "pantalla-control"
  | "segundo-plano"
  | "archivos"
  | "sistema";

export type ComoSePide =
  | "aviso"
  | "aviso-y-panel"
  | "panel"
  | "por-uso"
  | "declaracion"
  | "nada"
  | "no-disponible"
  | "selector";

export type Lectura = "si" | "parcial" | "no" | "no-concedido";

export type EstadoSistema =
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
  | "ficha"
  | "aviso"
  | "sin-enlace"
  | "no-hace-falta";

export interface EnlaceDirecto {
  nivel: NivelEnlace;
  pantalla: string;
  pulsa: string;
}

export interface DefPermiso {
  id: IdPermiso;
  grupo: GrupoPermiso;
  titulo: string;
  porQue: string;
  fase: number;
  desde: number;
  opcional?: boolean;
  funciones: IdFuncion[];
  nota?: string;
  /** Cómo se pide en ESTE medio (resultado de mezclar). */
  como: ComoSePide;
  /** Si se puede leer el estado en ESTE medio. */
  lectura: Lectura;
  /** Enlace a Ajustes en ESTE medio. */
  enlace: EnlaceDirecto;
}

export type IdFuncion =
  | "malla-radios"
  | "mapa-senales"
  | "llamadas"
  | "avisos"
  | "actualizacion-sola"
  | "siempre-disponible"
  | "prestar-ventana"
  | "compartir-pantalla"
  | "astraura-ve"
  | "astraura-actua"
  | "control-entre-neuronas"
  | "centro-control-nativo"
  | "carpetas-compartidas"
  | "prestar-proceso";

export interface NecesidadFuncion {
  funcion: IdFuncion;
  construida: boolean;
  listo: boolean;
  faltan: { id: IdPermiso; titulo: string; accion: AccionPermiso }[];
  porUso: IdPermiso[];
}

/** Fase actual del contrato (lo de fases posteriores se enseña pero no se pide). */
export const FASE_ACTUAL = 1;

/** Versión de la matriz (sube cuando se AÑADE un permiso que se pide). */
export const VERSION_MATRIZ = 1;

/** Orden de grupos para la UI. */
export const ORDEN_GRUPOS: GrupoPermiso[] = [
  "malla",
  "comunicacion",
  "pantalla-control",
  "segundo-plano",
  "archivos",
  "sistema",
];

/** Título legible de cada grupo. */
export const TITULO_GRUPO: Record<GrupoPermiso, string> = {
  malla: "Tus antenas y la malla",
  comunicacion: "Llamadas y avisos",
  "pantalla-control": "Pantalla y control del aparato",
  "segundo-plano": "Siempre disponible",
  archivos: "Archivos y almacenamiento",
  sistema: "Ajustes y capacidades del aparato",
};

/* ══════════════════════════ Catálogo base (común a todos los medios) ══════════════════════════ */

const BASE: Record<IdPermiso, Omit<DefPermiso, "como" | "lectura" | "enlace">> = {
  bluetooth: {
    id: "bluetooth",
    grupo: "malla",
    titulo: "Bluetooth",
    porQue: "Para hablar directamente con tus otras neuronas cercanas, sin Wi-Fi ni internet.",
    fase: 1,
    desde: 1,
    funciones: ["malla-radios", "llamadas"],
  },
  "red-local": {
    id: "red-local",
    grupo: "malla",
    titulo: "Red local",
    porQue: "Para encontrar a tus otras neuronas en esta red, también sin internet.",
    fase: 1,
    desde: 1,
    funciones: ["malla-radios", "llamadas", "control-entre-neuronas", "prestar-ventana"],
  },
  "ubicacion-wifi": {
    id: "ubicacion-wifi",
    grupo: "malla",
    titulo: "Ubicación (nombres de Wi-Fi)",
    porQue: "El sistema la pide para dejar ver el nombre de las redes Wi-Fi (red directa con tu Android). StarSeed no usa ni guarda tu ubicación.",
    fase: 1,
    desde: 1,
    opcional: true,
    funciones: ["malla-radios"],
  },
  ubicacion: {
    id: "ubicacion",
    grupo: "malla",
    titulo: "Ubicación (mapa)",
    porQue: "Para situar este aparato en el mapa de Señales y en «Usar mi ubicación». Solo se pide cuando tú lo pides; la posición exacta solo la ven tus otras neuronas.",
    fase: 1,
    desde: 1,
    opcional: true,
    funciones: ["mapa-senales"],
  },
  cercanos: {
    id: "cercanos",
    grupo: "malla",
    titulo: "Dispositivos cercanos",
    porQue: "Para buscar, anunciarse y conectar por Bluetooth y por Wi-Fi P2P (Wi-Fi Aware o Wi-Fi Direct, sin router ni hotspot). StarSeed no usa tu ubicación.",
    fase: 1,
    desde: 1,
    funciones: ["malla-radios", "llamadas"],
  },
  nfc: {
    id: "nfc",
    grupo: "malla",
    titulo: "NFC",
    porQue: "Para enlazar dos aparatos acercándolos. Android lo da sin preguntar en cuanto la app lo declara.",
    fase: 3,
    desde: 3,
    funciones: ["malla-radios"],
  },
  notificaciones: {
    id: "notificaciones",
    grupo: "comunicacion",
    titulo: "Notificaciones",
    porQue: "Para avisarte de mensajes y llamadas aunque la ventana esté cerrada.",
    fase: 1,
    desde: 1,
    funciones: ["avisos", "llamadas"],
  },
  microfono: {
    id: "microfono",
    grupo: "comunicacion",
    titulo: "Micrófono",
    porQue: "Solo cuando tú lo pides: llamadas, transmisiones y grabaciones.",
    fase: 1,
    desde: 1,
    funciones: ["llamadas"],
  },
  camara: {
    id: "camara",
    grupo: "comunicacion",
    titulo: "Cámara",
    porQue: "Solo cuando tú lo pides: videollamadas, transmisiones y grabaciones.",
    fase: 1,
    desde: 1,
    funciones: ["llamadas"],
  },
  llamadas: {
    id: "llamadas",
    grupo: "comunicacion",
    titulo: "Llamadas en pantalla completa",
    porQue: "Para que una llamada de StarSeed aparezca a pantalla completa con el teléfono bloqueado. Sin esto llega como aviso emergente.",
    fase: 2,
    desde: 2,
    opcional: true,
    funciones: ["llamadas"],
  },
  pantalla: {
    id: "pantalla",
    grupo: "pantalla-control",
    titulo: "Grabación de pantalla",
    porQue: "Para compartir tu pantalla o una ventana en llamadas y salas, prestar una ventana a otra neurona tuya y que Astraura vea lo que le enseñas.",
    fase: 1,
    desde: 3,
    opcional: true,
    funciones: ["prestar-ventana", "compartir-pantalla", "astraura-ve", "control-entre-neuronas"],
  },
  accesibilidad: {
    id: "accesibilidad",
    grupo: "pantalla-control",
    titulo: "Accesibilidad (controlar el aparato)",
    porQue: "Para que tus otras neuronas, y Astraura cuando tú lo permitas, puedan pulsar y escribir aquí. Siempre con aviso visible y un botón para parar.",
    fase: 1,
    desde: 3,
    opcional: true,
    funciones: ["prestar-ventana", "control-entre-neuronas", "astraura-actua"],
  },
  "monitor-entrada": {
    id: "monitor-entrada",
    grupo: "pantalla-control",
    titulo: "Monitorización de entrada",
    porQue: "Para notar que estás usando el teclado o el ratón y pausar al instante cualquier control a distancia.",
    fase: 3,
    desde: 3,
    funciones: ["control-entre-neuronas", "astraura-actua"],
  },
  automatizacion: {
    id: "automatizacion",
    grupo: "pantalla-control",
    titulo: "Automatización de otras apps",
    porQue: "Para que Astraura pida cosas a otras apps (por ejemplo Música o Finder). El sistema pregunta app por app.",
    fase: 4,
    desde: 3,
    funciones: ["astraura-actua", "centro-control-nativo"],
  },
  superposicion: {
    id: "superposicion",
    grupo: "pantalla-control",
    titulo: "Mostrar sobre otras apps",
    porQue: "Para enseñar siempre encima el aviso de «te están controlando» con su botón de parar, y la orbe de Astraura.",
    fase: 3,
    desde: 3,
    funciones: ["control-entre-neuronas", "astraura-actua"],
  },
  arranque: {
    id: "arranque",
    grupo: "segundo-plano",
    titulo: "Abrir al iniciar sesión",
    porQue: "Para que tu neurona esté disponible para tus otras neuronas y te avise aunque no la abras tú.",
    fase: 1,
    desde: 3,
    opcional: true,
    funciones: ["siempre-disponible", "avisos", "control-entre-neuronas"],
  },
  bateria: {
    id: "bateria",
    grupo: "segundo-plano",
    titulo: "Sin límite de batería",
    porQue: "Para que las antenas sigan vivas con la pantalla apagada. Puedes dejarlo: se usarán solo con la app abierta.",
    fase: 1,
    desde: 1,
    opcional: true,
    funciones: ["siempre-disponible", "malla-radios"],
  },
  carpetas: {
    id: "carpetas",
    grupo: "archivos",
    titulo: "Carpetas protegidas",
    porQue: "Escritorio, Documentos y Descargas: el sistema pregunta la primera vez que eliges una de ellas para vincularla.",
    fase: 1,
    desde: 3,
    funciones: ["carpetas-compartidas"],
  },
  "disco-completo": {
    id: "disco-completo",
    grupo: "archivos",
    titulo: "Acceso total al disco",
    porQue: "Para compartir con tus neuronas cualquier carpeta o volumen sin elegirlos uno a uno.",
    fase: 6,
    desde: 3,
    funciones: ["carpetas-compartidas"],
  },
  "todos-archivos": {
    id: "todos-archivos",
    grupo: "archivos",
    titulo: "Acceso a todos los archivos",
    porQue: "Para compartir con tus neuronas cualquier carpeta o memoria del aparato, no solo las que elijas.",
    fase: 6,
    desde: 3,
    funciones: ["carpetas-compartidas"],
  },
  instalar: {
    id: "instalar",
    grupo: "sistema",
    titulo: "Instalar apps desconocidas",
    porQue: "Para que la app se actualice sola desde el canal de StarSeed (la firma se comprueba antes).",
    fase: 1,
    desde: 1,
    opcional: true,
    funciones: ["actualizacion-sola"],
  },
  "no-molestar": {
    id: "no-molestar",
    grupo: "sistema",
    titulo: "Acceso a No molestar",
    porQue: "Para que el centro de control encienda y apague el No molestar de verdad del aparato.",
    fase: 5,
    desde: 3,
    funciones: ["centro-control-nativo"],
  },
  "escribir-ajustes": {
    id: "escribir-ajustes",
    grupo: "sistema",
    titulo: "Modificar ajustes del sistema",
    porQue: "Para que el centro de control cambie el brillo real de la pantalla.",
    fase: 5,
    desde: 3,
    funciones: ["centro-control-nativo"],
  },
  capacidades: {
    id: "capacidades",
    grupo: "sistema",
    titulo: "Capacidades del aparato",
    porQue: "Procesador, memoria, disco, batería y temperatura: se leen sin pedir nada, para decidir qué puede prestar esta neurona.",
    fase: 1,
    desde: 3,
    funciones: ["prestar-proceso"],
  },
};

/* ══════════════════════════ Especificaciones por medio ══════════════════════════ */

type EspMedio = { como: ComoSePide; lectura: Lectura; enlace: EnlaceDirecto };
type Esp = Partial<Record<Medio, EspMedio>>;

const MACOS: Record<IdPermiso, Esp> = {
  bluetooth: { macos: { como: "aviso", lectura: "si", enlace: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Bluetooth", pulsa: "Activa el interruptor de StarSeed OS." } } },
  "red-local": { macos: { como: "aviso", lectura: "parcial", enlace: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Red local", pulsa: "Activa el interruptor de StarSeed OS. (macOS 15 o posterior; en versiones anteriores no existe este permiso.)" } } },
  "ubicacion-wifi": { macos: { como: "aviso", lectura: "si", enlace: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Localización", pulsa: "Activa «Localización» arriba y el interruptor de StarSeed OS." } } },
  ubicacion: { macos: { como: "por-uso", lectura: "si", enlace: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Localización", pulsa: "Activa «Localización» arriba y el interruptor de StarSeed OS." } } },
  cercanos: {},
  nfc: {},
  notificaciones: { macos: { como: "aviso", lectura: "parcial", enlace: { nivel: "lista", pantalla: "Ajustes del Sistema › Notificaciones", pulsa: "Busca StarSeed OS en la lista y activa «Permitir notificaciones»." } } },
  microfono: { macos: { como: "aviso", lectura: "si", enlace: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Micrófono", pulsa: "Activa el interruptor de StarSeed OS." } } },
  camara: { macos: { como: "aviso", lectura: "si", enlace: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Cámara", pulsa: "Activa el interruptor de StarSeed OS." } } },
  llamadas: {},
  pantalla: { macos: { como: "aviso-y-panel", lectura: "si", enlace: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Grabación de pantalla y audio del sistema", pulsa: "Activa el interruptor de StarSeed OS y, si macOS lo pide, pulsa «Salir y volver a abrir»." } } },
  accesibilidad: { macos: { como: "aviso-y-panel", lectura: "no-concedido", enlace: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Accesibilidad", pulsa: "Activa el interruptor de StarSeed OS (te pedirá tu contraseña o Touch ID: eso lo haces tú)." } } },
  "monitor-entrada": { macos: { como: "aviso-y-panel", lectura: "si", enlace: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Monitorización de entrada", pulsa: "Activa el interruptor de StarSeed OS." } } },
  automatizacion: { macos: { como: "por-uso", lectura: "no", enlace: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Automatización", pulsa: "Se rellena sola la primera vez que StarSeed OS maneja otra app: allí activa la app que quieras." } } },
  superposicion: {},
  arranque: { macos: { como: "aviso", lectura: "si", enlace: { nivel: "lista", pantalla: "Ajustes del Sistema › General › Ítems de inicio", pulsa: "En «Permitir en segundo plano» activa StarSeed OS." } } },
  bateria: {},
  carpetas: { macos: { como: "por-uso", lectura: "no", enlace: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Archivos y carpetas", pulsa: "Activa las carpetas que quieras compartir bajo StarSeed OS." } } },
  "disco-completo": { macos: { como: "panel", lectura: "no", enlace: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Acceso total al disco", pulsa: "Activa el interruptor de StarSeed OS y reabre la app." } } },
  "todos-archivos": {},
  instalar: {},
  "no-molestar": {},
  "escribir-ajustes": {},
  capacidades: { macos: { como: "nada", lectura: "si", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Leer las capacidades del aparato no pide nada." } } },
};

const ANDROID: Record<IdPermiso, Esp> = {
  bluetooth: { android: { como: "aviso", lectura: "si", enlace: { nivel: "ficha", pantalla: "Información de la app StarSeed OS", pulsa: "Pulsa «Permisos» › «Dispositivos cercanos» › «Permitir»." } } },
  "red-local": { android: { como: "nada", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Android no pide permiso para la red local." } } },
  "ubicacion-wifi": { android: { como: "por-uso", lectura: "si", enlace: { nivel: "ficha", pantalla: "Información de la app StarSeed OS", pulsa: "Pulsa «Permisos» › «Ubicación» › «Permitir solo mientras la app está en uso» (y «Usar ubicación precisa» si quieres el punto exacto)." } } },
  ubicacion: { android: { como: "por-uso", lectura: "si", enlace: { nivel: "ficha", pantalla: "Información de la app StarSeed OS", pulsa: "Pulsa «Permisos» › «Ubicación» › «Permitir solo mientras la app está en uso» (y «Usar ubicación precisa» si quieres el punto exacto)." } } },
  cercanos: { android: { como: "aviso", lectura: "si", enlace: { nivel: "ficha", pantalla: "Información de la app StarSeed OS", pulsa: "Pulsa «Permisos» › «Dispositivos cercanos» › «Permitir»." } } },
  nfc: { android: { como: "declaracion", lectura: "si", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "NFC no pide permiso: basta con que esté encendido en el aparato." } } },
  notificaciones: { android: { como: "aviso", lectura: "si", enlace: { nivel: "directo", pantalla: "Ajustes › Aplicaciones › StarSeed OS › Notificaciones", pulsa: "Activa «Permitir notificaciones»." } } },
  microfono: { android: { como: "aviso", lectura: "si", enlace: { nivel: "ficha", pantalla: "Información de la app StarSeed OS", pulsa: "Pulsa «Permisos» › «Micrófono» › «Permitir solo mientras la app está en uso»." } } },
  camara: { android: { como: "aviso", lectura: "si", enlace: { nivel: "ficha", pantalla: "Información de la app StarSeed OS", pulsa: "Pulsa «Permisos» › «Cámara» › «Permitir solo mientras la app está en uso»." } } },
  llamadas: { android: { como: "panel", lectura: "si", enlace: { nivel: "directo", pantalla: "Ajustes › Aplicaciones › Acceso especial › Notificaciones a pantalla completa (Android 14 o posterior)", pulsa: "Activa «Permitir notificaciones a pantalla completa». En Android 13 o anterior no hace falta." } } },
  pantalla: { android: { como: "por-uso", lectura: "no", enlace: { nivel: "aviso", pantalla: "Aviso del sistema", pulsa: "Android pregunta cada vez que empieza a compartirse la pantalla: elige «Pantalla completa» o «Una sola app» y pulsa «Empezar ahora»." } } },
  accesibilidad: { android: { como: "panel", lectura: "si", enlace: { nivel: "lista", pantalla: "Ajustes › Accesibilidad › Aplicaciones instaladas", pulsa: "Pulsa «StarSeed OS», activa el interruptor y confirma con «Permitir». Si sale en gris, antes pulsa ⋮ en la ficha de la app › «Permitir ajustes restringidos»." } } },
  "monitor-entrada": {},
  automatizacion: {},
  superposicion: { android: { como: "panel", lectura: "si", enlace: { nivel: "directo", pantalla: "Ajustes › Aplicaciones › Acceso especial › Mostrar sobre otras apps › StarSeed OS", pulsa: "Activa «Permitir mostrar sobre otras apps»." } } },
  arranque: { android: { como: "declaracion", lectura: "si", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Se declara en el manifiesto; el sistema lo gestiona." } } },
  bateria: { android: { como: "aviso", lectura: "si", enlace: { nivel: "aviso", pantalla: "Diálogo del sistema «¿Permitir que StarSeed OS ignore las optimizaciones de batería?»", pulsa: "Pulsa «Permitir»." } } },
  carpetas: {},
  "disco-completo": {},
  "todos-archivos": { android: { como: "panel", lectura: "si", enlace: { nivel: "directo", pantalla: "Ajustes › Aplicaciones › Acceso especial › Acceso a todos los archivos › StarSeed OS", pulsa: "Activa «Permitir acceso para administrar todos los archivos»." } } },
  instalar: { android: { como: "panel", lectura: "si", enlace: { nivel: "directo", pantalla: "Ajustes › Aplicaciones › Acceso especial › Instalar apps desconocidas › StarSeed OS", pulsa: "Activa «Permitir desde esta fuente»." } } },
  "no-molestar": { android: { como: "panel", lectura: "si", enlace: { nivel: "lista", pantalla: "Ajustes › Notificaciones › Acceso a No molestar", pulsa: "Pulsa StarSeed OS y activa «Permitir acceso a No molestar»." } } },
  "escribir-ajustes": { android: { como: "panel", lectura: "si", enlace: { nivel: "directo", pantalla: "Ajustes › Aplicaciones › Acceso especial › Modificar ajustes del sistema › StarSeed OS", pulsa: "Activa «Permitir modificar los ajustes del sistema»." } } },
  capacidades: { android: { como: "nada", lectura: "si", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Leer las capacidades del aparato no pide nada." } } },
};

const WINDOWS: Record<IdPermiso, Esp> = {
  bluetooth: { windows: { como: "nada", lectura: "si", enlace: { nivel: "directo", pantalla: "Configuración › Bluetooth y dispositivos", pulsa: "Activa «Bluetooth»." } } },
  "red-local": { windows: { como: "por-uso", lectura: "no", enlace: { nivel: "sin-enlace", pantalla: "Firewall de Windows (lo abre el propio Windows)", pulsa: "No hay pantalla de Configuración para esto: Windows pregunta solo la primera vez que StarSeed OS escucha en la red. Elige «Redes privadas»." } } },
  "ubicacion-wifi": { windows: { como: "por-uso", lectura: "no", enlace: { nivel: "directo", pantalla: "Configuración › Privacidad y seguridad › Ubicación", pulsa: "Activa «Servicios de ubicación» y «Permitir que las aplicaciones de escritorio accedan a tu ubicación»." } } },
  ubicacion: { windows: { como: "por-uso", lectura: "no", enlace: { nivel: "directo", pantalla: "Configuración › Privacidad y seguridad › Ubicación", pulsa: "Activa «Servicios de ubicación» y «Permitir que las aplicaciones de escritorio accedan a tu ubicación»." } } },
  cercanos: {},
  nfc: {},
  notificaciones: { windows: { como: "nada", lectura: "no", enlace: { nivel: "directo", pantalla: "Configuración › Sistema › Notificaciones", pulsa: "Activa «Notificaciones» y, en la lista, StarSeed OS." } } },
  microfono: { windows: { como: "por-uso", lectura: "no", enlace: { nivel: "directo", pantalla: "Configuración › Privacidad y seguridad › Micrófono", pulsa: "Activa «Permitir que las aplicaciones de escritorio accedan al micrófono»." } } },
  camara: { windows: { como: "por-uso", lectura: "no", enlace: { nivel: "directo", pantalla: "Configuración › Privacidad y seguridad › Cámara", pulsa: "Activa «Permitir que las aplicaciones de escritorio accedan a la cámara»." } } },
  llamadas: {},
  pantalla: { windows: { como: "nada", lectura: "si", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Windows no pide permiso para compartir pantalla; marca con un borde la ventana que se comparte." } } },
  accesibilidad: { windows: { como: "nada", lectura: "si", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Windows no pide permiso para mandar teclas y clics (no llega a ventanas de administrador)." } } },
  "monitor-entrada": {},
  automatizacion: {},
  superposicion: {},
  arranque: { windows: { como: "aviso", lectura: "si", enlace: { nivel: "directo", pantalla: "Configuración › Aplicaciones › Inicio", pulsa: "Activa StarSeed OS en la lista." } } },
  bateria: {},
  carpetas: {},
  "disco-completo": {},
  "todos-archivos": {},
  instalar: {},
  "no-molestar": {},
  "escribir-ajustes": {},
  capacidades: { windows: { como: "nada", lectura: "si", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Leer las capacidades del aparato no pide nada." } } },
};

const LINUX_X11: Record<IdPermiso, Esp> = {
  bluetooth: { "linux-x11": { como: "nada", lectura: "si", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "BlueZ no pide permiso a la app; solo hace falta que el Bluetooth esté encendido." } } },
  "red-local": { "linux-x11": { como: "nada", lectura: "si", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Linux no pide permiso para la red local." } } },
  "ubicacion-wifi": { "linux-x11": { como: "nada", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Linux no pide permiso para ver nombres de Wi-Fi." } } },
  ubicacion: { "linux-x11": { como: "nada", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "En X11 el mapa usa la ubicación del navegador." } } },
  cercanos: {},
  nfc: {},
  notificaciones: { "linux-x11": { como: "nada", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Linux no pide permiso para las notificaciones." } } },
  microfono: { "linux-x11": { como: "nada", lectura: "no", enlace: { nivel: "sin-enlace", pantalla: "Los ajustes de sonido de tu escritorio", pulsa: "Linux no tiene una pantalla de permisos única: cada escritorio (GNOME, KDE…) pone la suya y la app no puede saber cuál es, así que no abre ninguna. Si la app no oye, mira Sonido › Entrada y que el micrófono no esté silenciado." } } },
  camara: { "linux-x11": { como: "nada", lectura: "no", enlace: { nivel: "sin-enlace", pantalla: "Los ajustes de privacidad de tu escritorio", pulsa: "Linux no tiene una pantalla de permisos única: cada escritorio (GNOME, KDE…) pone la suya y la app no puede saber cuál es, así que no abre ninguna. Si la cámara no sale, comprueba que no la use otra app." } } },
  llamadas: {},
  pantalla: { "linux-x11": { como: "nada", lectura: "si", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "En X11 cualquier app puede ver la pantalla: no hay nada que pedir (ni que proteger)." } } },
  accesibilidad: { "linux-x11": { como: "nada", lectura: "si", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "En X11 cualquier app puede mandar teclas y clics: no hay nada que pedir." } } },
  "monitor-entrada": {},
  automatizacion: {},
  superposicion: {},
  arranque: { "linux-x11": { como: "aviso", lectura: "si", enlace: { nivel: "sin-enlace", pantalla: "Aplicaciones al inicio de tu escritorio", pulsa: "Linux no tiene una pantalla de permisos única: cada escritorio (GNOME, KDE…) pone la suya y la app no puede saber cuál es, así que no abre ninguna. StarSeed OS crea su entrada en ~/.config/autostart; para quitarla, bórrala desde el gestor de inicio de tu escritorio." } } },
  bateria: {},
  carpetas: {},
  "disco-completo": {},
  "todos-archivos": {},
  instalar: {},
  "no-molestar": {},
  "escribir-ajustes": {},
  capacidades: { "linux-x11": { como: "nada", lectura: "si", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Leer las capacidades del aparato no pide nada." } } },
};

const LINUX_WAYLAND: Record<IdPermiso, Esp> = {
  ...LINUX_X11,
  pantalla: { "linux-wayland": { como: "por-uso", lectura: "no", enlace: { nivel: "aviso", pantalla: "Aviso del sistema", pulsa: "Wayland pregunta con su propio selector cada vez que se comparte la pantalla: elige la pantalla o ventana y pulsa «Compartir»." } } },
  accesibilidad: { "linux-wayland": { como: "por-uso", lectura: "no", enlace: { nivel: "aviso", pantalla: "Aviso del sistema", pulsa: "Wayland solo deja mandar teclas y clics por el portal de Escritorio remoto, que pregunta en cada sesión: pulsa «Permitir»." } } },
  microfono: { "linux-wayland": { como: "nada", lectura: "no", enlace: { nivel: "sin-enlace", pantalla: "Los ajustes de sonido de tu escritorio", pulsa: "Linux no tiene una pantalla de permisos única: cada escritorio (GNOME, KDE…) pone la suya y la app no puede saber cuál es, así que no abre ninguna. Si la app no oye, mira Sonido › Entrada y que el micrófono no esté silenciado." } } },
  camara: { "linux-wayland": { como: "nada", lectura: "no", enlace: { nivel: "sin-enlace", pantalla: "Los ajustes de privacidad de tu escritorio", pulsa: "Linux no tiene una pantalla de permisos única: cada escritorio (GNOME, KDE…) pone la suya y la app no puede saber cuál es, así que no abre ninguna. Si la cámara no sale, comprueba que no la use otra app." } } },
};

const WEB: Record<IdPermiso, Esp> = {
  bluetooth: { web: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Web Bluetooth API requiere gesto de usuario y contexto seguro; no se pide al instalar." } } },
  "red-local": { web: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "La web no tiene API para red local privada." } } },
  "ubicacion-wifi": { web: { como: "por-uso", lectura: "si", enlace: { nivel: "aviso", pantalla: "Diálogo del navegador", pulsa: "El navegador pregunta al usar `navigator.geolocation`: pulsa «Permitir»." } } },
  ubicacion: { web: { como: "por-uso", lectura: "si", enlace: { nivel: "aviso", pantalla: "Diálogo del navegador", pulsa: "El navegador pregunta al usar `navigator.geolocation`: pulsa «Permitir»." } } },
  cercanos: { web: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No hay API web estándar para dispositivos cercanos." } } },
  nfc: { web: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Web NFC requiere gesto y contexto seguro; no se usa." } } },
  notificaciones: { web: { como: "aviso", lectura: "si", enlace: { nivel: "aviso", pantalla: "Diálogo del navegador", pulsa: "El navegador pregunta al llamar `Notification.requestPermission()`: pulsa «Permitir»." } } },
  microfono: { web: { como: "aviso", lectura: "si", enlace: { nivel: "aviso", pantalla: "Diálogo del navegador", pulsa: "El navegador pregunta al llamar `getUserMedia({audio:true})`: pulsa «Permitir»." } } },
  camara: { web: { como: "aviso", lectura: "si", enlace: { nivel: "aviso", pantalla: "Diálogo del navegador", pulsa: "El navegador pregunta al llamar `getUserMedia({video:true})`: pulsa «Permitir»." } } },
  llamadas: { web: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No hay API web para llamadas a pantalla completa." } } },
  pantalla: { web: { como: "aviso", lectura: "no", enlace: { nivel: "aviso", pantalla: "Diálogo del navegador", pulsa: "El navegador pregunta al llamar `getDisplayMedia()`: elige pantalla/ventana y pulsa «Compartir»." } } },
  accesibilidad: { web: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "La web no tiene API de accesibilidad del sistema." } } },
  "monitor-entrada": { web: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "La web no tiene API de monitorización de entrada." } } },
  automatizacion: { web: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "La web no tiene API de automatización de apps." } } },
  superposicion: { web: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "La web no puede mostrar sobre otras apps del sistema." } } },
  arranque: { web: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "La web no se abre al iniciar sesión (salvo PWA instalada)." } } },
  bateria: { web: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "La web no gestiona optimizaciones de batería." } } },
  carpetas: { web: { como: "selector", lectura: "si", enlace: { nivel: "aviso", pantalla: "Selector de archivos del navegador", pulsa: "Elige la carpeta en el diálogo `showDirectoryPicker()` y pulsa «Seleccionar»." } } },
  "disco-completo": { web: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "La web no tiene acceso total al disco." } } },
  "todos-archivos": { web: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "La web no tiene acceso a todos los archivos." } } },
  instalar: { web: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "La web no instala apps." } } },
  "no-molestar": { web: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "La web no controla No molestar del sistema." } } },
  "escribir-ajustes": { web: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "La web no modifica ajustes del sistema." } } },
  capacidades: { web: { como: "nada", lectura: "si", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "La web lee capacidades vía `navigator.deviceMemory`, `hardwareConcurrency`, Battery API, etc." } } },
};

const TERMINAL: Record<IdPermiso, Esp> = {
  bluetooth: { terminal: { como: "nada", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "La terminal no gestiona Bluetooth de la app." } } },
  "red-local": { terminal: { como: "nada", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "La terminal no pide red local." } } },
  "ubicacion-wifi": { terminal: { como: "nada", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "La terminal no pide ubicación." } } },
  ubicacion: { terminal: { como: "nada", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "La terminal no pide ubicación." } } },
  cercanos: { terminal: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No aplica." } } },
  nfc: { terminal: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No aplica." } } },
  notificaciones: { terminal: { como: "nada", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "La terminal no muestra notificaciones del sistema." } } },
  microfono: { terminal: { como: "nada", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "La terminal no usa micrófono." } } },
  camara: { terminal: { como: "nada", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "La terminal no usa cámara." } } },
  llamadas: { terminal: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No aplica." } } },
  pantalla: { terminal: { como: "nada", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "La terminal no comparte pantalla." } } },
  accesibilidad: { terminal: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No aplica." } } },
  "monitor-entrada": { terminal: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No aplica." } } },
  automatizacion: { terminal: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No aplica." } } },
  superposicion: { terminal: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No aplica." } } },
  arranque: { terminal: { como: "nada", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "El arranque se gestiona con systemd/cron/launchd, no por la app." } } },
  bateria: { terminal: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No aplica." } } },
  carpetas: { terminal: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No aplica." } } },
  "disco-completo": { terminal: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No aplica." } } },
  "todos-archivos": { terminal: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No aplica." } } },
  instalar: { terminal: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No aplica." } } },
  "no-molestar": { terminal: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No aplica." } } },
  "escribir-ajustes": { terminal: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No aplica." } } },
  capacidades: { terminal: { como: "nada", lectura: "si", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "La terminal lee CPU/RAM/disco del sistema." } } },
};

const IOS: Record<IdPermiso, Esp> = {
  bluetooth: { ios: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "PWA en iOS no tiene Web Bluetooth." } } },
  "red-local": { ios: { como: "aviso", lectura: "parcial", enlace: { nivel: "aviso", pantalla: "Diálogo del sistema", pulsa: "iOS pregunta al primer uso de red local: pulsa «Permitir»." } } },
  "ubicacion-wifi": { ios: { como: "por-uso", lectura: "si", enlace: { nivel: "aviso", pantalla: "Diálogo del navegador", pulsa: "Safari pregunta al usar `navigator.geolocation`: pulsa «Permitir mientras uso la app»." } } },
  ubicacion: { ios: { como: "por-uso", lectura: "si", enlace: { nivel: "aviso", pantalla: "Diálogo del navegador", pulsa: "Safari pregunta al usar `navigator.geolocation`: pulsa «Permitir mientras uso la app»." } } },
  cercanos: { ios: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No hay API web para dispositivos cercanos en iOS." } } },
  nfc: { ios: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Web NFC no disponible en iOS Safari." } } },
  notificaciones: { ios: { como: "aviso", lectura: "si", enlace: { nivel: "aviso", pantalla: "Diálogo del navegador", pulsa: "Safari pregunta al llamar `Notification.requestPermission()` en gesto de usuario: pulsa «Permitir»." } } },
  microfono: { ios: { como: "aviso", lectura: "si", enlace: { nivel: "aviso", pantalla: "Diálogo del navegador", pulsa: "Safari pregunta al llamar `getUserMedia({audio:true})` en gesto: pulsa «Permitir»." } } },
  camara: { ios: { como: "aviso", lectura: "si", enlace: { nivel: "aviso", pantalla: "Diálogo del navegador", pulsa: "Safari pregunta al llamar `getUserMedia({video:true})` en gesto: pulsa «Permitir»." } } },
  llamadas: { ios: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No hay API web para llamadas a pantalla completa en iOS." } } },
  pantalla: { ios: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "iOS Safari no tiene `getDisplayMedia`." } } },
  accesibilidad: { ios: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "La web no tiene API de accesibilidad del sistema." } } },
  "monitor-entrada": { ios: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No aplica." } } },
  automatizacion: { ios: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No aplica." } } },
  superposicion: { ios: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No aplica." } } },
  arranque: { ios: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "PWA instalada puede abrir al iniciar, pero no se pide permiso." } } },
  bateria: { ios: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No aplica." } } },
  carpetas: { ios: { como: "selector", lectura: "si", enlace: { nivel: "aviso", pantalla: "Selector de archivos del navegador", pulsa: "Elige la carpeta en el diálogo `showDirectoryPicker()` y pulsa «Seleccionar»." } } },
  "disco-completo": { ios: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No aplica." } } },
  "todos-archivos": { ios: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No aplica." } } },
  instalar: { ios: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No aplica." } } },
  "no-molestar": { ios: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No aplica." } } },
  "escribir-ajustes": { ios: { como: "no-disponible", lectura: "no", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "No aplica." } } },
  capacidades: { ios: { como: "nada", lectura: "si", enlace: { nivel: "no-hace-falta", pantalla: "—", pulsa: "La web lee capacidades vía APIs estándar." } } },
};

/* ══════════════════════════ Construcción del registro completo ══════════════════════════ */

const POR_MEDIO: Record<Medio, Record<IdPermiso, Esp>> = {
  macos: MACOS,
  android: ANDROID,
  windows: WINDOWS,
  "linux-x11": LINUX_X11,
  "linux-wayland": LINUX_WAYLAND,
  web: WEB,
  terminal: TERMINAL,
  ios: IOS,
};

function mezclar(base: typeof BASE[IdPermiso], esp: Esp, medio: Medio): DefPermiso {
  const e = esp?.[medio];
  return {
    ...base,
    como: e?.como ?? "no-disponible",
    lectura: e?.lectura ?? "no",
    enlace: e?.enlace ?? { nivel: "no-hace-falta", pantalla: "—", pulsa: "Este medio no gestiona este permiso." },
  };
}

/** Todos los permisos para un medio, ordenados por grupo. */
export function registroDe(medio: Medio): DefPermiso[] {
  const ids = Object.keys(BASE) as IdPermiso[];
  const filas = ids.map((id) => mezclar(BASE[id], POR_MEDIO[medio][id], medio));
  return ORDEN_GRUPOS.flatMap((g) => filas.filter((f) => f.grupo === g));
}

/** Definición de un permiso en un medio. */
export function defDe(medio: Medio, id: IdPermiso): DefPermiso | null {
  if (!BASE[id]) return null;
  return mezclar(BASE[id], POR_MEDIO[medio][id], medio);
}

/** IDs de todos los permisos. */
export const IDS_PERMISO: readonly IdPermiso[] = Object.keys(BASE) as IdPermiso[];

/* ══════════════════════════ Lógica pura de petición ══════════════════════════ */

/**
 * Qué ofrece la lista para `def` con su estado real en este medio.
 * `yaPedido`: el aviso del sistema ya salió una vez (macOS no lo repite: desde entonces solo se da en Ajustes).
 * PURA: sin E/S, solo decisión.
 */
export function accionDe(def: DefPermiso, estado: EstadoSistema | undefined, yaPedido = false): AccionPermiso {
  if (def.fase > FASE_ACTUAL) return "mas-adelante";
  if (def.como === "no-disponible") return "nada";
  if (estado === "concedido" || estado === "no-aplica") return "listo";

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
    case "selector":
      return "por-uso";
  }
}

/** ¿Esta acción la puede llevar adelante la lista (pedir o abrir la pantalla)? */
export function esAccionable(a: AccionPermiso): boolean {
  return a === "pedir" || a === "abrir-ajustes";
}

/** ¿Cuenta como «lo tengo» para una función? (Nada que pedir, o concedido.) */
function cubierto(def: DefPermiso, estado: EstadoSistema | undefined): boolean {
  if (def.como === "nada" || def.como === "declaracion") return true;
  return estado === "concedido" || estado === "no-aplica";
}

/** Funciones del OS y su estado actual (medido en el código). */
export const FUNCIONES: Record<IdFuncion, { titulo: string; estado: "existe" | "a-medias" | "falta"; fase: number }> = {
  "malla-radios": { titulo: "Antenas de la malla (Bluetooth, red local, Wi-Fi directo)", estado: "existe", fase: 1 },
  "mapa-senales": { titulo: "Mapa de Señales con la posición de este aparato", estado: "existe", fase: 1 },
  llamadas: { titulo: "Llamadas de voz y vídeo", estado: "existe", fase: 1 },
  avisos: { titulo: "Avisos de mensajes y llamadas", estado: "existe", fase: 1 },
  "actualizacion-sola": { titulo: "Actualizarse sola", estado: "existe", fase: 1 },
  "siempre-disponible": { titulo: "Seguir viva en segundo plano y al encender", estado: "existe", fase: 1 },
  "prestar-ventana": { titulo: "Prestar una ventana a otra neurona (verla y tocarla)", estado: "a-medias", fase: 1 },
  "compartir-pantalla": { titulo: "Compartir pantalla en llamadas y salas", estado: "a-medias", fase: 2 },
  "astraura-ve": { titulo: "Astraura ve la pantalla", estado: "a-medias", fase: 4 },
  "astraura-actua": { titulo: "Astraura actúa en el aparato", estado: "falta", fase: 4 },
  "control-entre-neuronas": { titulo: "Controlar una neurona desde otra de tu cuenta", estado: "falta", fase: 3 },
  "centro-control-nativo": { titulo: "Centro de control con los ajustes reales del aparato", estado: "falta", fase: 5 },
  "carpetas-compartidas": { titulo: "Carpetas y almacenamiento compartidos", estado: "a-medias", fase: 6 },
  "prestar-proceso": { titulo: "Prestar procesador y memoria a la malla", estado: "a-medias", fase: 6 },
};

/**
 * «¿Tengo lo que necesito para `funcion` en `medio` y, si no, qué pido?» — la pregunta que cada
 * función del OS hace antes de empezar. PURA.
 * Los permisos opcionales de la lista son obligatorios para la función que los usa.
 * Solo considera permisos aplicables en este medio (como !== "no-disponible").
 */
export function necesitaPara(
  funcion: IdFuncion,
  medio: Medio,
  estados: Partial<Record<IdPermiso, EstadoSistema>>,
  yaPedidos: readonly IdPermiso[] = [],
): NecesidadFuncion {
  const f = FUNCIONES[funcion];
  const construida = f.estado !== "falta" && f.fase <= FASE_ACTUAL;
  const faltan: NecesidadFuncion["faltan"] = [];
  const porUso: IdPermiso[] = [];

  for (const d of registroDe(medio).filter((x) => x.funciones.includes(funcion))) {
    if (d.como === "no-disponible") continue;
    const e = estados[d.id];
    if (cubierto(d, e)) continue;
    if (d.como === "por-uso" && (e === undefined || e === "desconocido")) {
      porUso.push(d.id);
      continue;
    }
    const accion = accionDe({ ...d, fase: Math.min(d.fase, FASE_ACTUAL) }, e, yaPedidos.includes(d.id));
    faltan.push({ id: d.id, titulo: d.titulo, accion });
  }
  return { funcion, construida, listo: construida && faltan.length === 0, faltan, porUso };
}

/** Texto corto del estado para la UI. */
export function textoEstado(def: DefPermiso, estado: EstadoSistema | undefined, accion: AccionPermiso): string {
  if (accion === "mas-adelante") return `Llega con la fase ${def.fase}: aún no se pide`;
  if (estado === "concedido") return "Concedido";
  if (estado === "no-aplica") return "Este medio no lo pide";
  if (accion === "nada") return "Nada que hacer";
  if (accion === "por-uso") return "El sistema lo pregunta al usarlo";
  if (estado === "denegado") return "Denegado: se cambia en Ajustes";
  if (def.lectura === "no") return "El sistema no deja saber su estado";
  if (estado === undefined || estado === "desconocido") return "Sin dato todavía";
  if (estado === "no-concedido") return "Sin conceder (no distingue negado de sin preguntar)";
  return "Sin preguntar";
}

/** Detecta el medio a partir de `navigator.userAgent` y `window` (lado cliente). */
export function detectarMedio(): Medio {
  if (typeof window === "undefined") return "terminal";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("android")) return "android";
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) return "ios";
  if (ua.includes("mac")) return "macos";
  if (ua.includes("win")) return "windows";
  if (ua.includes("linux")) {
    // No se puede distinguir X11/Wayland desde la web fiablemente
    return "linux-wayland";
  }
  return "web";
}