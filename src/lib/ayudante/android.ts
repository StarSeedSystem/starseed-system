/**
 * Ayudante · Android sin root (TRM1125I).
 * Contrato: `architecture/terminal-entre-neuronas.md` §«En todas las versiones nativas» y
 * `architecture/control-remoto-entre-neuronas.md` §3 (tabla Android).
 * Sin root no hay nivel administrador: solo la terminal de la app.
 * Órdenes tipadas que el sistema permite a una app (almacenes por el marco de acceso,
 * abrir el ajuste del sistema que corresponda) van por la propia app.
 * Puro, sin `node:*`, nunca lanza.
 */

export type SistemaAndroid = "android";

export type TipoOrdenAndroid =
    | "almacenes"
    | "ajustes"
    | "pantalla"
    | "accesibilidad"
    | "superposicion"
    | "bateria"
    | "red"
    | "notificaciones"
    | "ajustes-rapidos";

export interface ArgsOrdenAndroid {
    [clave: string]: unknown;
}

export interface ComandoAndroid {
    nombre: string;
    tipo: TipoOrdenAndroid;
    descripcion: string;
    args: ArgsOrdenAndroid;
    ejemploArgs: ArgsOrdenAndroid;
    requiereRoot: boolean;
    requiereAyudante: boolean;
    sistemas: readonly SistemaAndroid[];
    permisosRequeridos: readonly string[];
}

export const COMANDOS_ANDROID: readonly ComandoAndroid[] = [
    {
        nombre: "almacen-estado",
        tipo: "almacenes",
        descripcion: "Estado de los almacenes accesibles (Storage Access Framework)",
        args: {},
        ejemploArgs: {},
        requiereRoot: false,
        requiereAyudante: false,
        sistemas: ["android"],
        permisosRequeridos: [],
    },
    {
        nombre: "almacen-salud",
        tipo: "almacenes",
        descripcion: "Salud de un volumen (por ID de documento SAF)",
        args: { disco: "" },
        ejemploArgs: { disco: "primary:Documents" },
        requiereRoot: false,
        requiereAyudante: false,
        sistemas: ["android"],
        permisosRequeridos: [],
    },
    {
        nombre: "almacen-acceder",
        tipo: "almacenes",
        descripcion: "Solicita acceso a un directorio/volumen vía SAF (pide consentimiento)",
        args: { uri: "" },
        ejemploArgs: { uri: "content://com.android.externalstorage.documents/tree/primary%3ADocuments" },
        requiereRoot: false,
        requiereAyudante: false,
        sistemas: ["android"],
        permisosRequeridos: [],
    },
    {
        nombre: "ajustes-abrir",
        tipo: "ajustes",
        descripcion: "Abre la pantalla de ajustes del sistema indicada (no cambia nada, solo navega)",
        args: { pantalla: "" },
        ejemploArgs: { pantalla: "accesibilidad" },
        requiereRoot: false,
        requiereAyudante: false,
        sistemas: ["android"],
        permisosRequeridos: [],
    },
    {
        nombre: "pantalla-proyectar",
        tipo: "pantalla",
        descripcion: "Inicia proyección de pantalla (MediaProjection) — pide consentimiento cada sesión",
        args: { calidad: 80, ladoMax: 1280 },
        ejemploArgs: { calidad: 80, ladoMax: 1280 },
        requiereRoot: false,
        requiereAyudante: false,
        sistemas: ["android"],
        permisosRequeridos: ["android.permission.FOREGROUND_SERVICE", "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION"],
    },
    {
        nombre: "accesibilidad-estado",
        tipo: "accesibilidad",
        descripcion: "Informa si el servicio de accesibilidad de StarSeed está habilitado",
        args: {},
        ejemploArgs: {},
        requiereRoot: false,
        requiereAyudante: false,
        sistemas: ["android"],
        permisosRequeridos: [],
    },
    {
        nombre: "superposicion-estado",
        tipo: "superposicion",
        descripcion: "Informa si el permiso de superposición (draw over apps) está concedido",
        args: {},
        ejemploArgs: {},
        requiereRoot: false,
        requiereAyudante: false,
        sistemas: ["android"],
        permisosRequeridos: [],
    },
    {
        nombre: "bateria-estado",
        tipo: "bateria",
        descripcion: "Estado de la batería (nivel, carga, temperatura)",
        args: {},
        ejemploArgs: {},
        requiereRoot: false,
        requiereAyudante: false,
        sistemas: ["android"],
        permisosRequeridos: [],
    },
    {
        nombre: "red-estado",
        tipo: "red",
        descripcion: "Estado de la red (Wi‑Fi, móvil, VPN, IP)",
        args: {},
        ejemploArgs: {},
        requiereRoot: false,
        requiereAyudante: false,
        sistemas: ["android"],
        permisosRequeridos: ["android.permission.ACCESS_NETWORK_STATE", "android.permission.ACCESS_WIFI_STATE"],
    },
    {
        nombre: "notificaciones-leer",
        tipo: "notificaciones",
        descripcion: "Lee notificaciones visibles (requiere NotificationListenerService habilitado)",
        args: { limite: 50 },
        ejemploArgs: { limite: 50 },
        requiereRoot: false,
        requiereAyudante: false,
        sistemas: ["android"],
        permisosRequeridos: ["android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"],
    },
    {
        nombre: "ajustes-rapidos-toggle",
        tipo: "ajustes-rapidos",
        descripcion: "Conmuta un tile de ajustes rápidos (wifi, bluetooth, avion, etc.) — no abre Ajustes",
        args: { tile: "", activar: true },
        ejemploArgs: { tile: "wifi", activar: true },
        requiereRoot: false,
        requiereAyudante: false,
        sistemas: ["android"],
        permisosRequeridos: ["android.permission.WRITE_SECURE_SETTINGS"],
    },
];

