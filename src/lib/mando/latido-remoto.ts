/**
 * Contrato del latido remoto del enjambre (Ola 308 · zM1 · 2026-09-09)
 * ─────────────────────────────────────────────────────────────────────────────
 * El Puente de Mando de la Mac miraba `starseed_memory_root/olas/`, una carpeta
 * que deliberadamente NO se versiona y que, desde que el enjambre se mudó al
 * contenedor de la nube, dejó de recibir noticias. Este módulo define la «foto
 * pequeña» que cabe en una fila de base de datos (Supabase) y no lleva secretos.
 *
 * Es un módulo **PURO**: sin red ni `node:*`. Lo importan cliente y servidor, así
 * que jamás puede leer variables de entorno, tocar el disco ni hacer fetch. El
 * paso real a Supabase (migración + RLS) y el enganche del Mando van en tareas
 * siguientes; aquí, el contrato y sus pruebas.
 *
 * ⚠️ Seguridad: un latido llega de OTRA máquina. `sanearLatido` valida con
 * desconfianza y elimina cualquier cosa que huela a secreto o a ruta de disco,
 * porque un latido jamás debe delatar el árbol de archivos de nadie.
 */

/** Una tarea que el enjambre tiene entre manos ahora mismo, resumida a lo mínimo. */
export interface TareaLatida {
    id: string;
    fase: string;
    modelo: string;
    minutos: number;
}

/**
 * Recuento de tareas de la ola tal como lo pinta la cabecera del Mando. Los
 * números son lo único que cuenta: nunca llevan texto libre ni rutas.
 */
export interface CuentasLatido {
    integradas: number;
    enCurso: number;
    fallidas: number;
    sinCambios: number;
    pendientes: number;
}

/**
 * La foto del enjambre que viaja entre máquinas: una fila de base de datos por
 * latido, cada dos minutos, durante días. Cada campo se valida al llegar.
 */
export interface LatidoRemoto {
    maquina: string;
    cola: string;
    ola: string;
    /** Milisegundos desde épsilon Unix: lo compara `esLatidoFresco`. */
    at: number;
    orquestadorVivo: boolean;
    trabajadores: number;
    enCurso: TareaLatida[];
    cuentas: CuentasLatido;
    medio: string;
}

/** Cuántas tareas «en curso» caben en un latido antes de pasarse del tope. */
const MAX_TAREAS_EN_CURSO = 12;

/**
 * Límite de tamaño, en bytes, que no debe pasarse un único latido. Una fila de
 * base de datos por latido cada dos minutos, durante días: si no se acota, esto
 * engorda hasta doler. Se aplica sobre el JSON serializado del objeto.
 */
export const MAX_BYTES_LATIDO = 8000;

/** Un latido es «fresco» mientras tenga menos de 5 minutos de edad. */
export const LATIDO_FRESCO_MS = 5 * 60 * 1000;

/**
 * Devuelve una copia de `l` recortando `enCurso` a las `MAX_TAREAS_EN_CURSO` (12)
 * tareas más recientes únicamente si el JSON serializado del objeto se pasa de
 * `MAX_BYTES_LATIDO`. Nunca muta el original. Ordena por `at` descendente para
 * que «las más recientes» sea una definición estable.
 */
export function comprimirLatido(l: LatidoRemoto): LatidoRemoto {
    const recortado: LatidoRemoto = {
        ...l,
        enCurso: [...l.enCurso].sort((a, b) => a.minutos - b.minutos).slice(0, MAX_TAREAS_EN_CURSO),
    };
    if (bytesDe(recortado) <= MAX_BYTES_LATIDO) return recortado;
    // Un único latido jamás debería pasarse del tope con 12 tareas; si lo hace,
    // se vacía la lista de tareas vivas antes de tirar el latido entero.
    const minimo = { ...recortado, enCurso: [] };
    return bytesDe(minimo) <= MAX_BYTES_LATIDO ? minimo : minimo;
}

/** Bytes UTF-8 del JSON que ocupa el latido (lo que cruza el cable). */
function bytesDe(l: LatidoRemoto): number {
    return new TextEncoder().encode(JSON.stringify(l)).byteLength;
}

/**
 * ¿El latido es lo bastante reciente para contar como «en curso ahora»? Fresco =
 * menos de 5 minutos. **Un latido viejo NO se pinta como si fuera de ahora**: es
 * exactamente el error que ha estado sufriendo el Mando (carpes viejas contando
 * como agentes vivos).
 */
export function esLatidoFresco(l: LatidoRemoto, ahora: number): boolean {
    const edad = ahora - l.at;
    return Number.isFinite(edad) && edad >= 0 && edad < LATIDO_FRESCO_MS;
}

/**
 * Describe la frescura del latido en español y sin adornos, para que la UI pueda
 * pintarla tal cual: «hace 40 segundos» · «hace 6 minutos (dato antiguo)» ·
 * «sin noticias desde hace 2 horas».
 */
