/**
 * Android · órdenes que una app sin root puede ejecutar (TRM1125I).
 *
 * Contrato: architecture/terminal-entre-neuronas.md §21, §35-50 y
 * architecture/control-remoto-entre-neuronas.md §3, §12, §12.2.
 * Sin root no hay nivel administrador: la app usa el marco de acceso a almacenamiento
 * (SAF) y abre los ajustes del sistema correspondientes. Cada orden dice si existe en
 * Android y el texto que verá la persona.
 */

export type SistemaAndroid = "android";

export type TipoOrdenAndroid =
    | "almacenamiento-saf"
    | "ajustes-sistema"
    | "permiso-especial"
    | "informacion";

export interface ArgsOrdenAndroid {
    [clave: string]: unknown;
}

export interface ComandoAndroid {
    nombre: string;
    tipo: TipoOrdenAndroid;
    descripcion: string;
    /** Texto que ve la persona cuando la orden no está disponible en este Android. */
    textoNoDisponible: string;
    args: ArgsOrdenAndroid;
    ejemploArgs: ArgsOrdenAndroid;
    /** Versión mínima de Android (API level). 0 = siempre. */
    minApi: number;
    /** true si la orden necesita que la persona interactúe (diálogo del sistema). */
    requiereInteraccion: boolean;
}

