export type Medio =
  | "macos"
  | "android"
  | "windows"
  | "linux-x11"
  | "linux-wayland"
  | "ios"
  | "web";

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
  | "nada";

export type Lectura = "si" | "parcial" | "no";

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

export interface DefPermiso {
  id: IdPermiso;
  grupo: GrupoPermiso;
  titulo: string;
  porQue: string;
  como: ComoSePide;
  lectura: Lectura;
  fase: number;
  desde: number;
  opcional?: boolean;
  funciones: IdFuncion[];
  nota?: string;
}

export interface EnlaceAjustes {
  nivel: "directo" | "lista" | "ficha" | "aviso" | "sin-enlace" | "no-hace-falta";
  pantalla: string;
  pulsa: string;
}

export interface PermisoEnMedio {
  def: DefPermiso;
  medio: Medio;
  enlace: EnlaceAjustes | null;
  estadoInicial: EstadoSistema;
}

export const FASE_ACTUAL = 1;
export const VERSION_MATRIZ = 3;

export const TITULO_GRUPO: Record<GrupoPermiso, string> = {
  malla: "Tus antenas y la malla",
  comunicacion: "Llamadas y avisos",
  "pantalla-control": "Pantalla y control del aparato",
  "segundo-plano": "Siempre disponible",
  archivos: "Archivos y almacenamiento",
  sistema: "Ajustes y capacidades del aparato",
};

export const ORDEN_GRUPOS: GrupoPermiso[] = [
  "malla",
  "comunicacion",
  "pantalla-control",
  "segundo-plano",
  "archivos",
  "sistema",
];

const BASE: Record<IdPermiso, Omit<DefPermiso, "id" | "como" | "lectura" | "fase" | "opcional" | "nota">> = {
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
    porQue:
      "El sistema la pide para dejar ver el nombre de las redes Wi-Fi (red directa con tu Android). StarSeed no usa ni guarda tu ubicación.",
    desde: 1,
    funciones: ["malla-radios"],
  },
  ubicacion: {
    grupo: "malla",
    titulo: "Ubicación (mapa)",
    porQue:
      "Para situar este aparato en el mapa de Señales y en «Usar mi ubicación». Solo se pide cuando tú lo pides; la posición exacta solo la ven tus otras neuronas.",
    desde: 1,
    funciones: ["mapa-senales"],
  },
  cercanos: {
    grupo: "malla",
    titulo: "Dispositivos cercanos",
    porQue:
      "Para buscar, anunciarse y conectar por Bluetooth y por Wi-Fi P2P (Wi-Fi Aware o Wi-Fi Direct, sin router ni hotspot). StarSeed no usa tu ubicación.",
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
    titulo: "Llamadas en pantalla completa",
    porQue:
      "Para que una llamada de StarSeed aparezca a pantalla completa con el teléfono bloqueado. Sin esto llega como aviso emergente.",
    desde: 2,
    funciones: ["llamadas"],
  },
  pantalla: {
    grupo: "pantalla-control",
    titulo: "Grabación de pantalla",
    porQue:
      "Para compartir tu pantalla o una ventana en llamadas y salas, prestar una ventana a otra neurona tuya y que Astraura vea lo que le enseñas.",
    desde: 3,
    funciones: ["prestar-ventana", "compartir-pantalla", "astraura-ve", "control-entre-neuronas"],
  },
  accesibilidad: {
    grupo: "pantalla-control",
    titulo: "Accesibilidad (controlar el aparato)",
    porQue:
      "Para que tus otras neuronas, y Astraura cuando tú lo permitas, puedan pulsar y escribir aquí. Siempre con aviso visible y un botón para parar.",
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
    porQue:
      "Escritorio, Documentos y Descargas: el sistema pregunta la primera vez que eliges una de ellas para vincularla.",
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
    porQue:
      "Procesador, memoria, disco, batería y temperatura: se leen sin pedir nada, para decidir qué puede prestar esta neurona.",
    desde: 3,
    funciones: ["prestar-proceso"],
  },
};

