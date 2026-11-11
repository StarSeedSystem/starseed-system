/*
 * permisos-registro — el REGISTRO único de permisos de StarSeed OS por sistema (PER1111S, 2026-11-11).
 * Contrato: architecture/permisos-y-control-del-dispositivo.md (§2 la matriz, §3 qué abre cada uno, §5 fase 1).
 *
 * MÓDULO PURO y la ÚNICA fuente de verdad de «qué permisos hay en este sistema, cómo se piden, si se pueden
 * leer y para qué sirven». De aquí leen:
 *  · la lista de permisos de cada neurona (`permisos-inicio.ts` + `asistente-permisos.tsx`);
 *  · las funciones del OS: `necesitaPara(funcion, sistema, estados)` contesta «¿tengo lo que necesito y, si
 *    no, qué pido?» (compartir pantalla, Astraura actuando, control entre neuronas, centro de control…).
 *
 * Regla (contrato §1): «automático» = pedirlo en el momento justo con su porqué, abrir la pantalla EXACTA
 * del sistema, notar la concesión al volver y seguir solo. Nunca autoconcederse: ni base de datos de
 * permisos, ni interfaces privadas, ni clics por guion en los diálogos del sistema.
 */

export type SistemaPermisos = "macos" | "android" | "windows" | "linux-x11" | "linux-wayland";

export type IdPermiso =
  // De PER1108A/LLA1108D (se conservan los ids: viven en lo guardado de cada neurona).
  | "bluetooth"
  | "red-local"
  | "notificaciones"
  | "microfono"
  | "camara"
  | "ubicacion-wifi"
  | "cercanos"
  | "llamadas"
  | "instalar"
  | "bateria"
  // PER1111S
  | "accesibilidad"
  | "pantalla"
  | "monitor-entrada"
  | "automatizacion"
  | "disco-completo"
  | "carpetas"
  | "arranque"
  | "superposicion"
  | "no-molestar"
  | "escribir-ajustes"
  | "todos-archivos"
  | "nfc"
  | "capacidades";

export type GrupoPermiso = "malla" | "comunicacion" | "pantalla-control" | "segundo-plano" | "archivos" | "sistema";

/**
 * Cómo se pide en ESE sistema:
 *  · aviso: la app hace que el sistema pregunte con su propio aviso;
 *  · aviso-y-panel: la primera vez, aviso del sistema; después solo se da en Ajustes (macOS Accesibilidad,
 *    Grabación de pantalla, Monitorización de entrada);
 *  · panel: solo lo da la persona en una pantalla de Ajustes (la app la abre);
 *  · por-uso: el sistema pregunta cada vez que se usa (o al usarlo la primera vez): no hay nada que pedir antes;
 *  · declaracion: basta con declararlo en el manifiesto; nadie pregunta;
 *  · nada: este sistema no lo pide.
 */
export type ComoSePide = "aviso" | "aviso-y-panel" | "panel" | "por-uso" | "declaracion" | "nada";

/** ¿Se puede leer su estado desde la app? «parcial»: a veces, o de forma indirecta. */
export type Lectura = "si" | "parcial" | "no";

/** Estado leído del sistema. «no-concedido»: el sistema no distingue «negado» de «sin preguntar». */
export type EstadoSistema = "concedido" | "denegado" | "sin-preguntar" | "no-concedido" | "desconocido" | "no-aplica";

/** Lo que la lista ofrece para un permiso ahora. */
export type AccionPermiso = "pedir" | "abrir-ajustes" | "por-uso" | "nada" | "mas-adelante" | "listo";

export type IdFuncion =
  | "malla-radios"
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

export interface DefPermiso {
  id: IdPermiso;
  grupo: GrupoPermiso;
  titulo: string;
  /** Una línea: para qué sirve (en claro, sin jerga). */
  porQue: string;
  como: ComoSePide;
  lectura: Lectura;
  /** Fase del contrato en la que una función lo usa de verdad. > FASE_ACTUAL = «llega más adelante» (no se pide). */
  fase: number;
  /** Versión del asistente en la que entró (permisos nuevos tras una actualización). */
  desde: number;
  opcional?: boolean;
  funciones: IdFuncion[];
  /** Una aclaración honesta y corta que la lista enseña bajo el porqué. */
  nota?: string;
}