export const COMANDOS_ANDROID: readonly ComandoAndroid[] = [
    {
        nombre: "almacen-lista-saf",
        tipo: "almacenamiento-saf",
        descripcion: "Lista los almacenes accesibles vía Storage Access Framework",
        textoNoDisponible: "Esta versión de Android no permite listar almacenes SAF.",
        args: {},
        ejemploArgs: {},
        minApi: 21,
        requiereInteraccion: false,
    },
    {
        nombre: "almacen-abrir-saf",
        tipo: "almacenamiento-saf",
        descripcion: "Abre el selector SAF para que la persona elija un directorio o documento",
        textoNoDisponible: "El selector de archivos del sistema no está disponible.",
        args: { mime: "", modo: "directorio" },
        ejemploArgs: { mime: "*/*", modo: "directorio" },
        minApi: 19,
        requiereInteraccion: true,
    },
    {
        nombre: "almacen-leer-saf",
        tipo: "almacenamiento-saf",
        descripcion: "Lee un archivo o directorio concedido por SAF (URI persistente)",
        textoNoDisponible: "No se puede leer el almacén concedido.",
        args: { uri: "", ruta: "" },
        ejemploArgs: { uri: "content://com.android.externalstorage.documents/tree/primary%3ADownload", ruta: "archivo.txt" },
        minApi: 19,
        requiereInteraccion: false,
    },
    {
        nombre: "almacen-escribir-saf",
        tipo: "almacenamiento-saf",
        descripcion: "Escribe un archivo en un directorio concedido por SAF",
        textoNoDisponible: "No se puede escribir en el almacén concedido.",
        args: { uri: "", ruta: "", contenido: "" },
        ejemploArgs: { uri: "content://com.android.externalstorage.documents/tree/primary%3ADocuments", ruta: "nuevo.txt", contenido: "hola" },
        minApi: 21,
        requiereInteraccion: false,
    },
    {
        nombre: "ajustes-accesibilidad",
        tipo: "ajustes-sistema",
        descripcion: "Abre los ajustes de accesibilidad para activar el servicio de StarSeed",
        textoNoDisponible: "No se pueden abrir los ajustes de accesibilidad del sistema.",
        args: {},
        ejemploArgs: {},
        minApi: 16,
        requiereInteraccion: true,
    },
    {
        nombre: "ajustes-superposicion",
        tipo: "ajustes-sistema",
        descripcion: "Abre los ajustes de «Mostrar sobre otras apps» para el indicador",
        textoNoDisponible: "No se pueden abrir los ajustes de superposición.",
        args: {},
        ejemploArgs: {},
        minApi: 23,
        requiereInteraccion: true,
    },
    {
        nombre: "ajustes-notificaciones",
        tipo: "ajustes-sistema",
        descripcion: "Abre los ajustes de notificaciones de la app",
        textoNoDisponible: "No se pueden abrir los ajustes de notificaciones.",
        args: {},
        ejemploArgs: {},
        minApi: 26,
        requiereInteraccion: true,
    },
    {
        nombre: "ajustes-bateria",
        tipo: "ajustes-sistema",
        descripcion: "Abre los ajustes de optimización de batería para la app",
        textoNoDisponible: "No se pueden abrir los ajustes de batería.",
        args: {},
        ejemploArgs: {},
        minApi: 23,
        requiereInteraccion: true,
    },
    {
        nombre: "ajustes-almacenamiento",
        tipo: "ajustes-sistema",
        descripcion: "Abre los ajustes de almacenamiento de la app (para conceder SAF persistente)",
        textoNoDisponible: "No se pueden abrir los ajustes de almacenamiento.",
        args: {},
        ejemploArgs: {},
        minApi: 29,
        requiereInteraccion: true,
    },
    {
        nombre: "permiso-calendario",
        tipo: "permiso-especial",
        descripcion: "Pide el permiso de calendario (READ_CALENDAR/WRITE_CALENDAR)",
        textoNoDisponible: "No se puede pedir el permiso de calendario.",
        args: {},
        ejemploArgs: {},
        minApi: 16,
        requiereInteraccion: true,
    },
    {
        nombre: "permiso-contactos",
        tipo: "permiso-especial",
        descripcion: "Pide el permiso de contactos (READ_CONTACTS/WRITE_CONTACTS)",
        textoNoDisponible: "No se puede pedir el permiso de contactos.",
        args: {},
        ejemploArgs: {},
        minApi: 16,
        requiereInteraccion: true,
    },
    {
        nombre: "permiso-ubicacion",
        tipo: "permiso-especial",
        descripcion: "Pide el permiso de ubicación precisa (ACCESS_FINE_LOCATION)",
        textoNoDisponible: "No se puede pedir el permiso de ubicación.",
        args: { precisa: true },
        ejemploArgs: { precisa: true },
        minApi: 23,
        requiereInteraccion: true,
    },
    {
        nombre: "permiso-microfono",
        tipo: "permiso-especial",
        descripcion: "Pide el permiso de micrófono (RECORD_AUDIO)",
        textoNoDisponible: "No se puede pedir el permiso de micrófono.",
        args: {},
        ejemploArgs: {},
        minApi: 23,
        requiereInteraccion: true,
    },
    {
        nombre: "permiso-camara",
        tipo: "permiso-especial",
        descripcion: "Pide el permiso de cámara (CAMERA)",
        textoNoDisponible: "No se puede pedir el permiso de cámara.",
        args: {},
        ejemploArgs: {},
        minApi: 23,
        requiereInteraccion: true,
    },
    {
        nombre: "info-aparato",
        tipo: "informacion",
        descripcion: "Lee información del aparato (modelo, versión Android, API, almacenamiento)",
        textoNoDisponible: "No se puede leer la información del aparato.",
        args: {},
        ejemploArgs: {},
        minApi: 1,
        requiereInteraccion: false,
    },
    {
        nombre: "info-aplicacion",
        tipo: "informacion",
        descripcion: "Lee información de la app (versión, permisos concedidos, estado servicios)",
        textoNoDisponible: "No se puede leer la información de la app.",
        args: {},
        ejemploArgs: {},
        minApi: 1,
        requiereInteraccion: false,
    },
    {
        nombre: "info-red",
        tipo: "informacion",
        descripcion: "Lee estado de red (Wi‑Fi, datos móviles, Bluetooth, malla local)",
        textoNoDisponible: "No se puede leer el estado de red.",
        args: {},
        ejemploArgs: {},
        minApi: 1,
        requiereInteraccion: false,
    },
    {
        nombre: "info-bateria",
        tipo: "informacion",
        descripcion: "Lee nivel, estado y salud de la batería",
        textoNoDisponible: "No se puede leer la información de la batería.",
        args: {},
        ejemploArgs: {},
        minApi: 1,
        requiereInteraccion: false,
    },
];

function comandoAndroid(nombre: string): ComandoAndroid | null {
    return COMANDOS_ANDROID.find((c) => c.nombre === nombre) ?? null;
}

export function tipoOrdenAndroid(nombre: string): TipoOrdenAndroid | null {
    return comandoAndroid(nombre)?.tipo ?? null;
}

export function textoNoDisponible(nombre: string): string | null {
    return comandoAndroid(nombre)?.textoNoDisponible ?? null;
}

export function minApiOrden(nombre: string): number {
    return comandoAndroid(nombre)?.minApi ?? 0;
}

export function requiereInteraccionOrden(nombre: string): boolean {
    return comandoAndroid(nombre)?.requiereInteraccion ?? false;
}

