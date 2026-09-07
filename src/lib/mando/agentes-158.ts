/**
 * Lectura de la «ramificación 1.58» para el Puente de Mando (Ola 270 · 2026-09-07)
 * ─────────────────────────────────────────────────────────────────────────────
 * El backend Astraura 1.58 (esta neurona, `ASTRAURA_158_URL` o
 * `http://127.0.0.1:8000`) trabaja de forma continua: BitNet al fondo, cinco
 * agentes de aprendizaje (Curador, Entrenador, Evaluador, Desplegador,
 * Cronista) y procesos de fondo (imaginación, sueños, enjambre, Director,
 * learner, cognition). Este módulo lee su estado vivo y lo cruza con las
 * personalidades del OS para dibujarlo en el Mando.
 *
 * Tolerancia total a fallos: si el backend está apagado o tarda, `leerRama158`
 * devuelve `backend: "apagado"` con arrays vacíos — nunca lanza.
 *
 * Nunca se escriben rutas ni claves; solo nombres de variables de entorno.
 */

/** Personalidad mínima del OS para el cruce (id + nombre visible). */
export interface PersonalidadBasica {
    id: string;
    nombre: string;
}

/** Estado vivo del BitNet local (puente del backend 1.58). */
export interface BitnetRama {
    dormido: boolean;
    cedidoHastaS: number | null;
    vivo: boolean;
    puerto: number | null;
    ultimoUsoInteractivoHaceS: number | null;
}

/** Estadística del corpus de una personalidad. */
export interface CorpusPersonalidad {
    turnos: number;
    train: number;
    val: number;
    ultimo: string | null;
    /** Activa si el backend lo dice (opcional; ausente = desconocido). */
    activa?: boolean;
}

export interface CorpusRama {
    activo: boolean;
    personalidades: Record<string, CorpusPersonalidad>;
    total: number;
    valoraciones: number;
    bytes: number;
}

/** Agente de aprendizaje continuo (Curador, Entrenador, …). */
export interface AgenteAprendizajeVivo {
    id: string;
    nombre: string;
    rol: string;
    intervaloS: number | null;
    activo: boolean;
    ultimoInicio: string | null;
    ultimoFin: string | null;
    ultimoResultado: string | null;
    ejecuciones: number;
    errores: number;
    proximo: string | null;
}

/** Proceso de fondo del backend (imaginación, sueños, enjambre, …). */
export interface ProcesoFondo {
    id: string;
    nombre: string;
    activo: boolean | null;
    ultimo: string | null;
    detalle: string | null;
}

/** Personalidad del OS o del corpus cruzada con su estado vivo en el backend 1.58. */
export interface PersonalidadRama {
    id: string;
    nombre: string;
    turnos: number;
    ultimo: string | null;
    activa: boolean;
    /** «os» = preset del OS; «corpus» = rama que solo existe en el corpus del backend. */
    origen: "os" | "corpus";
}

/** Rama completa que dibuja el Mando: BitNet → personalidades → agentes → procesos. */
export interface Rama158 {
    /** ISO de cuándo se tomó esta foto. */
    t: string;
    backend: "vivo" | "apagado";
    bitnet: BitnetRama | null;
    corpus: CorpusRama | null;
    agentes: AgenteAprendizajeVivo[];
    procesos: ProcesoFondo[];
    personalidades: PersonalidadRama[];
}

/**
 * Espejo mínimo (id + nombre) de `PERSONALITY_PRESETS` de
 * `src/lib/aurora/personalities.ts` (Ola 270 · 2026-09-07). Ese módulo es
 * `"use client"` y toca localStorage/Supabase: importarlo desde una ruta de
 * API convertiría la lectura del lado del servidor en una referencia cliente.
 * Mantener sincronizado al añadir o renombrar un preset.
 */
