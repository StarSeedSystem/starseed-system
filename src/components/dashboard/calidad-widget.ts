// ════════════════════════════════════════════════════════════════
// Calidad widget — contrato de calidad de un widget del dashboard
// ----------------------------------------------------------------
// Módulo PURO (sin React, sin node:*, SSR-safe). Prevalece el error
// sobre la carga, lo vacío sobre lo listo. Traduce estados de datos a
// mensajes humanos, honestos y útiles, y detecta datos falsos de relleno.
// ════════════════════════════════════════════════════════════════

export type EstadoWidget = "cargando" | "vacio" | "error" | "listo";

export interface EntradaEstado {
    cargando?: boolean;
    error?: unknown;
    datos?: unknown;
    requiereSesion?: boolean;
    requierePermiso?: string;
}

export const MIN_SEGURO = { minW: 3, minH: 3 };

/**
 * Determina el estado honesto de un widget.
 * Precedencia documentada: error > cargando > vacío > listo.
 * - error: hay un fallo real (red caída, sin sesión o sin permiso con
 *   datos ausentes, excepción en la fuente…). Un error siempre manda.
 * - cargando: aún no hay error, pero se está esperando datos.
 * - vacío: no hay error ni carga pendiente, y los datos no contienen
 *   contenido real (array de 0, objeto sin claves, null o undefined).
 *   `0` y `""` NO son vacío: un contador a cero es un dato real y debe verse.
 * - listo: podemos renderizar contenido.
 */
export function estadoDe(e: EntradaEstado): EstadoWidget {
    const hayError = e.error !== undefined && e.error !== null;
    if (hayError) return "error";
    const sinSesion = e.requiereSesion === true && e.datos === undefined;
    const sinPermiso = Boolean(e.requierePermiso) && e.datos === undefined;
    if (sinSesion || sinPermiso) return "error";
    if (e.cargando) return "cargando";
    if (esVacio(e.datos)) return "vacio";
    return "listo";
}

/** true si el valor no contiene contenido renderizable real. */
function esVacio(v: unknown): boolean {
    if (v === null || v === undefined) return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === "object") return Object.keys(v as Record<string, unknown>).length === 0;
    return false;
}

// ═───────────────────────────────────────────────────────────────
// Mensajes de estado vacío por categoría. Texto útil: qué falta y qué
// puede hacer la persona. Nunca «Sin datos» a secas.
// ═───────────────────────────────────────────────────────────────
type MensajeVacioCategoria = { titulo: string; ayuda: string };

const MENSAJES_VACIOS: Record<string, MensajeVacioCategoria> = {
    politica: {
        titulo: "Todavía no sigues ninguna entidad federativa",
        ayuda: "Explora la red y sigue una entidad para ver aquí sus propuestas y votaciones.",
    },
    ontocracia: {
        titulo: "Aún no hay propuestas en tu ágora",
        ayuda: "Propón una iniciativa propia o sigue una comunidad con debate activo para llenar este espacio.",
    },
    economia: {
        titulo: "Aún no hay flujo económico que mostrar",
        ayuda: "Participa en el ágora del don o registra tu primer aporte al patrimonio común para verlo reflejado.",
    },
    oikos: {
        titulo: "Todavía no tienes actividad de Oikos",
        ayuda: "Añade tu hábitat o registra un consumo para empezar a medir el metabolismo de tu comunidad.",
    },
    social: {
        titulo: "Aún no hay actividad en tu círculo",
        ayuda: "Conecta con personas o comunidades y comparte tu primera creación para que aparezca aquí.",
    },
    clima: {
        titulo: "Aún no hay lectura climática disponible",
        ayuda: "Comprueba que eliges una ubicación en Ajustes o espera a que la estación cercana responda.",
    },
    astronomia: {
        titulo: "Todavía no hay observación que mostrar",
        ayuda: "Selecciona una coordenada o un cuerpo celeste para generar tu carta de observación.",
    },
    ia: {
        titulo: "Todavía no hay conversaciones con tu exocórtex",
        ayuda: "Saluda a tu asistente personal en el área de IA para empezar a registrar tu diálogo.",
    },
    astraura: {
        titulo: "Astraura aún no tiene contexto que mostrar",
        ayuda: "Active una personalidad o inicie un proceso imaginativo para poblar esta vista.",
    },
    educacion: {
        titulo: "Todavía no sigues ningún camino de aprendizaje",
        ayuda: "Explora la biblioteca y apúntate a un curso o habilidad para ver tu progreso aquí.",
    },
    red: {
        titulo: "Aún no hay nodos vecinos conectados",
        ayuda: "Enciende la radio o acerca otro nodo para que la red aparezca en este mapa.",
    },
    sistema: {
        titulo: "Todavía no hay telemetría del sistema",
        ayuda: "Espera al primer latido o revisa que el nodo esté encendido y conectado.",
    },
    archivos: {
        titulo: "Todavía no tienes archivos aquí",
        ayuda: "Sube tu primer archivo o sincroniza una carpeta para verla reflejada en la biblioteca.",
    },
};