export const PANTALLAS_AJUSTES_VALIDAS = [
    "accesibilidad",
    "superposicion",
    "notificaciones",
    "bateria",
    "almacenamiento",
    "aplicaciones",
    "seguridad",
    "ubicacion",
    "cuentas",
    "idiomas",
    "fecha-hora",
    "pantalla",
    "sonido",
    "red",
    "vpn",
    "desarrollador",
] as const;

export type PantallaAjustes = (typeof PANTALLAS_AJUSTES_VALIDAS)[number];

export const TILES_AJUSTES_RAPIDOS_VALIDOS = [
    "wifi",
    "bluetooth",
    "avion",
    "datos",
    "ubicacion",
    "linterna",
    "rotacion",
    "no-molestar",
    "ahorro-bateria",
    "pantalla",
    "volumen",
    "proyeccion",
    "punto-acceso",
    "nfc",
] as const;

export type TileAjustesRapidos = (typeof TILES_AJUSTES_RAPIDOS_VALIDOS)[number];

function comando(nombre: string): ComandoAndroid | null {
    return COMANDOS_ANDROID.find((c) => c.nombre === nombre) ?? null;
}

export function sistemasComandoAndroid(nombre: string): readonly SistemaAndroid[] {
    return comando(nombre)?.sistemas ?? [];
}

export function requiereRoot(nombre: string): boolean {
    return comando(nombre)?.requiereRoot ?? false;
}

export function requiereAyudante(nombre: string): boolean {
    return comando(nombre)?.requiereAyudante ?? false;
}

export function permisosComandoAndroid(nombre: string): readonly string[] {
    return comando(nombre)?.permisosRequeridos ?? [];
}

function soloClaves(a: ArgsOrdenAndroid, permitidas: string[]): boolean {
    return Object.keys(a).every((k) => permitidas.includes(k));
}

function validarAlmacenSalud(a: ArgsOrdenAndroid): ArgsOrdenAndroid | null {
    if (!soloClaves(a, ["disco"]) || typeof a.disco !== "string" || a.disco.length === 0) return null;
    return { disco: a.disco };
}

