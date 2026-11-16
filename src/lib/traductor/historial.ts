/** Historial local del traductor: clave `starseed.traductor.historial.v1`, tope 50 entradas, 2000 chars por texto.
 *  Opción `starseed.traductor.sinhistorial.v1` desactiva el guardado. Almacén inyectable con try/catch. */

export interface EntradaHistorial {
    readonly id: string;
    readonly timestamp: number;
    readonly origen: string;
    readonly destino: string;
    readonly textoOrigen: string;
    readonly textoDestino: string;
    readonly motor: string;
}

export interface AlmacenHistorial {
    obtener(clave: string): string | null;
    guardar(clave: string, valor: string): void;
    borrar(clave: string): void;
}

export interface OpcionesHistorial {
    readonly sinHistorial: boolean;
}

const CLAVE_HISTORIAL = "starseed.traductor.historial.v1";
const CLAVE_SIN_HISTORIAL = "starseed.traductor.sinhistorial.v1";
const TOPE_ENTRADAS = 50;
const MAX_CHARS = 2000;

function generarId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function truncar(texto: string): string {
    return texto.slice(0, MAX_CHARS);
}

function leerHistorial(almacen: AlmacenHistorial): EntradaHistorial[] {
    try {
        const raw = almacen.obtener(CLAVE_HISTORIAL);
        if (!raw) return [];
        const parseado = JSON.parse(raw);
        if (!Array.isArray(parseado)) return [];
        return parseado.filter((e): e is EntradaHistorial =>
            typeof e === "object" && e !== null &&
            typeof e.id === "string" &&
            typeof e.timestamp === "number" &&
            typeof e.origen === "string" &&
            typeof e.destino === "string" &&
            typeof e.textoOrigen === "string" &&
            typeof e.textoDestino === "string" &&
            typeof e.motor === "string"
        );
    } catch {
        return [];
    }
}

function escribirHistorial(entradas: EntradaHistorial[], almacen: AlmacenHistorial): void {
    try {
        almacen.guardar(CLAVE_HISTORIAL, JSON.stringify(entradas));
    } catch {
        // silencioso
    }
}

export function registrar(
    entrada: Omit<EntradaHistorial, "id" | "timestamp">,
    almacen: AlmacenHistorial,
    opciones: OpcionesHistorial
): void {
    if (opciones.sinHistorial) return;

    const historial = leerHistorial(almacen);
    const nueva: EntradaHistorial = {
        id: generarId(),
        timestamp: Date.now(),
        origen: entrada.origen,
        destino: entrada.destino,
        textoOrigen: truncar(entrada.textoOrigen),
        textoDestino: truncar(entrada.textoDestino),
        motor: entrada.motor,
    };

    const actualizado = [nueva, ...historial].slice(0, TOPE_ENTRADAS);
    escribirHistorial(actualizado, almacen);
}

export function listar(almacen: AlmacenHistorial): EntradaHistorial[] {
    return leerHistorial(almacen);
}

export function borrar(id: string, almacen: AlmacenHistorial): void {
    try {
        const historial = leerHistorial(almacen);
        const filtrado = historial.filter((e) => e.id !== id);
        escribirHistorial(filtrado, almacen);
    } catch {
        // silencioso
    }
}

export function borrarTodo(almacen: AlmacenHistorial): void {
    try {
        almacen.borrar(CLAVE_HISTORIAL);
    } catch {
        // silencioso
    }
}