/** Texto de ayuda para una categoría desconocida (no romper nunca). */
const VACIO_GENERICO: MensajeVacioCategoria = {
    titulo: "Todavía no hay nada que mostrar aquí",
    ayuda: "Cuando haya contenido real aparecerá automáticamente. Prueba a explorar la red o a generar tu primer dato.",
};

export function mensajeVacio(categoria: string): { titulo: string; ayuda: string } {
    return MENSAJES_VACIOS[categoria] ?? VACIO_GENERICO;
}

// ═───────────────────────────────────────────────────────────────
// Traducción de errores a mensajes humanos y honestos. Nunca culpa
// al usuario ni inventa la causa. `reintentable` es false cuando
// reintentar no puede arreglarlo (p. ej. falta de permiso).
// ═───────────────────────────────────────────────────────────────
export type MensajeError = { titulo: string; detalle: string; reintentable: boolean };

function nombreDe(e: unknown): string {
    if (e && typeof e === "object" && "name" in e && typeof (e as { name?: unknown }).name === "string") {
        return (e as { name: string }).name;
    }
    return "";
}

function mensajeTexto(e: unknown): string {
    if (e instanceof Error) return e.message;
    if (typeof e === "string") return e;
    return "";
}

type TipoErrorReconocido = "red" | "sesion" | "permiso" | "fuente" | "desconocido";

function tipoDeError(e: unknown): TipoErrorReconocido {
    const nombre = nombreDe(e);
    if (nombre === "AbortError" || nombre === "TimeoutError") return "red";
    const texto = `${nombre} ${mensajeTexto(e)}`.toLowerCase();

    const esRed = /(fetch|network|net::|failed to fetch|load failed|socket|econn|timeout|aborted|desconectad|sin internet|caído|offline|red)/.test(texto);
    if (esRed) return "red";

    const esSesion = /(sesion|sesión|session|login|logged out|unauthenticated|no autentic|401|auth)/.test(texto);
    if (esSesion) return "sesion";

    const esPermiso = /(permiso|permission|denied|denegad|forbidden|forbidden|403|rl[a-z]*|policy|prohibid|sin autorizac)/.test(texto);
    if (esPermiso) return "permiso";

    const esFuente = /(fuente|source|proveedor|provider|origin|upstream|aplicaci[oó]n no responde|no responde|502|503|504|500)/.test(texto);
    if (esFuente) return "fuente";

    if (e === "SIN_SESION" || e === "NO_SESION") return "sesion";
    if (e === "SIN_PERMISO" || e === "DENEGADO") return "permiso";

    return "desconocido";
}

const MENSAJES_ERROR: Record<TipoErrorReconocido, MensajeError> = {
    red: {
        titulo: "No pudimos conectar con la fuente",
        detalle: "Parece que hay un problema de conexión. Revisa tu red e inténtalo de nuevo en un momento.",
        reintentable: true,
    },
    sesion: {
        titulo: "Para ver esto hace falta tu sesión",
        detalle: "Entra en tu cuenta y el contenido aparecerá aquí al instante.",
        reintentable: true,
    },
    permiso: {
        titulo: "Este contenido requiere un permiso",
        detalle: "No dispones de permiso para ver este dato. Pide acceso a la entidad correspondiente si deberías tenerlo.",
        reintentable: false,
    },
    fuente: {
        titulo: "La fuente no respondió",
        detalle: "El servicio que alimenta este dato está tardando o no está disponible. Inténtalo de nuevo en unos segundos.",
        reintentable: true,
    },
    desconocido: {
        titulo: "No pudimos mostrar este dato",
        detalle: "Algo inesperado ocurrió. Reintentar suele resolverlo; si persiste, repórtalo para poder arreglarlo.",
        reintentable: true,
    },
};

export function mensajeError(error: unknown): { titulo: string; detalle: string; reintentable: boolean } {
    return MENSAJES_ERROR[tipoDeError(error)];
}

// ═───────────────────────────────────────────────────────────────
// Detección de datos falsos de relleno. La red que evita que vuelva a
// colarse «lorem», «ejemplo», «mock» o arrays de objetos idénticos
// disfrazados de contenido real (regla: ningún dato falso se muestra
// como real).
// ═───────────────────────────────────────────────────────────────
const PALABRAS_RELLENO = ["lorem", "ejemplo", "example", "sample", "mock", "dummy", "placeholder", "todo", "fixme", "test", "prueba", "xxx"];

function pareceRelleno(v: unknown): boolean {
    if (typeof v === "number") return false;
    if (typeof v === "string") {
        const t = v.trim().toLowerCase();
        if (t === "") return false;
        return PALABRAS_RELLENO.some((p) => t.includes(p));
    }
    if (typeof v === "boolean") return false;
    if (Array.isArray(v)) return false;
    if (v && typeof v === "object") return false;
    return false;
}

function patronesRepetidos(arr: unknown[]): boolean {
    const prim = arr[0];
    if (prim === null || typeof prim !== "object") return false;
    return arr.slice(1).every((e) => JSON.stringify(e) === JSON.stringify(prim));
}

export function faltaDatoReal(v: unknown): boolean {
    if (Array.isArray(v)) return patronesRepetidos(v);
    if (v && typeof v === "object") {
        return Object.values(v as Record<string, unknown>).some(pareceRelleno);
    }
    return pareceRelleno(v);
}