const RE_MIME = /^[a-z]+\/[\w\*\.\+\-]+$/i;
const RE_MIME_WILDCARD = /^\*\/\*$/;
const RE_URI = /^content:\/\//;

function soloClaves(a: ArgsOrdenAndroid, permitidas: string[]): boolean {
    return Object.keys(a).every((k) => permitidas.includes(k));
}

function validarAlmacenListaSaf(a: ArgsOrdenAndroid): ArgsOrdenAndroid | null {
    if (!soloClaves(a, [])) return null;
    return {};
}

function validarAlmacenAbrirSaf(a: ArgsOrdenAndroid): ArgsOrdenAndroid | null {
    if (!soloClaves(a, ["mime", "modo"])) return null;
    if (typeof a.mime !== "string" || (!RE_MIME.test(a.mime) && !RE_MIME_WILDCARD.test(a.mime))) return null;
    if (a.modo !== "directorio" && a.modo !== "archivo") return null;
    return { mime: a.mime, modo: a.modo };
}

function validarAlmacenLeerSaf(a: ArgsOrdenAndroid): ArgsOrdenAndroid | null {
    if (!soloClaves(a, ["uri", "ruta"])) return null;
    if (typeof a.uri !== "string" || !RE_URI.test(a.uri)) return null;
    if (typeof a.ruta !== "string" || a.ruta.length === 0) return null;
    return { uri: a.uri, ruta: a.ruta };
}

function validarAlmacenEscribirSaf(a: ArgsOrdenAndroid): ArgsOrdenAndroid | null {
    if (!soloClaves(a, ["uri", "ruta", "contenido"])) return null;
    if (typeof a.uri !== "string" || !RE_URI.test(a.uri)) return null;
    if (typeof a.ruta !== "string" || a.ruta.length === 0) return null;
    if (typeof a.contenido !== "string") return null;
    return { uri: a.uri, ruta: a.ruta, contenido: a.contenido };
}

function validarAjustes(a: ArgsOrdenAndroid): ArgsOrdenAndroid | null {
    if (!soloClaves(a, [])) return null;
    return {};
}

function validarPermisoUbicacion(a: ArgsOrdenAndroid): ArgsOrdenAndroid | null {
    if (!soloClaves(a, ["precisa"])) return null;
    if (typeof a.precisa !== "boolean") return null;
    return { precisa: a.precisa };
}

function validarInfo(a: ArgsOrdenAndroid): ArgsOrdenAndroid | null {
    if (!soloClaves(a, [])) return null;
    return {};
}

const VALIDADORES_ANDROID: Record<string, (a: ArgsOrdenAndroid) => ArgsOrdenAndroid | null> = {
    "almacen-lista-saf": validarAlmacenListaSaf,
    "almacen-abrir-saf": validarAlmacenAbrirSaf,
    "almacen-leer-saf": validarAlmacenLeerSaf,
    "almacen-escribir-saf": validarAlmacenEscribirSaf,
    "ajustes-accesibilidad": validarAjustes,
    "ajustes-superposicion": validarAjustes,
    "ajustes-notificaciones": validarAjustes,
    "ajustes-bateria": validarAjustes,
    "ajustes-almacenamiento": validarAjustes,
    "permiso-calendario": validarAjustes,
    "permiso-contactos": validarAjustes,
    "permiso-ubicacion": validarPermisoUbicacion,
    "permiso-microfono": validarAjustes,
    "permiso-camara": validarAjustes,
    "info-aparato": validarInfo,
    "info-aplicacion": validarInfo,
    "info-red": validarInfo,
    "info-bateria": validarInfo,
};

export function validarArgsAndroid(nombre: string, args: ArgsOrdenAndroid): ArgsOrdenAndroid | null {
    const validador = VALIDADORES_ANDROID[nombre];
    if (!validador) return null;
    return validador(args);
}

export function comandosPorTipo(tipo: TipoOrdenAndroid): readonly ComandoAndroid[] {
    return COMANDOS_ANDROID.filter((c) => c.tipo === tipo);
}

export function comandosDisponibles(apiLevel: number): readonly ComandoAndroid[] {
    return COMANDOS_ANDROID.filter((c) => c.minApi <= apiLevel);
}

export function comandosNoDisponibles(apiLevel: number): readonly ComandoAndroid[] {
    return COMANDOS_ANDROID.filter((c) => c.minApi > apiLevel);
}