type Especifico = Pick<DefPermiso, "como" | "lectura" | "fase"> &
  Partial<Pick<DefPermiso, "opcional" | "nota" | "porQue" | "titulo">>;

const MACOS: [IdPermiso, Especifico][] = [
  ["bluetooth", { como: "aviso", lectura: "si", fase: 1 }],
  ["red-local", { como: "aviso", lectura: "parcial", fase: 1, nota: "macOS no deja leer este permiso: se deduce de si la malla local responde." }],
  ["ubicacion-wifi", { como: "aviso", lectura: "si", fase: 1, opcional: true }],
  [
    "ubicacion",
    {
      como: "por-uso",
      lectura: "si",
      fase: 1,
      opcional: true,
      nota:
        "El aviso sale al pulsar «Usar mi ubicación», no al instalar. Es el mismo permiso «Localización» de macOS que el de los nombres de Wi-Fi: el aviso sale una sola vez. Si lo negaste, se cambia en Ajustes del Sistema › Privacidad y seguridad › Localización.",
    },
  ],
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
      nota:
        "Se activa en Ajustes del Sistema; macOS puede pedir reabrir la app y, desde macOS 15, vuelve a confirmarlo cada cierto tiempo.",
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
  [
    "ubicacion",
    {
      como: "por-uso",
      lectura: "si",
      fase: 1,
      opcional: true,
      nota:
        "El aviso sale al pulsar «Usar mi ubicación», no al instalar. Android 12+ deja dar solo la ubicación aproximada; el mapa lo dice. Si la negaste, se cambia en Ajustes › Aplicaciones › StarSeed › Permisos › Ubicación.",
    },
  ],
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
  [
    "ubicacion",
    { como: "por-uso", lectura: "no", fase: 1, opcional: true, nota: "En Windows el mapa usa la ubicación del navegador; si no la da, Configuración › Privacidad y seguridad › Ubicación." },
  ],
  ["notificaciones", { como: "nada", lectura: "no", fase: 1, nota: "Activadas por defecto; se apagan en Configuración › Notificaciones." }],
  [
    "microfono",
    { como: "por-uso", lectura: "no", fase: 1, nota: "Permitido salvo que hayas apagado «Permitir que las apps de escritorio accedan al micrófono»." },
  ],
  [
    "camara",
    { como: "por-uso", lectura: "no", fase: 1, nota: "Permitida salvo que hayas apagado «Permitir que las apps de escritorio accedan a la cámara»." },
  ],
  ["pantalla", { como: "nada", lectura: "si", fase: 1, nota: "Windows no pide permiso para capturar; marca con un borde la ventana que se comparte." }],
  [
    "accesibilidad",
    { como: "nada", lectura: "si", fase: 1, nota: "No pide permiso, pero no deja tocar ventanas de administrador ni la pantalla de inicio de sesión." },
  ],
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

const IOS: [IdPermiso, Especifico][] = [
  ["ubicacion", { como: "por-uso", lectura: "parcial", fase: 1, opcional: true, nota: "Safari expone geolocation en permissions.query; micrófono y cámara no." }],
  ["notificaciones", { como: "por-uso", lectura: "si", fase: 1, opcional: true, nota: "iOS 16.4+ con gesto; Notification.permission legible." }],
  ["microfono", { como: "por-uso", lectura: "no", fase: 1, opcional: true, nota: "Safari no expone microphone en permissions.query; se intenta y se maneja error." }],
  ["camara", { como: "por-uso", lectura: "no", fase: 1, opcional: true, nota: "Safari no expone camera en permissions.query; se intenta y se maneja error." }],
  ["pantalla", { como: "nada", lectura: "no", fase: 1, nota: "getDisplayMedia no existe en iOS." }],
  ["capacidades", { como: "nada", lectura: "si", fase: 1 }],
];

const WEB: [IdPermiso, Especifico][] = [
  ["microfono", { como: "aviso", lectura: "si", fase: 1 }],
  ["camara", { como: "aviso", lectura: "si", fase: 1 }],
  ["ubicacion", { como: "aviso", lectura: "si", fase: 1 }],
  ["notificaciones", { como: "aviso", lectura: "si", fase: 1 }],
  ["pantalla", { como: "por-uso", lectura: "no", fase: 1, nota: "getDisplayMedia no consultable en permissions.query; se pide al usar." }],
  ["capacidades", { como: "nada", lectura: "si", fase: 1 }],
];

const POR_MEDIO: Record<Medio, [IdPermiso, Especifico][]> = {
  macos: MACOS,
  android: ANDROID,
  windows: WINDOWS,
  "linux-x11": LINUX_X11,
  "linux-wayland": LINUX_WAYLAND,
  ios: IOS,
  web: WEB,
};

function fusionar(base: typeof BASE, esp: [IdPermiso, Especifico][]): DefPermiso[] {
  return esp.map(([id, e]) => ({ id, ...base[id], ...e }));
}

export function registroDe(medio: Medio): DefPermiso[] {
  const filas = fusionar(BASE, POR_MEDIO[medio]);
  return ORDEN_GRUPOS.flatMap((g) => filas.filter((f) => f.grupo === g));
}

export function defDe(medio: Medio, id: IdPermiso): DefPermiso | null {
  return registroDe(medio).find((d) => d.id === id) ?? null;
}

export const IDS_PERMISO: readonly IdPermiso[] = Object.keys(BASE) as IdPermiso[];

const MAC_ENLACES: Partial<Record<IdPermiso, EnlaceAjustes>> = {
  bluetooth: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Bluetooth", pulsa: "Activa el interruptor de StarSeed OS." },
  "red-local": { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Red local", pulsa: "Activa el interruptor de StarSeed OS. (macOS 15+)" },
  "ubicacion-wifi": { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Localización", pulsa: "Activa «Localización» arriba y el interruptor de StarSeed OS." },
  ubicacion: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Localización", pulsa: "Activa «Localización» arriba y el interruptor de StarSeed OS." },
  notificaciones: { nivel: "lista", pantalla: "Ajustes del Sistema › Notificaciones", pulsa: "Busca StarSeed OS en la lista y activa «Permitir notificaciones»." },
  microfono: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Micrófono", pulsa: "Activa el interruptor de StarSeed OS." },
  camara: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Cámara", pulsa: "Activa el interruptor de StarSeed OS." },
  pantalla: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Grabación de pantalla y audio del sistema", pulsa: "Activa el interruptor de StarSeed OS y, si macOS lo pide, pulsa «Salir y volver a abrir»." },
  accesibilidad: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Accesibilidad", pulsa: "Activa el interruptor de StarSeed OS (te pedirá tu contraseña o Touch ID: eso lo haces tú)." },
  "monitor-entrada": { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Monitorización de entrada", pulsa: "Activa el interruptor de StarSeed OS." },
  automatizacion: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Automatización", pulsa: "Se rellena sola la primera vez que StarSeed OS maneja otra app: allí activa la app que quieras." },
  "disco-completo": { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Acceso total al disco", pulsa: "Activa el interruptor de StarSeed OS y reabre la app." },
  carpetas: { nivel: "directo", pantalla: "Ajustes del Sistema › Privacidad y seguridad › Archivos y carpetas", pulsa: "Activa las carpetas que quieras compartir bajo StarSeed OS." },
  arranque: { nivel: "lista", pantalla: "Ajustes del Sistema › General › Ítems de inicio", pulsa: "En «Permitir en segundo plano» activa StarSeed OS." },
  capacidades: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Leer las capacidades del aparato no pide nada." },
};

const WIN_ENLACES: Partial<Record<IdPermiso, EnlaceAjustes>> = {
  bluetooth: { nivel: "directo", pantalla: "Configuración › Bluetooth y dispositivos", pulsa: "Activa «Bluetooth»." },
  "red-local": { nivel: "sin-enlace", pantalla: "Firewall de Windows (lo abre el propio Windows)", pulsa: "No hay pantalla de Configuración para esto: Windows pregunta solo la primera vez que StarSeed OS escucha en la red. Elige «Redes privadas»." },
  "ubicacion-wifi": { nivel: "directo", pantalla: "Configuración › Privacidad y seguridad › Ubicación", pulsa: "Activa «Servicios de ubicación» y «Permitir que las aplicaciones de escritorio accedan a tu ubicación»." },
  ubicacion: { nivel: "directo", pantalla: "Configuración › Privacidad y seguridad › Ubicación", pulsa: "Activa «Servicios de ubicación» y «Permitir que las aplicaciones de escritorio accedan a tu ubicación»." },
  notificaciones: { nivel: "directo", pantalla: "Configuración › Sistema › Notificaciones", pulsa: "Activa «Notificaciones» y, en la lista, StarSeed OS." },
  microfono: { nivel: "directo", pantalla: "Configuración › Privacidad y seguridad › Micrófono", pulsa: "Activa «Permitir que las aplicaciones de escritorio accedan al micrófono»." },
  camara: { nivel: "directo", pantalla: "Configuración › Privacidad y seguridad › Cámara", pulsa: "Activa «Permitir que las aplicaciones de escritorio accedan a la cámara»." },
  pantalla: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Windows no pide permiso para compartir pantalla; marca con un borde la ventana que se comparte." },
  accesibilidad: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Windows no pide permiso para mandar teclas y clics (no llega a ventanas de administrador)." },
  arranque: { nivel: "directo", pantalla: "Configuración › Aplicaciones › Inicio", pulsa: "Activa StarSeed OS en la lista." },
  capacidades: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Leer las capacidades del aparato no pide nada." },
};

const AND_ENLACES: Partial<Record<IdPermiso, EnlaceAjustes>> = {
  cercanos: { nivel: "ficha", pantalla: "Información de la app StarSeed OS", pulsa: "Pulsa «Permisos» › «Dispositivos cercanos» › «Permitir»." },
  ubicacion: { nivel: "ficha", pantalla: "Información de la app StarSeed OS", pulsa: "Pulsa «Permisos» › «Ubicación» › «Permitir solo mientras la app está en uso» (y «Usar ubicación precisa» si quieres el punto exacto)." },
  nfc: { nivel: "no-hace-falta", pantalla: "—", pulsa: "NFC no pide permiso: basta con que esté encendido en el aparato." },
  notificaciones: { nivel: "directo", pantalla: "Ajustes › Aplicaciones › StarSeed OS › Notificaciones", pulsa: "Activa «Permitir notificaciones»." },
  microfono: { nivel: "ficha", pantalla: "Información de la app StarSeed OS", pulsa: "Pulsa «Permisos» › «Micrófono» › «Permitir solo mientras la app está en uso»." },
  camara: { nivel: "ficha", pantalla: "Información de la app StarSeed OS", pulsa: "Pulsa «Permisos» › «Cámara» › «Permitir solo mientras la app está en uso»." },
  llamadas: { nivel: "directo", pantalla: "Ajustes › Aplicaciones › Acceso especial › Notificaciones a pantalla completa (Android 14+)", pulsa: "Activa «Permitir notificaciones a pantalla completa». En Android 13 o anterior no hace falta." },
  pantalla: { nivel: "aviso", pantalla: "Aviso del sistema", pulsa: "Android pregunta cada vez que empieza a compartirse la pantalla: elige «Pantalla completa» o «Una sola app» y pulsa «Empezar ahora»." },
  accesibilidad: { nivel: "lista", pantalla: "Ajustes › Accesibilidad › Aplicaciones instaladas", pulsa: "Pulsa «StarSeed OS», activa el interruptor y confirma con «Permitir». Si sale en gris, antes pulsa ⋮ en la ficha de la app › «Permitir ajustes restringidos»." },
  superposicion: { nivel: "directo", pantalla: "Ajustes › Aplicaciones › Acceso especial › Mostrar sobre otras apps › StarSeed OS", pulsa: "Activa «Permitir mostrar sobre otras apps»." },
  bateria: { nivel: "directo", pantalla: "Diálogo del sistema «¿Permitir que StarSeed OS ignore las optimizaciones de batería?»", pulsa: "Pulsa «Permitir»." },
  "todos-archivos": { nivel: "directo", pantalla: "Ajustes › Aplicaciones › Acceso especial › Acceso a todos los archivos › StarSeed OS", pulsa: "Activa «Permitir acceso para administrar todos los archivos»." },
  instalar: { nivel: "directo", pantalla: "Ajustes › Aplicaciones › Acceso especial › Instalar apps desconocidas › StarSeed OS", pulsa: "Activa «Permitir desde esta fuente»." },
  "no-molestar": { nivel: "lista", pantalla: "Ajustes › Notificaciones › Acceso a No molestar", pulsa: "Pulsa StarSeed OS y activa «Permitir acceso a No molestar»." },
  "escribir-ajustes": { nivel: "directo", pantalla: "Ajustes › Aplicaciones › Acceso especial › Modificar ajustes del sistema › StarSeed OS", pulsa: "Activa «Permitir modificar los ajustes del sistema»." },
  capacidades: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Leer las capacidades del aparato no pide nada." },
};

const LINUX_X11_ENLACES: Partial<Record<IdPermiso, EnlaceAjustes>> = {
  bluetooth: { nivel: "no-hace-falta", pantalla: "—", pulsa: "BlueZ no pide permiso a la app; solo hace falta que el Bluetooth esté encendido." },
  "red-local": { nivel: "no-hace-falta", pantalla: "—", pulsa: "Linux no pide permiso para la red local." },
  notificaciones: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Linux no pide permiso para las notificaciones." },
  microfono: { nivel: "sin-enlace", pantalla: "Los ajustes de sonido de tu escritorio", pulsa: "Linux no tiene una pantalla de permisos única: cada escritorio (GNOME, KDE…) pone la suya y la app no puede saber cuál es, así que no abre ninguna. Si la app no oye, mira Sonido › Entrada y que el micrófono no esté silenciado." },
  camara: { nivel: "sin-enlace", pantalla: "Los ajustes de privacidad de tu escritorio", pulsa: "Linux no tiene una pantalla de permisos única: cada escritorio (GNOME, KDE…) pone la suya y la app no puede saber cuál es, así que no abre ninguna. Si la cámara no sale, comprueba que no la use otra app." },
  pantalla: { nivel: "no-hace-falta", pantalla: "—", pulsa: "En X11 cualquier app puede ver la pantalla: no hay nada que pedir." },
  accesibilidad: { nivel: "no-hace-falta", pantalla: "—", pulsa: "En X11 cualquier app puede mandar teclas y clics: no hay nada que pedir." },
  arranque: { nivel: "sin-enlace", pantalla: "Aplicaciones al inicio de tu escritorio", pulsa: "Linux no tiene una pantalla de permisos única: cada escritorio (GNOME, KDE…) pone la suya y la app no puede saber cuál es, así que no abre ninguna. StarSeed OS crea su entrada en ~/.config/autostart; para quitarla, bórrala desde el gestor de inicio de tu escritorio." },
  capacidades: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Leer las capacidades del aparato no pide nada." },
};

const LINUX_WAYLAND_ENLACES: Partial<Record<IdPermiso, EnlaceAjustes>> = {
  ...LINUX_X11_ENLACES,
  pantalla: { nivel: "aviso", pantalla: "Aviso del sistema", pulsa: "Wayland pregunta con su propio selector cada vez que se comparte la pantalla: elige la pantalla o ventana y pulsa «Compartir»." },
  accesibilidad: { nivel: "aviso", pantalla: "Aviso del sistema", pulsa: "Wayland solo deja mandar teclas y clics por el portal de Escritorio remoto, que pregunta en cada sesión: pulsa «Permitir»." },
};

const IOS_ENLACES: Partial<Record<IdPermiso, EnlaceAjustes>> = {
  ubicacion: { nivel: "ficha", pantalla: "Ajustes › StarSeed OS › Ubicación", pulsa: "Activa «Ubicación» y elige «Mientras uso la app»." },
  notificaciones: { nivel: "ficha", pantalla: "Ajustes › Notificaciones › StarSeed OS", pulsa: "Activa «Permitir notificaciones»." },
  microfono: { nivel: "ficha", pantalla: "Ajustes › StarSeed OS › Micrófono", pulsa: "Activa «Micrófono»." },
  camara: { nivel: "ficha", pantalla: "Ajustes › StarSeed OS › Cámara", pulsa: "Activa «Cámara»." },
  pantalla: { nivel: "no-hace-falta", pantalla: "—", pulsa: "getDisplayMedia no existe en iOS." },
  capacidades: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Leer las capacidades del aparato no pide nada." },
};

const WEB_ENLACES: Partial<Record<IdPermiso, EnlaceAjustes>> = {
  microfono: { nivel: "ficha", pantalla: "Configuración del navegador › Privacidad › Micrófono", pulsa: "Busca StarSeed OS y activa el permiso." },
  camara: { nivel: "ficha", pantalla: "Configuración del navegador › Privacidad › Cámara", pulsa: "Busca StarSeed OS y activa el permiso." },
  ubicacion: { nivel: "ficha", pantalla: "Configuración del navegador › Privacidad › Ubicación", pulsa: "Busca StarSeed OS y activa el permiso." },
  notificaciones: { nivel: "ficha", pantalla: "Configuración del navegador › Privacidad › Notificaciones", pulsa: "Busca StarSeed OS y activa el permiso." },
  pantalla: { nivel: "sin-enlace", pantalla: "—", pulsa: "El navegador pregunta con su propio diálogo al usar getDisplayMedia; no hay pantalla de ajustes previa." },
  capacidades: { nivel: "no-hace-falta", pantalla: "—", pulsa: "Leer las capacidades del aparato no pide nada." },
};

const ENLACES_POR_MEDIO: Record<Medio, Partial<Record<IdPermiso, EnlaceAjustes>>> = {
  macos: MAC_ENLACES,
  windows: WIN_ENLACES,
  android: AND_ENLACES,
  "linux-x11": LINUX_X11_ENLACES,
  "linux-wayland": LINUX_WAYLAND_ENLACES,
  ios: IOS_ENLACES,
  web: WEB_ENLACES,
};

export function enlaceDe(medio: Medio, id: IdPermiso): EnlaceAjustes | null {
  return ENLACES_POR_MEDIO[medio][id] ?? null;
}

export function filasDe(medio: Medio): [IdPermiso, EnlaceAjustes][] {
  return Object.entries(ENLACES_POR_MEDIO[medio]) as [IdPermiso, EnlaceAjustes][];
}

export function hayBotonAjustes(enlace: EnlaceAjustes | null): boolean {
  return !!enlace && (enlace.nivel === "directo" || enlace.nivel === "lista" || enlace.nivel === "ficha");
}

export function textoEnlace(enlace: EnlaceAjustes | null): string {
  if (!enlace) return "";
  switch (enlace.nivel) {
    case "directo":
      return `Se abre «${enlace.pantalla}». ${enlace.pulsa}`;
    case "lista":
      return `Se abre «${enlace.pantalla}» (la lista, no el interruptor). ${enlace.pulsa}`;
    case "ficha":
      return `El sistema no tiene una pantalla propia para esto: se abre «${enlace.pantalla}». ${enlace.pulsa}`;
    case "aviso":
      return enlace.pulsa;
    case "sin-enlace":
      return `No hay enlace directo en este sistema. ${enlace.pulsa}`;
    default:
      return enlace.pulsa;
  }
}

export function accionDe(
  def: DefPermiso,
  estado: EstadoSistema | undefined,
  yaPedidoAviso = false,
): AccionPermiso {
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
      return yaPedidoAviso || estado === "denegado" ? "abrir-ajustes" : "pedir";
    case "aviso":
      return estado === "denegado" ? "abrir-ajustes" : "pedir";
  }
}

export function esAccionable(a: AccionPermiso): boolean {
  return a === "pedir" || a === "abrir-ajustes";
}

function cubierto(def: DefPermiso, estado: EstadoSistema | undefined): boolean {
  if (def.como === "nada" || def.como === "declaracion") return true;
  return estado === "concedido" || estado === "no-aplica";
}

export interface NecesidadFuncion {
  funcion: IdFuncion;
  construida: boolean;
  listo: boolean;
  faltan: { id: IdPermiso; titulo: string; accion: AccionPermiso }[];
  porUso: IdPermiso[];
}

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

export interface GuardadoPermisos {
  version: number;
  vistos: IdPermiso[];
  resultados: Partial<Record<IdPermiso, "concedido" | "denegado" | "omitido" | "no-disponible">>;
  avisos?: IdPermiso[];
}

export const GUARDADO_VACIO: GuardadoPermisos = { version: 0, vistos: [], resultados: {} };

export function leerGuardado(raw: string | null | undefined): GuardadoPermisos {
  if (!raw) return GUARDADO_VACIO;
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object") return GUARDADO_VACIO;
    const g = o as { version?: unknown; vistos?: unknown; resultados?: unknown; avisos?: unknown };
    const resultados: GuardadoPermisos["resultados"] = {};
    if (g.resultados && typeof g.resultados === "object") {
      for (const [k, v] of Object.entries(g.resultados as Record<string, unknown>)) {
        if (IDS_PERMISO.includes(k as IdPermiso) && typeof v === "string" && ["concedido", "denegado", "omitido", "no-disponible"].includes(v)) {
          resultados[k as IdPermiso] = v as GuardadoPermisos["resultados"][IdPermiso];
        }
      }
    }
    const version = typeof g.version === "number" && Number.isFinite(g.version) && g.version >= 0 ? Math.floor(g.version) : 0;
    const vistos = Array.isArray(g.vistos) ? g.vistos.filter((v): v is IdPermiso => typeof v === "string" && IDS_PERMISO.includes(v as IdPermiso)) : [];
    const avisos = Array.isArray(g.avisos) ? g.avisos.filter((v): v is IdPermiso => typeof v === "string" && IDS_PERMISO.includes(v as IdPermiso)) : [];
    return avisos.length ? { version, vistos, resultados, avisos } : { version, vistos, resultados };
  } catch {
    return GUARDADO_VACIO;
  }
}

export function serializarGuardado(g: GuardadoPermisos): string {
  return JSON.stringify(g);
}

export function yaPedidoAviso(g: Pick<GuardadoPermisos, "avisos">, id: IdPermiso): boolean {
  return !!g.avisos?.includes(id);
}

export function colaPendientes(
  medio: Medio,
  g: GuardadoPermisos,
  estados: Partial<Record<IdPermiso, EstadoSistema>> = {},
  forzar = false,
): DefPermiso[] {
  return registroDe(medio).filter(
    (d) => esAccionable(accionDe(d, estados[d.id], yaPedidoAviso(g, d.id))) && (forzar || !g.vistos.includes(d.id)),
  );
}

export function debeAbrirseSolo(
  medio: Medio,
  g: GuardadoPermisos,
  estados: Partial<Record<IdPermiso, EstadoSistema>> = {},
): boolean {
  return colaPendientes(medio, g, estados, false).length > 0;
}

export function marcarVisto(g: GuardadoPermisos, id: IdPermiso, resultado: GuardadoPermisos["resultados"][IdPermiso]): GuardadoPermisos {
  const vistos = new Set(g.vistos);
  vistos.add(id);
  const resultados = { ...g.resultados, [id]: resultado };
  return { ...g, vistos: Array.from(vistos), resultados };
}

export function marcarAviso(g: GuardadoPermisos, id: IdPermiso): GuardadoPermisos {
  const avisos = new Set(g.avisos ?? []);
  avisos.add(id);
  return { ...g, avisos: Array.from(avisos) };
}