function validarAlmacenAcceder(a: ArgsOrdenAndroid): ArgsOrdenAndroid | null {
    if (!soloClaves(a, ["uri"]) || typeof a.uri !== "string" || a.uri.length === 0) return null;
    return { uri: a.uri };
}

function validarAjustesAbrir(a: ArgsOrdenAndroid): ArgsOrdenAndroid | null {
    if (!soloClaves(a, ["pantalla"]) || typeof a.pantalla !== "string") return null;
    if (!PANTALLAS_AJUSTES_VALIDAS.includes(a.pantalla as PantallaAjustes)) return null;
    return { pantalla: a.pantalla };
}

function validarPantallaProyectar(a: ArgsOrdenAndroid): ArgsOrdenAndroid | null {
    if (!soloClaves(a, ["calidad", "ladoMax"])) return null;
    const calidad = a.calidad;
    const ladoMax = a.ladoMax;
    if (typeof calidad !== "number" || !Number.isInteger(calidad) || calidad < 1 || calidad > 100) return null;
    if (typeof ladoMax !== "number" || !Number.isInteger(ladoMax) || ladoMax < 160 || ladoMax > 2048) return null;
    return { calidad, ladoMax };
}

function validarNotificacionesLeer(a: ArgsOrdenAndroid): ArgsOrdenAndroid | null {
    if (!soloClaves(a, ["limite"])) return null;
    const limite = a.limite;
    if (typeof limite !== "number" || !Number.isInteger(limite) || limite < 1 || limite > 200) return null;
    return { limite };
}

function validarAjustesRapidosToggle(a: ArgsOrdenAndroid): ArgsOrdenAndroid | null {
    if (!soloClaves(a, ["tile", "activar"])) return null;
    const tile = a.tile;
    const activar = a.activar;
    if (typeof tile !== "string" || !TILES_AJUSTES_RAPIDOS_VALIDOS.includes(tile as TileAjustesRapidos)) return null;
    if (typeof activar !== "boolean") return null;
    return { tile, activar };
}

const VALIDADORES_ANDROID: Record<string, (a: ArgsOrdenAndroid) => ArgsOrdenAndroid | null> = {
    "almacen-estado": () => ({}),
    "almacen-salud": validarAlmacenSalud,
    "almacen-acceder": validarAlmacenAcceder,
    "ajustes-abrir": validarAjustesAbrir,
    "pantalla-proyectar": validarPantallaProyectar,
    "accesibilidad-estado": () => ({}),
    "superposicion-estado": () => ({}),
    "bateria-estado": () => ({}),
    "red-estado": () => ({}),
    "notificaciones-leer": validarNotificacionesLeer,
    "ajustes-rapidos-toggle": validarAjustesRapidosToggle,
};

export function validarArgsAndroid(nombre: string, args: ArgsOrdenAndroid): ArgsOrdenAndroid | null {
    const validador = VALIDADORES_ANDROID[nombre];
    if (!validador) return null;
    return validador(args);
}

export function catalogoAndroid(): readonly ComandoAndroid[] {
    return COMANDOS_ANDROID;
}

/**
 * Qué NO se puede hacer en Android sin root — texto que verá la persona.
 * Cada entrada: comando (del catálogo general), motivo técnico, texto visible en la UI.
 */
export interface ComandoNoDisponibleAndroid {
    comando: string;
    motivo: string;
    textoVisible: string;
}