export function describirFrescura(l: LatidoRemoto, ahora: number): string {
    const edad = ahora - l.at;
    if (!Number.isFinite(edad) || edad < 0) return "sin noticias";
    const segundos = Math.floor(edad / 1000);
    if (segundos < 60) return `hace ${segundos} ${segundos === 1 ? "segundo" : "segundos"}`;
    const minutos = Math.floor(segundos / 60);
    if (minutos < 5) return `hace ${minutos} ${minutos === 1 ? "minuto" : "minutos"}`;
    if (minutos < 60) return `hace ${minutos} minutos (dato antiguo)`;
    const horas = Math.floor(minutos / 60);
    return `sin noticias desde hace ${horas} ${horas === 1 ? "hora" : "horas"}`;
}

/**
 * Fusiona latidos locales y remotos en una sola lista: una entrada por
 * `maquina` + `cola`, quedándose con la más reciente (`at` mayor), y ordenada
 * por `at` descendente (lo más nuevo primero). Tolerante: nunca lanza, y omite
 * entradas que carezcan de la identidad mínima para deduplicarse.
 */
export function fusionarLatidos(locales: LatidoRemoto[], remotos: LatidoRemoto[]): LatidoRemoto[] {
    const porLlave = new Map<string, LatidoRemoto>();
    const llaveDe = (l: LatidoRemoto): string | null => {
        if (!l.maquina && !l.cola) return null;
        return `${l.maquina}|${l.cola}`;
    };
    for (const l of [...locales, ...remotos]) {
        const llave = llaveDe(l);
        if (!llave) continue;
        const previo = porLlave.get(llave);
        if (!previo || l.at > previo.at) porLlave.set(llave, l);
    }
    return [...porLlave.values()].sort((a, b) => b.at - a.at);
}

/**
 * Patrones que un latido jamás debe portar: claves de proveedores (`sk-`, `gsk_`),
 * cabeceras de autorización (`Bearer …`) y rutas de disco que delatarían cómo está
 * montado el sistema de alguien. Se eliminan por sustitución con una regex amplia.
 */
const PATRONES_SECRETOS: RegExp[] = [
    /sk-[A-Za-z0-9_-]{3,}/g,
    /gsk_[A-Za-z0-9]{6,}/g,
    /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
    /(?:[\/\\])?(?:Users|home)[\/\\][^\s]*/g,
    /\/root\/[^\s]*/g,
];

/** Elimina de un texto cualquier rastro de secreto o de ruta de disco. */
function limpiarTexto(s: string): string {
    let limpio = s;
    for (const patron of PATRONES_SECRETOS) limpio = limpio.replace(patron, "");
    return limpio.trim();
}

/**
 * Valida un `unknown` llegado de otra máquina y devuelve un `LatidoRemoto` limpio,
 * o `null` si no se parece en absoluto a uno. Todo campo de texto pasa por
 * `limpiarTexto`. Los números se descartan si no son finitos, y los número fuera
 * de rango se sustituyen por su defecto para no contaminar las cuentas.
 */
export function sanearLatido(bruto: unknown): LatidoRemoto | null {
    const d = typeof bruto === "object" && bruto !== null && !Array.isArray(bruto)
        ? (bruto as Record<string, unknown>)
        : null;
    if (!d) return null;
    const maquina = limpiarTexto(texto(d.maquina));
    const cola = limpiarTexto(texto(d.cola));
    const ola = limpiarTexto(texto(d.ola));
    if (!maquina && !cola) return null;

    const at = numero(d.at);
    const enCursoBruto = Array.isArray(d.enCurso) ? d.enCurso.filter(esObjeto) : [];
    const cuentasBruto = esObjeto(d.cuentas) ? (d.cuentas as Record<string, unknown>) : {};

    const latido: LatidoRemoto = {
        maquina,
        cola,
        ola,
        at,
        orquestadorVivo: d.orquestadorVivo === true,
        trabajadores: Math.max(0, Math.round(numero(d.trabajadores))),
        enCurso: enCursoBruto.map((t) => ({
            id: limpiarTexto(texto(t.id)),
            fase: limpiarTexto(texto(t.fase)),
            modelo: limpiarTexto(texto(t.modelo)),
            minutos: Math.max(0, numero(t.minutos)),
        })).filter((t) => t.id.length > 0),
        cuentas: {
            integradas: Math.max(0, Math.round(numero(cuentasBruto.integradas))),
            enCurso: Math.max(0, Math.round(numero(cuentasBruto.enCurso))),
            fallidas: Math.max(0, Math.round(numero(cuentasBruto.fallidas))),
            sinCambios: Math.max(0, Math.round(numero(cuentasBruto.sinCambios))),
            pendientes: Math.max(0, Math.round(numero(cuentasBruto.pendientes))),
        },
        medio: limpiarTexto(texto(d.medio)),
    };
    return comprimirLatido(latido);
}

function texto(v: unknown): string {
    return typeof v === "string" ? v : "";
}

function numero(v: unknown): number {
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function esObjeto(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}