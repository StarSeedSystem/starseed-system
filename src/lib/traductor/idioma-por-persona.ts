/**
 * TU1116-APP-F1 · Idioma de conversación por persona
 * ─────────────────────────────────────────────────────────────────────────────
 * Mapa {personaId → {idioma, fuente:"pedido"|"detectado", confianza, desde}} en
 * starseed.traductor.personas.v1 (local, tope 500 personas, almacén inyectable).
 */

export type FuenteIdioma = "pedido" | "detectado";

export interface PersonaIdioma {
    readonly idioma: string;
    readonly fuente: FuenteIdioma;
    readonly confianza: number;
    readonly desde: number;
}

export interface RegistroInterno extends PersonaIdioma {
    readonly racha: number;
    readonly ultimoIdiomaDetectado: string | null;
}

export interface AlmacenPersonas {
    obtener(clave: string): string | null;
    guardar(clave: string, valor: string): void;
}

const CLAVE_PERSONAS = "starseed.traductor.personas.v1";
const TOPE_PERSONAS = 500;
const UMBRAL_CONFIANZA = 0.8;
const RACHA_NECESARIA = 3;

function leerPersonas(almacen: AlmacenPersonas): Map<string, RegistroInterno> {
    try {
        const raw = almacen.obtener(CLAVE_PERSONAS);
        if (!raw) return new Map();
        const parseado = JSON.parse(raw);
        if (typeof parseado !== "object" || parseado === null) return new Map();
        const mapa = new Map<string, RegistroInterno>();
        for (const [k, v] of Object.entries(parseado)) {
            if (v && typeof v === "object") {
                mapa.set(k, v as RegistroInterno);
            }
        }
        return mapa;
    } catch {
        return new Map();
    }
}

function escribirPersonas(personas: Map<string, RegistroInterno>, almacen: AlmacenPersonas): void {
    try {
        const obj: Record<string, RegistroInterno> = {};
        personas.forEach((v, k) => { obj[k] = v; });
        almacen.guardar(CLAVE_PERSONAS, JSON.stringify(obj));
    } catch {
        // silencioso
    }
}

function podarSiExcede(personas: Map<string, RegistroInterno>): void {
    if (personas.size <= TOPE_PERSONAS) return;
    const entradas: Array<[string, RegistroInterno]> = [];
    personas.forEach((v, k) => { entradas.push([k, v]); });
    entradas.sort((a, b) => a[1].desde - b[1].desde);
    const aBorrar = entradas.length - TOPE_PERSONAS;
    for (let i = 0; i < aBorrar; i++) {
        personas.delete(entradas[i][0]);
    }
}

export function crearAlmacenPersonasMemoria(): AlmacenPersonas {
    const mapa = new Map<string, string>();
    return {
        obtener: (clave: string) => mapa.get(clave) ?? null,
        guardar: (clave: string, valor: string) => { mapa.set(clave, valor); },
    };
}

export function observar(personaId: string, deteccion: { idioma: string; confianza: number }, almacen: AlmacenPersonas, reloj: () => number = Date.now): void {
    const personas = leerPersonas(almacen);
    const ahora = reloj();
    const existente = personas.get(personaId);

    if (existente?.fuente === "pedido") {
        return;
    }

    const { idioma, confianza } = deteccion;

    if (confianza < UMBRAL_CONFIANZA) {
        if (existente) {
            personas.set(personaId, { ...existente, racha: 0, ultimoIdiomaDetectado: null });
        }
        escribirPersonas(personas, almacen);
        return;
    }

    let racha = 0;
    let ultimoIdioma = idioma;
    let idiomaConfirmado: string | null = null;
    let fuenteConfirmada: FuenteIdioma = "detectado";
    let confianzaConfirmada = 0;
    let desde = ahora;

    if (existente) {
        if (existente.ultimoIdiomaDetectado === idioma) {
            racha = existente.racha + 1;
        } else {
            racha = 1;
        }
        ultimoIdioma = idioma;
        idiomaConfirmado = existente.idioma;
        fuenteConfirmada = existente.fuente;
        confianzaConfirmada = existente.confianza;
        desde = existente.desde;
    } else {
        racha = 1;
        ultimoIdioma = idioma;
        desde = ahora;
    }

    if (racha >= RACHA_NECESARIA) {
        idiomaConfirmado = idioma;
        fuenteConfirmada = "detectado";
        confianzaConfirmada = confianza;
        desde = ahora;
    }

    if (idiomaConfirmado === null) {
        const registro: RegistroInterno = {
            idioma: "",
            fuente: "detectado",
            confianza: 0,
            desde,
            racha,
            ultimoIdiomaDetectado: ultimoIdioma,
        };
        personas.set(personaId, registro);
        escribirPersonas(personas, almacen);
        return;
    }

    const registro: RegistroInterno = {
        idioma: idiomaConfirmado,
        fuente: fuenteConfirmada,
        confianza: confianzaConfirmada,
        desde,
        racha,
        ultimoIdiomaDetectado: ultimoIdioma,
    };

    personas.set(personaId, registro);
    podarSiExcede(personas);
    escribirPersonas(personas, almacen);
}

export function fijar(personaId: string, idioma: string, almacen: AlmacenPersonas, reloj: () => number = Date.now): void {
    const personas = leerPersonas(almacen);
    const ahora = reloj();

    const registro: RegistroInterno = {
        idioma,
        fuente: "pedido",
        confianza: 1,
        desde: ahora,
        racha: 0,
        ultimoIdiomaDetectado: null,
    };

    personas.set(personaId, registro);
    podarSiExcede(personas);
    escribirPersonas(personas, almacen);
}

export function idiomaDe(personaId: string, porDefecto: string, almacen: AlmacenPersonas): string {
    const personas = leerPersonas(almacen);
    const registro = personas.get(personaId);
    if (!registro || !registro.idioma) return porDefecto;
    return registro.idioma;
}

export function olvidar(personaId: string, almacen: AlmacenPersonas): void {
    const personas = leerPersonas(almacen);
    personas.delete(personaId);
    escribirPersonas(personas, almacen);
}