export const COMANDOS_NO_DISPONIBLES_ANDROID: readonly ComandoNoDisponibleAndroid[] = [
    {
        comando: "almacen-formatear",
        motivo: "Formatear discos requiere acceso de bloque y privilegios de root; el marco de acceso (SAF) solo permite leer/escribir archivos en directorios consentidos.",
        textoVisible: "Formatear discos no está disponible sin root. Android solo permite acceder a carpetas que elijas mediante el selector del sistema (SAF).",
    },
    {
        comando: "almacen-montar",
        motivo: "Montar sistemas de archivos requiere CAP_SYS_ADMIN y acceso a /dev/block; una app sin root no puede invocar mount(2).",
        textoVisible: "Montar discos no está disponible sin root. Usa el selector de carpetas del sistema (SAF) para acceder a tus archivos.",
    },
    {
        comando: "almacen-desmontar",
        motivo: "Desmontar requiere CAP_SYS_ADMIN; una app sin root no puede invocar umount(2).",
        textoVisible: "Desmontar discos no está disponible sin root. Para dejar de ver una carpeta, revoca su acceso en Ajustes › Aplicaciones › StarSeed › Permisos.",
    },
    {
        comando: "servicio-reiniciar",
        motivo: "Reiniciar servicios del sistema (systemctl, init) requiere root; una app solo puede reiniciar sus propios procesos.",
        textoVisible: "Reiniciar servicios del sistema no está disponible sin root. Solo la app StarSeed puede reiniciarse a sí misma.",
    },
    {
        comando: "actualizar",
        motivo: "Actualizar el SO (OTA, paquetes del sistema) requiere privilegios de sistema y el gestor de paquetes (pm, apt, dnf); una app no puede hacerlo.",
        textoVisible: "Actualizar el sistema no está disponible desde la app. Las actualizaciones de Android se gestionan en Ajustes › Sistema › Actualización de software.",
    },
    {
        comando: "modo-completo",
        motivo: "El modo administrador completo (terminal root sin límites) exige root (Magisk, KernelSU, su daemon); sin root no existe.",
        textoVisible: "El modo administrador completo no está disponible sin root. En Android sin root solo existen las órdenes tipadas que el sistema permite a una app.",
    },
    {
        comando: "registros",
        motivo: "Leer logs del sistema (logcat -b system, dmesg) requiere READ_LOGS (signature|privileged); una app solo ve sus propios logs.",
        textoVisible: "Leer registros del sistema no está disponible sin root. La app solo puede mostrar sus propios registros internos.",
    },
];

/**
 * Capability nativa Android: permisos que la app declara en AndroidManifest.xml
 * y que el usuario concede (normal/dangerous/special).
 */
export interface PermisoCapability {
    nombre: string;
    descripcion: string;
    tipo: "normal" | "dangerous" | "signature" | "special";
}

export const CAPABILITY_ANDROID = {
    permisos: [
        {
            nombre: "android.permission.FOREGROUND_SERVICE",
            descripcion: "Ejecutar servicio en primer plano para proyección de pantalla",
            tipo: "normal" as const,
        },
        {
            nombre: "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION",
            descripcion: "Tipo de servicio en primer plano para MediaProjection",
            tipo: "normal" as const,
        },
        {
            nombre: "android.permission.ACCESS_NETWORK_STATE",
            descripcion: "Leer estado de red (Wi‑Fi, móvil, VPN)",
            tipo: "normal" as const,
        },
        {
            nombre: "android.permission.ACCESS_WIFI_STATE",
            descripcion: "Leer estado de Wi‑Fi (SSID, BSSID, nivel)",
            tipo: "normal" as const,
        },
        {
            nombre: "android.permission.BIND_NOTIFICATION_LISTENER_SERVICE",
            descripcion: "Servicio que recibe notificaciones (usuario lo habilita en Ajustes)",
            tipo: "special" as const,
        },
        {
            nombre: "android.permission.WRITE_SECURE_SETTINGS",
            descripcion: "Cambiar ajustes seguros (tiles de ajustes rápidos) — solo apps de sistema o con ADB",
            tipo: "signature" as const,
        },
        {
            nombre: "android.permission.BIND_ACCESSIBILITY_SERVICE",
            descripcion: "Servicio de accesibilidad (usuario lo habilita en Ajustes › Accesibilidad)",
            tipo: "special" as const,
        },
        {
            nombre: "android.permission.SYSTEM_ALERT_WINDOW",
            descripcion: "Dibujar sobre otras apps (superposición para indicador de control)",
            tipo: "special" as const,
        },
        {
            nombre: "android.permission.MEDIA_PROJECTION",
            descripcion: "Captura de pantalla (consentimiento por sesión via MediaProjectionManager)",
            tipo: "dangerous" as const,
        },
        {
            nombre: "android.permission.BATTERY_STATS",
            descripcion: "Leer estadísticas detalladas de batería",
            tipo: "dangerous" as const,
        },
    ] as readonly PermisoCapability[],
};

