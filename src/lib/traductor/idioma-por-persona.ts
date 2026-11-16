/**
 * TU1116-APP-F1 · Idioma por persona: mapa {personaId → {idioma, fuente, confianza, desde}}
 * ────────────────────────────────────────────────────────────────────────────────
 * Aprendizaje con tres detecciones consecutivas del mismo idioma (confianza ≥0.8).
 * Un cambio en un mensaje suelto no lo cambia. `fijar` ("pedido") gana siempre.
 * Tope: 500 personas. Almacén inyectable para tests.
 */

export const TOPE_PERSONAS = 500;

export type Fuente = "pedido" | "detectado";

export interface RegistroIdioma {
    idioma: string;
    fuente: Fuente;
    confianza: number;
    desde: number;
}

export interface MapaPersonas {
    [personaId: string]: RegistroIdioma;
}

export type AlmacenIdioma = {
    obtener(): MapaPersonas;
    guardar(mapa: MapaPersonas): void;
};

const CONFIAZA_MINIMA = 0.8;
const DETECCIONES_REQ = 3;

interface EstadoInterno {
    mapa: MapaPersonas;
    contadores: Mapa<string, number>;
}

let estado: EstadoInterno = { mapa: {}, contadores: new Map() };

function crearRegistro(idioma: string, fuente: Fuente, confianza: number): RegistroIdioma {
    return { idioma, fuente, confianza, desde: Date.now() };
}

function actualizarEstado(nuevoMapa: MapaPersonas): void {
    estado = { mapa: nuevoMapa, contadores: estado.contadores };
}

export function observar(
    personaId: string,
    deteccion: { codigo: string; confianza: number },
    almacen: AlmacenIdioma = { obtener: () => ({ ...estado.mapa }), guardar: () => {} },
): boolean {
    if (deteccion.confianza < CONFIAZA_MINIMA) return false;

    if (deteccion.confianza >= CONFIAZA_MINIMA && debeFijarse(personaId, deteccion.codigo)) {
        fijar(personaId, deteccion.codigo, almacen);
        return true;
    }

    const actual = estado.mapa[personaId];
    if (actual && actual.fuente === "pedido") {
        almacen.guardar(estado.mapa);
        return false;
    }
    if (actual && actual.idioma === deteccion.codigo && actual.fuente === "detectado") {
        const nuevo = (estado.contadores.get(personaId) || 0) + 1;
        estado.contadores.set(personaId, nuevo);
        const nuevoMapa = {
            ...estado.mapa,
            [personaId]: { ...actual, confianza: deteccion.confianza, desde: actual.desde },
        };
        actualizarEstado(nuevoMapa);

        if (nuevo >= DETECCIONES_REQ) {
            fijar(personaId, deteccion.codigo, almacen);
            return true;
        }
    } else {
        estado.contadores.set(personaId, 1);
        const nuevoMapa = {
            ...estado.mapa,
            [personaId]: crearRegistro(deteccion.codigo, "detectado", deteccion.confianza),
        };
        actualizarEstado(nuevoMapa);
    }

    almacen.guardar(estado.mapa);
    return false;
}

function debeFijarse(personaId: string, idioma: string): boolean {
    const recencia = estado.mapa[personaId];
    if (!recencia || recencia.idioma !== idioma || recencia.fuente !== "detectado") {
        return false;
    }
    const contador = estado.contadores.get(personaId) || 0;
    return contador >= DETECCIONES_REQ;
}

export function fijar(
    personaId: string,
    idioma: string,
    almacen: AlmacenIdioma = { obtener: () => ({ ...estado.mapa }), guardar: () => {} },
): void {
    const anterior = estado.mapa[personaId];
    if (anterior && anterior.fuente === "pedido" && anterior.idioma === idioma) return;

    estado.contadores.delete(personaId);
    const nuevoMapa = {
        ...estado.mapa,
        [personaId]: crearRegistro(idioma, "pedido", 1),
    };
    actualizarEstado(nuevoMapa);
    almacen.guardar(estado.mapa);
}

export function idiomaDe(personaId: string, porDefecto?: string): string | undefined {
    const registro = estado.mapa[personaId];
    if (!registro) return porDefecto;
    return registro.idioma;
}

export function olvidar(personaId: string, almacen: AlmacenIdioma): void {
    const { [personaId]: _, ...resto } = estado.mapa;
    estado.contadores.delete(personaId);
    actualizarEstado(resto);
    almacen.guardar(resto);
}

export function obtenerMapa(): MapaPersonas {
    return { ...estado.mapa };
}

export function reiniciar(): void {
    estado = { mapa: {}, contadores: new Map() };
}