export const PERSONALIDADES_OS_158: PersonalidadBasica[] = [
    { id: "preset-aurora", nombre: "Aurora" },
    { id: "preset-mentora-sabia", nombre: "Mentora Sabia" },
    { id: "preset-complice-creativa", nombre: "Cómplice Creativa" },
    { id: "preset-analista-precisa", nombre: "Analista Precisa" },
    { id: "preset-guardiana-serena", nombre: "Guardiana Serena" },
    { id: "preset-exploradora-curiosa", nombre: "Exploradora Curiosa" },
    { id: "preset-poeta-ciberdelica", nombre: "Poeta Ciberdélica" },
    // Id estable (Adenda 70): no es `preset-…`, es el UUID de la cuenta.
    { id: "c9fe7030-fc68-49c6-a705-58f7900887f9", nombre: "Hermione" },
];

/**
 * Normaliza un nombre o id de personalidad para emparejar corpus ↔ OS sin
 * sustos: minúsculas, sin acentos, sin el prefijo `preset-` del OS y sin
 * guiones/guiones bajos (el corpus usa `astraura_prime`, el OS usa ids
 * `preset-aurora` y nombres «Poeta Ciberdélica»).
 */
function normalizarNombre(textoCrudo: string): string {
    return textoCrudo
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/^preset-/, "")
        .replace(/[-_\s]+/g, "");
}

/**
 * Nombre legible para una rama que solo vive en el corpus (snake_case del
 * backend → «Title Case»; la cognition de fondo se marca como tal).
 */
function nombreLegibleCorpus(nombreCrudo: string): string {
    const limpio = nombreCrudo.trim();
    if (limpio === "cognition") return "Cognition (fondo)";
    return limpio
        .split(/[_\s-]+/)
        .filter((trozo) => trozo.length > 0)
        .map((trozo) => trozo.charAt(0).toUpperCase() + trozo.slice(1))
        .join(" ");
}

/**
 * Cruza el corpus del backend con la lista de personalidades del OS.
 * Función pura (probada en `mando-agentes-158.test.ts`):
 * 1. Primero las del OS, casadas con el corpus por id exacto o por nombre
 *    normalizado (sin `preset-`, guiones ni acentos) → `origen: "os"`.
 * 2. Después las ramas del corpus que no casan con ninguna del OS (el corpus
 *    usa `astraura_prime`, `cognition`, `default`) → `origen: "corpus"`, con
 *    id = nombre del corpus, nombre legible y `activa` si el backend lo dice.
 * Sin corpus, devuelve la lista del OS con ceros. Nada se pierde.
 */
export function cruzarPersonalidades(
    corpus: CorpusRama | null,
    personalidadesOS: PersonalidadBasica[],
    activaId?: string | null,
): PersonalidadRama[] {
    const porClave = new Map<string, CorpusPersonalidad>();
    const nombreCorpus = new Map<string, string>();
    if (corpus) {
        for (const [nombre, datos] of Object.entries(corpus.personalidades ?? {})) {
            // Doble llave: el id/nombre crudo y su forma normalizada, para
            // casar tanto «Aurora» con «aurora» como «astraura_prime» solo
            // cuando ninguna personalidad del OS se lo lleva.
            porClave.set(nombre.trim().toLowerCase(), datos);
            porClave.set(normalizarNombre(nombre), datos);
            nombreCorpus.set(nombre.trim().toLowerCase(), nombre);
        }
    }
    const corpusCasado = new Set<string>();
    const marcar = (p: PersonalidadBasica): boolean => (activaId ? p.id === activaId : false);
    const lista: PersonalidadRama[] = personalidadesOS.map((p) => {
        const claves = [
            p.id.trim().toLowerCase(),
            normalizarNombre(p.id),
            p.nombre.trim().toLowerCase(),
            normalizarNombre(p.nombre),
        ];
        let datos: CorpusPersonalidad | null = null;
        for (const clave of claves) {
            const encontrado = porClave.get(clave);
            if (encontrado) {
                datos = encontrado;
                const original = nombreCorpus.get(clave);
                if (original) corpusCasado.add(original);
                // Marca también la entrada original cuyo normalizado coincide.
                for (const [claveGuardada, d] of porClave.entries()) {
                    if (d === encontrado) {
                        const orig = nombreCorpus.get(claveGuardada);
                        if (orig) corpusCasado.add(orig);
                    }
                }
                break;
            }
        }
        return {
            id: p.id,
            nombre: p.nombre,
            turnos: datos?.turnos ?? 0,
            ultimo: datos?.ultimo ?? null,
            activa: marcar(p),
            origen: "os",
        };
    });
    // Ramas del corpus sin pareja en el OS: se muestran al final, sin ocultarlas.
    if (corpus) {
        for (const [nombre, datos] of Object.entries(corpus.personalidades ?? {})) {
            if (corpusCasado.has(nombre.trim())) continue;
            lista.push({
                id: nombre,
                nombre: nombreLegibleCorpus(nombre),
                turnos: datos.turnos,
                ultimo: datos.ultimo,
                activa: datos.activa === true,
                origen: "corpus",
            });
        }
    }
    if (!activaId && lista.length > 0 && personalidadesOS.length > 0) {
        lista[0] = { ...lista[0], activa: true };
    }
    return lista;
}

