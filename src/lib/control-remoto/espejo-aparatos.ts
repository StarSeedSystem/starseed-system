/**
 * CTL1126F-d2 · modo espejo para múltiples aparatos de una neurona
 * Cuando varios aparatos usan una neurona: se elige cada aparato, cada uno se controla
 * en su ventana o pestaña, y hay un "modo espejo" que ejecuta las mismas órdenes
 * en todos los aparatos de la neurona a la vez, en tiempo real, desde la pantalla
 * de cualquiera de ellos. Cada aparato conserva su permiso y su aviso de "te están
 * controlando"; si uno no tiene permiso, el espejo lo salta y lo dice.
 */

export interface AparatoEspejo {
    id: string;
    nombre: string;
    tienePermiso: boolean;
    estaControlado: boolean;
}

export interface EstadoEspejo {
    aparatos: readonly AparatoEspejo[];
    espejoActivo: boolean;
    aparatoSeleccionado: string | null;
}

export interface ResultadoEjecucion {
    aparatoId: string;
    ok: boolean;
    resultado?: unknown;
    motivo?: string;
    saltado?: boolean;
}

export type OrdenEspejo = { accion: string; args: Record<string, unknown> };

export type EjecutorEspejo = (aparato: AparatoEspejo, orden: OrdenEspejo) => Promise<ResultadoEjecucion>;

export const tipoEspejo = "espejo-aparatos.v1";

export function crearEstadoEspejo(): EstadoEspejo {
    return {
        aparatos: [],
        espejoActivo: false,
        aparatoSeleccionado: null,
    };
}

function aparatoExistente(aparatos: readonly AparatoEspejo[], id: string): boolean {
    return aparatos.some((a) => a.id === id);
}

export function agregarAparato(estado: EstadoEspejo, aparato: AparatoEspejo): EstadoEspejo {
    if (aparatoExistente(estado.aparatos, aparato.id)) {
        return estado;
    }
    return {
        ...estado,
        aparatos: [...estado.aparatos, { ...aparato, estaControlado: false }],
    };
}

export function quitarAparato(estado: EstadoEspejo, id: string): EstadoEspejo {
    const nuevosAparatos = estado.aparatos.filter((a) => a.id !== id);
    let nuevoSeleccionado = estado.aparatoSeleccionado;
    let nuevoEspejoActivo = estado.espejoActivo;

    if (estado.aparatoSeleccionado === id) {
        nuevoSeleccionado = null;
    }

    if (estado.espejoActivo && nuevosAparatos.length < 2) {
        nuevoEspejoActivo = false;
    }

    return {
        ...estado,
        aparatos: nuevosAparatos,
        aparatoSeleccionado: nuevoSeleccionado,
        espejoActivo: nuevoEspejoActivo,
    };
}

export function seleccionarAparato(estado: EstadoEspejo, id: string | null): EstadoEspejo {
    if (id === null) {
        return { ...estado, aparatoSeleccionado: null };
    }

    if (!aparatoExistente(estado.aparatos, id)) {
        return estado;
    }

    return {
        ...estado,
        aparatoSeleccionado: id,
        espejoActivo: false,
    };
}

export function activarEspejo(estado: EstadoEspejo): EstadoEspejo {
    if (estado.aparatos.length < 2) {
        return estado;
    }
    return {
        ...estado,
        espejoActivo: true,
        aparatoSeleccionado: null,
    };
}

export function desactivarEspejo(estado: EstadoEspejo): EstadoEspejo {
    return {
        ...estado,
        espejoActivo: false,
    };
}

function aparatosObjetivo(estado: EstadoEspejo): readonly AparatoEspejo[] {
    if (estado.espejoActivo) {
        return estado.aparatos;
    }
    if (estado.aparatoSeleccionado) {
        const aparato = estado.aparatos.find((a) => a.id === estado.aparatoSeleccionado);
        return aparato ? [aparato] : [];
    }
    return [];
}

export interface ResultadoConEstado {
    resultados: ResultadoEjecucion[];
    estado: EstadoEspejo;
}

export async function ejecutarEnEspejo(
    estado: EstadoEspejo,
    orden: OrdenEspejo,
    ejecutor: EjecutorEspejo
): Promise<ResultadoConEstado> {
    const objetivos = aparatosObjetivo(estado);
    if (objetivos.length === 0) {
        return { resultados: [], estado };
    }

    const resultados: ResultadoEjecucion[] = [];
    let estadoActual = estado;

    for (const aparato of objetivos) {
        if (!aparato.tienePermiso) {
            resultados.push({
                aparatoId: aparato.id,
                ok: false,
                motivo: "sin-permiso",
                saltado: true,
            });
            continue;
        }

        const aparatoActualizado = { ...aparato, estaControlado: true };
        const indice = estadoActual.aparatos.findIndex((a) => a.id === aparato.id);
        if (indice >= 0) {
            const nuevosAparatos = [...estadoActual.aparatos];
            nuevosAparatos[indice] = aparatoActualizado;
            estadoActual = { ...estadoActual, aparatos: nuevosAparatos };
        }

        const resultado = await ejecutor(aparatoActualizado, orden);
        resultados.push({ ...resultado, aparatoId: aparato.id });
    }

    return { resultados, estado: estadoActual };
}