/** La fase del contrato que está construida. Lo de fases posteriores se enseña pero no se pide. */
export const FASE_ACTUAL = 1;

/** Sube cuando se AÑADE un permiso que se pide (no cuando cambia un texto). */
export const VERSION_REGISTRO = 3;

export const TITULO_GRUPO: Record<GrupoPermiso, string> = {
  malla: "Tus antenas y la malla",
  comunicacion: "Llamadas y avisos",
  "pantalla-control": "Pantalla y control del aparato",
  "segundo-plano": "Siempre disponible",
  archivos: "Archivos y almacenamiento",
  sistema: "Ajustes y capacidades del aparato",
};

export const ORDEN_GRUPOS: GrupoPermiso[] = ["malla", "comunicacion", "pantalla-control", "segundo-plano", "archivos", "sistema"];

/* ══════════════════════════ Funciones del OS ══════════════════════════ */

export type EstadoFuncion = "existe" | "a-medias" | "falta";

/** Lo que cada función es HOY en el código (medido el 2026-11-11; contrato §3). */
export const FUNCIONES: Record<IdFuncion, { titulo: string; estado: EstadoFuncion; fase: number }> = {
  "malla-radios": { titulo: "Antenas de la malla (Bluetooth, red local, Wi-Fi directo)", estado: "existe", fase: 1 },
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

/* ══════════════════════════ El catálogo ══════════════════════════ */

type Base = Pick<DefPermiso, "grupo" | "titulo" | "porQue" | "desde" | "funciones">;

const BASE: Record<IdPermiso, Base> = {
  bluetooth: {
    grupo: "malla",
    titulo: "Bluetooth",
    porQue: "Para hablar directamente con tus otras neuronas cercanas, sin Wi-Fi ni internet.",
    desde: 1,
    funciones: ["malla-radios", "llamadas"],
  },
  "red-local": {
    grupo: "malla",
    titulo: "Red local",
    porQue: "Para encontrar a tus otras neuronas en esta red, también sin internet.",
    desde: 1,
    funciones: ["malla-radios", "llamadas", "control-entre-neuronas", "prestar-ventana"],
  },
  "ubicacion-wifi": {
    grupo: "malla",
    titulo: "Ubicación (nombres de Wi-Fi)",
    porQue: "El sistema la pide para dejar ver el nombre de las redes Wi-Fi (red directa con tu Android). StarSeed no usa ni guarda tu ubicación.",
    desde: 1,
    funciones: ["malla-radios"],
  },
  cercanos: {
    grupo: "malla",
    titulo: "Dispositivos cercanos",
    porQue: "Para buscar, anunciarse y conectar por Bluetooth y por Wi-Fi P2P (Wi-Fi Aware o Wi-Fi Direct, sin router ni hotspot). StarSeed no usa tu ubicación.",
    desde: 1,
    funciones: ["malla-radios", "llamadas"],
  },
  nfc: {
    grupo: "malla",
    titulo: "NFC",
    porQue: "Para enlazar dos aparatos acercándolos. Android lo da sin preguntar en cuanto la app lo declara.",
    desde: 3,
    funciones: ["malla-radios"],
  },
  notificaciones: {
    grupo: "comunicacion",
    titulo: "Notificaciones",
    porQue: "Para avisarte de mensajes y llamadas aunque la ventana esté cerrada.",
    desde: 1,
    funciones: ["avisos", "llamadas"],
  },
  microfono: {
    grupo: "comunicacion",
    titulo: "Micrófono",
    porQue: "Solo cuando tú lo pides: llamadas, transmisiones y grabaciones.",
    desde: 1,
    funciones: ["llamadas"],
  },
  camara: {
    grupo: "comunicacion",
    titulo: "Cámara",
    porQue: "Solo cuando tú lo pides: videollamadas, transmisiones y grabaciones.",
    desde: 1,
    funciones: ["llamadas"],
  },
  llamadas: {
    grupo: "comunicacion",
    titulo: "Llamadas sobre la pantalla de bloqueo",
    porQue: "Para que una llamada de StarSeed aparezca a pantalla completa con el teléfono bloqueado. Sin esto llega como aviso emergente.",
    desde: 2,
    funciones: ["llamadas"],
  },
  pantalla: {
    grupo: "pantalla-control",
    titulo: "Grabación de pantalla",
    porQue: "Para compartir tu pantalla o una ventana en llamadas y salas, prestar una ventana a otra neurona tuya y que Astraura vea lo que le enseñas.",
    desde: 3,
    funciones: ["prestar-ventana", "compartir-pantalla", "astraura-ve", "control-entre-neuronas"],
  },
  accesibilidad: {
    grupo: "pantalla-control",
    titulo: "Accesibilidad (controlar el aparato)",
    porQue: "Para que tus otras neuronas, y Astraura cuando tú lo permitas, puedan pulsar y escribir aquí. Siempre con aviso visible y un botón para parar.",
    desde: 3,
    funciones: ["prestar-ventana", "control-entre-neuronas", "astraura-actua"],
  },
  "monitor-entrada": {
    grupo: "pantalla-control",
    titulo: "Monitorización de entrada",
    porQue: "Para notar que estás usando el teclado o el ratón y pausar al instante cualquier control a distancia.",
    desde: 3,
    funciones: ["control-entre-neuronas", "astraura-actua"],
  },
  automatizacion: {
    grupo: "pantalla-control",
    titulo: "Automatización de otras apps",
    porQue: "Para que Astraura pida cosas a otras apps (por ejemplo Música o Finder). El sistema pregunta app por app.",
    desde: 3,
    funciones: ["astraura-actua", "centro-control-nativo"],
  },
  superposicion: {
    grupo: "pantalla-control",
    titulo: "Mostrar sobre otras apps",
    porQue: "Para enseñar siempre encima el aviso de «te están controlando» con su botón de parar, y la orbe de Astraura.",
    desde: 3,
    funciones: ["control-entre-neuronas", "astraura-actua"],
  },
  arranque: {
    grupo: "segundo-plano",
    titulo: "Abrir al iniciar sesión",
    porQue: "Para que tu neurona esté disponible para tus otras neuronas y te avise aunque no la abras tú.",
    desde: 3,
    funciones: ["siempre-disponible", "avisos", "control-entre-neuronas"],
  },
  bateria: {
    grupo: "segundo-plano",
    titulo: "Sin límite de batería",
    porQue: "Para que las antenas sigan vivas con la pantalla apagada. Puedes dejarlo: se usarán solo con la app abierta.",
    desde: 1,
    funciones: ["siempre-disponible", "malla-radios"],
  },
  carpetas: {
    grupo: "archivos",
    titulo: "Carpetas protegidas",
    porQue: "Escritorio, Documentos y Descargas: el sistema pregunta la primera vez que eliges una de ellas para vincularla.",
    desde: 3,
    funciones: ["carpetas-compartidas"],
  },
  "disco-completo": {
    grupo: "archivos",
    titulo: "Acceso total al disco",
    porQue: "Para compartir con tus neuronas cualquier carpeta o volumen sin elegirlos uno a uno.",
    desde: 3,
    funciones: ["carpetas-compartidas"],
  },
  "todos-archivos": {
    grupo: "archivos",
    titulo: "Acceso a todos los archivos",
    porQue: "Para compartir con tus neuronas cualquier carpeta o memoria del aparato, no solo las que elijas.",
    desde: 3,
    funciones: ["carpetas-compartidas"],
  },
  instalar: {
    grupo: "sistema",
    titulo: "Instalar apps desconocidas",
    porQue: "Para que la app se actualice sola desde el canal de StarSeed (la firma se comprueba antes).",
    desde: 1,
    funciones: ["actualizacion-sola"],
  },
  "no-molestar": {
    grupo: "sistema",
    titulo: "Acceso a No molestar",
    porQue: "Para que el centro de control encienda y apague el No molestar de verdad del aparato.",
    desde: 3,
    funciones: ["centro-control-nativo"],
  },
  "escribir-ajustes": {
    grupo: "sistema",
    titulo: "Modificar ajustes del sistema",
    porQue: "Para que el centro de control cambie el brillo real de la pantalla.",
    desde: 3,
    funciones: ["centro-control-nativo"],
  },
  capacidades: {
    grupo: "sistema",
    titulo: "Capacidades del aparato",
    porQue: "Procesador, memoria, disco, batería y temperatura: se leen sin pedir nada, para decidir qué puede prestar esta neurona.",
    desde: 3,
    funciones: ["prestar-proceso"],
  },
};

/** Lo propio de cada sistema: cómo se pide, si se lee, en qué fase hace falta y aclaraciones. */
type Especifico = Pick<DefPermiso, "como" | "lectura" | "fase"> & Partial<Pick<DefPermiso, "opcional" | "nota" | "porQue" | "titulo">>;

const MACOS: [IdPermiso, Especifico][] = [
  ["bluetooth", { como: "aviso", lectura: "si", fase: 1 }],
  ["red-local", { como: "aviso", lectura: "parcial", fase: 1, nota: "macOS no deja leer este permiso: se deduce de si la malla local responde." }],
  ["ubicacion-wifi", { como: "aviso", lectura: "si", fase: 1, opcional: true }],
  ["notificaciones", { como: "aviso", lectura: "parcial", fase: 1 }],
  ["microfono", { como: "aviso", lectura: "si", fase: 1 }],
  ["camara", { como: "aviso", lectura: "si", fase: 1 }],
  [
    "pantalla",
    {
      como: "aviso-y-panel",
      lectura: "si",
      fase: 1,
      opcional: true,
      titulo: "Grabación de pantalla y audio del sistema",
      nota: "Se activa en Ajustes del Sistema; macOS puede pedir reabrir la app y, desde macOS 15, vuelve a confirmarlo cada cierto tiempo.",
    },
  ],
  ["accesibilidad", { como: "aviso-y-panel", lectura: "si", fase: 1, opcional: true, nota: "Se activa en Ajustes del Sistema › Privacidad y seguridad › Accesibilidad." }],
  ["monitor-entrada", { como: "aviso-y-panel", lectura: "si", fase: 3 }],
  ["automatizacion", { como: "por-uso", lectura: "no", fase: 4, nota: "macOS pregunta app por app la primera vez que se usa." }],
  ["arranque", { como: "aviso", lectura: "si", fase: 1, opcional: true, nota: "macOS lo enseña en Ajustes del Sistema › General › Ítems de inicio." }],
  ["carpetas", { como: "por-uso", lectura: "no", fase: 1 }],
  ["disco-completo", { como: "panel", lectura: "no", fase: 6, nota: "macOS no deja a la app saber si lo diste: solo se ve por lo que puede abrir." }],
  ["capacidades", { como: "nada", lectura: "si", fase: 1 }],
];

const ANDROID: [IdPermiso, Especifico][] = [
  ["cercanos", { como: "aviso", lectura: "si", fase: 1 }],
  ["nfc", { como: "declaracion", lectura: "si", fase: 6 }],
  ["notificaciones", { como: "aviso", lectura: "si", fase: 1 }],
  ["microfono", { como: "aviso", lectura: "si", fase: 1 }],
  ["camara", { como: "aviso", lectura: "si", fase: 1 }],
  ["llamadas", { como: "panel", lectura: "si", fase: 1, opcional: true }],
  [
    "pantalla",
    {
      como: "por-uso",
      lectura: "no",
      fase: 2,
      titulo: "Grabar o compartir pantalla",
      nota: "Android pregunta cada vez que empieza a compartirse (no se puede dar de antemano).",
    },
  ],
  [
    "accesibilidad",
    {
      como: "panel",
      lectura: "si",
      fase: 3,
      nota: "Instalada fuera de la tienda, Android 13+ exige antes «Permitir ajustes restringidos» en la ficha de la app.",
    },
  ],
  ["superposicion", { como: "panel", lectura: "si", fase: 3 }],
  ["bateria", { como: "aviso", lectura: "si", fase: 1, opcional: true }],
  ["todos-archivos", { como: "panel", lectura: "si", fase: 6 }],
  ["instalar", { como: "panel", lectura: "si", fase: 1, opcional: true }],
  ["no-molestar", { como: "panel", lectura: "si", fase: 5 }],
  ["escribir-ajustes", { como: "panel", lectura: "si", fase: 5 }],
  ["capacidades", { como: "nada", lectura: "si", fase: 1 }],
];

const WINDOWS: [IdPermiso, Especifico][] = [
  ["bluetooth", { como: "nada", lectura: "si", fase: 1, nota: "Windows no pide permiso a las apps de escritorio para el Bluetooth." }],
  ["red-local", { como: "por-uso", lectura: "no", fase: 1, nota: "El Firewall de Windows pregunta la primera vez que la neurona escucha en la red: elige «Redes privadas»." }],
  [
    "ubicacion-wifi",
    { como: "por-uso", lectura: "no", fase: 1, opcional: true, nota: "Desde Windows 11 24H2 ver el nombre de las redes Wi-Fi pide «Ubicación» para apps de escritorio." },
  ],
  ["notificaciones", { como: "nada", lectura: "no", fase: 1, nota: "Activadas por defecto; se apagan en Configuración › Notificaciones." }],
  ["microfono", { como: "por-uso", lectura: "no", fase: 1, nota: "Permitido salvo que hayas apagado «Permitir que las apps de escritorio accedan al micrófono»." }],
  ["camara", { como: "por-uso", lectura: "no", fase: 1, nota: "Permitida salvo que hayas apagado «Permitir que las apps de escritorio accedan a la cámara»." }],
  ["pantalla", { como: "nada", lectura: "si", fase: 1, nota: "Windows no pide permiso para capturar; marca con un borde la ventana que se comparte." }],
  ["accesibilidad", { como: "nada", lectura: "si", fase: 1, nota: "No pide permiso, pero no deja tocar ventanas de administrador ni la pantalla de inicio de sesión." }],
  ["arranque", { como: "aviso", lectura: "si", fase: 1, opcional: true }],
  ["capacidades", { como: "nada", lectura: "si", fase: 1 }],
];

const LINUX_X11: [IdPermiso, Especifico][] = [
  ["bluetooth", { como: "nada", lectura: "si", fase: 1 }],
  ["red-local", { como: "nada", lectura: "si", fase: 1 }],
  ["notificaciones", { como: "nada", lectura: "no", fase: 1 }],
  ["microfono", { como: "nada", lectura: "no", fase: 1 }],
  ["camara", { como: "nada", lectura: "no", fase: 1 }],
  ["pantalla", { como: "nada", lectura: "si", fase: 1, nota: "En X11 cualquier app puede ver la pantalla: no hay nada que pedir (ni que proteger)." }],
  ["accesibilidad", { como: "nada", lectura: "si", fase: 1 }],
  ["arranque", { como: "aviso", lectura: "si", fase: 1, opcional: true }],
  ["capacidades", { como: "nada", lectura: "si", fase: 1 }],
];

const LINUX_WAYLAND: [IdPermiso, Especifico][] = [
  ...LINUX_X11.filter(([id]) => id !== "pantalla" && id !== "accesibilidad"),
  ["pantalla", { como: "por-uso", lectura: "no", fase: 1, nota: "Wayland pregunta qué compartir cada vez, con su propio selector." }],
  [
    "accesibilidad",
    { como: "por-uso", lectura: "no", fase: 3, nota: "Wayland solo deja mandar teclas y clics por el portal de Escritorio remoto, que pregunta en cada sesión." },
  ],
];

const POR_SISTEMA: Record<SistemaPermisos, [IdPermiso, Especifico][]> = {
  macos: MACOS,
  android: ANDROID,
  windows: WINDOWS,
  "linux-x11": LINUX_X11,
  "linux-wayland": LINUX_WAYLAND,
};

/** El sistema de la lista a partir de la plataforma de la app (y la sesión gráfica en Linux). */
export function sistemaDePermisos(plataforma: string, sesion?: string | null): SistemaPermisos | null {
  const p = (plataforma || "").toLowerCase();
  if (p === "macos" || p === "darwin") return "macos";
  if (p === "android") return "android";
  if (p === "windows" || p === "win32") return "windows";
  if (p === "linux") return (sesion || "").toLowerCase() === "wayland" ? "linux-wayland" : "linux-x11";
  return null;
}

/** Todos los permisos del sistema, ordenados por grupo y con lo de este sistema aplicado. */
export function registroDe(sistema: SistemaPermisos): DefPermiso[] {
  const filas = POR_SISTEMA[sistema].map(([id, e]) => ({ id, ...BASE[id], ...e }));
  return ORDEN_GRUPOS.flatMap((g) => filas.filter((f) => f.grupo === g));
}

export function defDe(sistema: SistemaPermisos, id: IdPermiso): DefPermiso | null {
  return registroDe(sistema).find((d) => d.id === id) ?? null;
}

export const IDS_PERMISO: readonly IdPermiso[] = Object.keys(BASE) as IdPermiso[];

const ESTADOS: readonly string[] = ["concedido", "denegado", "sin-preguntar", "no-concedido", "desconocido", "no-aplica"];

/** Normaliza un mapa de estados venido del sistema (lo raro se descarta). */
export function normalizarEstados(raw: unknown): Partial<Record<IdPermiso, EstadoSistema>> {
  const out: Partial<Record<IdPermiso, EstadoSistema>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if ((IDS_PERMISO as readonly string[]).includes(k) && typeof v === "string" && ESTADOS.includes(v)) out[k as IdPermiso] = v as EstadoSistema;
  }
  return out;
}