// ── Lectura del backend (tolerante: nunca lanza) ─────────────────────────────

/** URL base del backend 1.58 de esta neurona (solo servidor). */
function baseBackend(): string {
    const env = String(process.env.ASTRAURA_158_URL ?? "").trim().replace(/\/+$/, "");
    return env || "http://127.0.0.1:8000";
}

/** GET tolerante: null si apagado, sin respuesta en 4 s o JSON inválido. */
async function pedirJson(ruta: string): Promise<unknown | null> {
    try {
        const res = await fetch(`${baseBackend()}${ruta}`, {
            cache: "no-store",
            signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) return null;
        return (await res.json()) as unknown;
    } catch {
        return null;
    }
}

function numero(v: unknown): number | null {
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function numeroCero(v: unknown): number {
    return numero(v) ?? 0;
}
function texto(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v : null;
}
function boolNulo(v: unknown): boolean | null {
    return typeof v === "boolean" ? v : null;
}

function parsearBitnet(crudo: unknown): BitnetRama | null {
    if (typeof crudo !== "object" || crudo === null) return null;
    const b = crudo as Record<string, unknown>;
    return {
        dormido: b.dormido === true,
        cedidoHastaS: numero(b.cedido_hasta_s),
        vivo: b.vivo !== false,
        puerto: numero(b.puerto),
        ultimoUsoInteractivoHaceS: numero(b.ultimo_uso_interactivo_hace_s),
    };
}

function parsearCorpus(crudo: unknown): CorpusRama | null {
    if (typeof crudo !== "object" || crudo === null) return null;
    const c = crudo as Record<string, unknown>;
    const porNombre: Record<string, CorpusPersonalidad> = {};
    const fuente = typeof c.personalidades === "object" && c.personalidades !== null
        ? (c.personalidades as Record<string, unknown>)
        : {};
    for (const [nombre, datos] of Object.entries(fuente)) {
        const d = typeof datos === "object" && datos !== null ? (datos as Record<string, unknown>) : {};
        porNombre[nombre] = {
            turnos: numeroCero(d.turnos),
            train: numeroCero(d.train),
            val: numeroCero(d.val),
            ultimo: texto(d.ultimo),
            activa: typeof d.activa === "boolean" ? d.activa : undefined,
        };
    }
    return {
        activo: c.activo !== false,
        personalidades: porNombre,
        total: numeroCero(c.total),
        valoraciones: numeroCero(c.valoraciones),
        bytes: numeroCero(c.bytes),
    };
}

function parsearAgente(crudo: unknown): AgenteAprendizajeVivo | null {
    if (typeof crudo !== "object" || crudo === null) return null;
    const a = crudo as Record<string, unknown>;
    const id = texto(a.id);
    if (!id) return null;
    return {
        id,
        nombre: texto(a.nombre) ?? id,
        rol: texto(a.rol) ?? "",
        intervaloS: numero(a.intervalo_s),
        activo: a.activo !== false,
        ultimoInicio: texto(a.ultimo_inicio),
        ultimoFin: texto(a.ultimo_fin),
        ultimoResultado: texto(a.ultimo_resultado),
        ejecuciones: numeroCero(a.ejecuciones),
        errores: numeroCero(a.errores),
        proximo: texto(a.proximo),
    };
}

function parsearProceso(crudo: unknown): ProcesoFondo | null {
    if (typeof crudo !== "object" || crudo === null) return null;
    const p = crudo as Record<string, unknown>;
    const id = texto(p.id);
    if (!id) return null;
    return {
        id,
        nombre: texto(p.nombre) ?? id,
        activo: boolNulo(p.activo),
        ultimo: texto(p.ultimo),
        detalle: texto(p.detalle),
    };
}

/**
 * Normaliza la respuesta de `/api/aprendizaje/procesos`: el backend 1.58 la
 * devuelve envuelta (`{success: true, procesos: [...]}`) y alguna versión la
 * sirve como array suelto. Función pura exportada para el test: con cualquier
 * otra forma devuelve `[]`.
 */
export function normalizarProcesos(crudo: unknown): ProcesoFondo[] {
    let fuente: unknown[] = [];
    if (Array.isArray(crudo)) {
        fuente = crudo;
    } else if (typeof crudo === "object" && crudo !== null) {
        const envuelto = (crudo as Record<string, unknown>).procesos;
        if (Array.isArray(envuelto)) fuente = envuelto;
    }
    return fuente
        .map(parsearProceso)
        .filter((p): p is ProcesoFondo => p !== null);
}

/**
 * Lee el estado vivo del backend 1.58 y devuelve la rama lista para pintar.
 * Pide `/api/aprendizaje/agentes` (que incluye bitnet y corpus),
 * `/api/aprendizaje/procesos` y `/api/bitnet/estado` en paralelo con 4 s de
 * margen cada uno. Si el backend está apagado: `backend: "apagado"` y vacíos.
 * `personalidadesOS` es la lista del OS a cruzar con el corpus (por defecto el
 * espejo `PERSONALIDADES_OS_158`); `activaId` fija la personalidad marcada
 * como activa (si no se indica, la primera).
 */
export async function leerRama158(
    personalidadesOS: PersonalidadBasica[] = PERSONALIDADES_OS_158,
    activaId?: string | null,
): Promise<Rama158> {
    const t = new Date().toISOString();
    const [agentesJson, procesosJson, bitnetJson] = await Promise.all([
        pedirJson("/api/aprendizaje/agentes"),
        pedirJson("/api/aprendizaje/procesos"),
        pedirJson("/api/bitnet/estado"),
    ]);
    if (agentesJson === null && bitnetJson === null) {
        return { t, backend: "apagado", bitnet: null, corpus: null, agentes: [], procesos: [], personalidades: [] };
    }
    // `/api/aprendizaje/agentes` envuelve {agentes, bitnet, corpus}.
    const caja = typeof agentesJson === "object" && agentesJson !== null
        ? (agentesJson as Record<string, unknown>)
        : {};
    const agentes = (Array.isArray(caja.agentes) ? caja.agentes : [])
        .map(parsearAgente)
        .filter((a): a is AgenteAprendizajeVivo => a !== null);
    // El backend responde {success, procesos: [...]}: se aceptan ambas formas.
    const procesos = normalizarProcesos(procesosJson);
    // El estado de BitNet puede venir dentro de «agentes» o en su propio endpoint.
    const bitnet = parsearBitnet(bitnetJson) ?? parsearBitnet(caja.bitnet);
    const corpus = parsearCorpus(caja.corpus);
    return {
        t,
        backend: "vivo",
        bitnet,
        corpus,
        agentes,
        procesos,
        personalidades: cruzarPersonalidades(corpus, personalidadesOS, activaId),
    };
}

/** Acciones que el backend acepta sobre un agente de aprendizaje (lista cerrada). */
export type AccionAgente158 = "pausar" | "reanudar" | "ejecutar";

/**
 * Reenvía una acción al backend: `POST /api/aprendizaje/agentes/{id}/{accion}`.
 * Devuelve si el backend respondió OK; false si está apagado o rechazó.
 */
export async function accionarAgente158(id: string, accion: AccionAgente158): Promise<boolean> {
    try {
        const res = await fetch(
            `${baseBackend()}/api/aprendizaje/agentes/${encodeURIComponent(id)}/${accion}`,
            { method: "POST", signal: AbortSignal.timeout(4000) },
        );
        return res.ok;
    } catch {
        return false;
    }
}