/**
 * Inventario: qué permisos necesita cada orden Android.
 * Clave = nombre de la orden en COMANDOS_ANDROID.
 */
export const INVENTARIO_PERMISOS_ANDROID: Record<string, readonly string[]> = {
    "almacen-estado": [],
    "almacen-salud": [],
    "almacen-acceder": [],
    "ajustes-abrir": [],
    "pantalla-proyectar": [
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION",
        "android.permission.MEDIA_PROJECTION",
    ],
    "accesibilidad-estado": ["android.permission.BIND_ACCESSIBILITY_SERVICE"],
    "superposicion-estado": ["android.permission.SYSTEM_ALERT_WINDOW"],
    "bateria-estado": ["android.permission.BATTERY_STATS"],
    "red-estado": ["android.permission.ACCESS_NETWORK_STATE", "android.permission.ACCESS_WIFI_STATE"],
    "notificaciones-leer": ["android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"],
    "ajustes-rapidos-toggle": ["android.permission.WRITE_SECURE_SETTINGS"],
};

/**
 * COMANDOS_APP_ANDROID: comandos nativos Tauri/Kotlin que la app Android expone.
 * Cada entrada: nombre, argumentos (camelCase para la web, snake_case para Kotlin), lo que devuelve.
 * Se registran en el lado nativo (Kotlin) y se llaman desde `src/lib/control-remoto/nativo-comandos.ts`.
 */
export interface ComandoAppAndroid {
    nombre: string;
    args: Record<string, string>;
    devuelve: string;
}

export const COMANDOS_APP_ANDROID: readonly ComandoAppAndroid[] = [
    {
        nombre: "android_almacen_estado",
        args: {},
        devuelve: "{ volumes: Array<{ id: string; name: string; tipo: string; uri: string }> }",
    },
    {
        nombre: "android_almacen_salud",
        args: { disco: "string" },
        devuelve: "{ libre: number; total: number; salud: 'buena' | 'advertencia' | 'critica' }",
    },
    {
        nombre: "android_almacen_acceder",
        args: { uri: "string" },
        devuelve: "{ ok: boolean; uri?: string; error?: string }",
    },
    {
        nombre: "android_ajustes_abrir",
        args: { pantalla: "string" },
        devuelve: "{ ok: boolean }",
    },
    {
        nombre: "android_pantalla_proyectar",
        args: { calidad: "number", ladoMax: "number" },
        devuelve: "{ ok: boolean; ancho: number; alto: number; giro: number; error?: string }",
    },
    {
        nombre: "android_accesibilidad_estado",
        args: {},
        devuelve: "{ habilitado: boolean; servicio: string }",
    },
    {
        nombre: "android_superposicion_estado",
        args: {},
        devuelve: "{ concedido: boolean }",
    },
    {
        nombre: "android_bateria_estado",
        args: {},
        devuelve: "{ nivel: number; cargando: boolean; temperatura: number; salud: number }",
    },
    {
        nombre: "android_red_estado",
        args: {},
        devuelve: "{ wifi: { conectado: boolean; ssid?: string; nivel: number }; movil: { conectado: boolean; tipo: string }; vpn: boolean; ip: string }",
    },
    {
        nombre: "android_notificaciones_leer",
        args: { limite: "number" },
        devuelve: "{ notificaciones: Array<{ paquete: string; titulo: string; texto: string; tiempo: number }> }",
    },
    {
        nombre: "android_ajustes_rapidos_toggle",
        args: { tile: "string", activar: "boolean" },
        devuelve: "{ ok: boolean; estado: boolean; error?: string }",
    },
];