/**
 * Qué ofrece la lista para `def` con su estado real. `yaPedido`: el aviso del sistema ya salió una vez (macOS no
 * lo vuelve a enseñar: desde entonces solo se da en Ajustes). Pura.
 */
export function accionDe(def: DefPermiso, estado: EstadoSistema | undefined, yaPedido = false): AccionPermiso {
  if (def.fase > FASE_ACTUAL) return "mas-adelante";
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
      // Negado una vez, el sistema ya no vuelve a preguntar: se cambia en su pantalla de Ajustes.
      return estado === "denegado" ? "abrir-ajustes" : "pedir";
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

export interface NecesidadFuncion {
  funcion: IdFuncion;
  /** La función existe en el código en este momento (si no, `listo` es siempre false). */
  construida: boolean;
  listo: boolean;
  /** Lo que falta y qué hacer con cada uno. */
  faltan: { id: IdPermiso; titulo: string; accion: AccionPermiso }[];
  /** Permisos que el sistema no deja leer: se piden al usarse y no bloquean. */
  porUso: IdPermiso[];
}

/**
 * «¿Tengo lo que necesito para `funcion` y, si no, qué pido?» — la pregunta que cada función del OS hace aquí
 * antes de empezar. Pura. Los permisos opcionales de la lista son obligatorios para la función que los usa.
 */
export function necesitaPara(
  funcion: IdFuncion,
  sistema: SistemaPermisos,
  estados: Partial<Record<IdPermiso, EstadoSistema>>,
  yaPedidos: readonly IdPermiso[] = [],
): NecesidadFuncion {
  const f = FUNCIONES[funcion];
  const construida = f.estado !== "falta" && f.fase <= FASE_ACTUAL;
  const faltan: NecesidadFuncion["faltan"] = [];
  const porUso: IdPermiso[] = [];
  for (const d of registroDe(sistema).filter((x) => x.funciones.includes(funcion))) {
    const e = estados[d.id];
    if (cubierto(d, e)) continue;
    if (d.como === "por-uso" && (e === undefined || e === "desconocido")) {
      porUso.push(d.id);
      continue;
    }
    // En `necesitaPara` no hay «más adelante»: quien pregunta ES la función que lo necesita.
    const accion = accionDe({ ...d, fase: Math.min(d.fase, FASE_ACTUAL) }, e, yaPedidos.includes(d.id));
    faltan.push({ id: d.id, titulo: d.titulo, accion });
  }
  return { funcion, construida, listo: construida && faltan.length === 0, faltan, porUso };
}

/** Frase corta del estado para la lista (lo que la persona ve junto a cada permiso). */
export function textoEstado(def: DefPermiso, estado: EstadoSistema | undefined, accion: AccionPermiso): string {
  if (accion === "mas-adelante") return `Llega con la fase ${def.fase}: aún no se pide`;
  if (estado === "concedido") return "Concedido";
  if (estado === "no-aplica") return "Este sistema no lo pide";
  if (accion === "nada") return "Nada que hacer";
  if (accion === "por-uso") return "El sistema lo pregunta al usarlo";
  if (estado === "denegado") return "Denegado: se cambia en Ajustes";
  if (def.lectura === "no") return "El sistema no deja saber su estado";
  if (estado === undefined || estado === "desconocido") return "Sin dato todavía";
  if (estado === "no-concedido") return "Sin conceder";
  return "Sin preguntar";
}
