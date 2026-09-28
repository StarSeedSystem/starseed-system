/**
 * Utilidades de las pruebas de programas en vivo: construir entradas y correr diarios sin red.
 * (No es una prueba: el nombre no acaba en .test.)
 */
import { docVacio } from "../juegos/registro";
import type { Datos, DocSala, Entrada, Resultado } from "../juegos/tipos";
import { basePrograma, motorPrograma } from "../programas/motor";
import { especificacionDePlantilla, type IdPlantilla } from "../programas/plantillas";
import type { EstadoPrograma, ProgramaSpec } from "../programas/tipos";

let contador = 0;

export function entradaP(k: string, u: string, d?: Datos, n = 0, t = 1_000 + n * 1_000): Entrada {
    contador += 1;
    return { id: `p${contador}_${n}`, n, u, t, k, ...(d ? { d } : {}) };
}

export function estadoDe(spec: ProgramaSpec, creador = "ana"): EstadoPrograma {
    return motorPrograma.inicial(basePrograma(creador, spec));
}

export function estadoPlantilla(id: IdPlantilla, creador = "ana"): EstadoPrograma {
    return estadoDe(especificacionDePlantilla(id), creador);
}

/** Aplica una acción al estado tal cual está (la numera sola). */
export function intento(e: EstadoPrograma, k: string, u: string, d?: Datos): Resultado<EstadoPrograma> {
    return motorPrograma.aplicar(e, entradaP(k, u, d, e.n));
}

/** Aplica y exige que se acepte. */
export function hacer(e: EstadoPrograma, k: string, u: string, d?: Datos): EstadoPrograma {
    const r = intento(e, k, u, d);
    if (!r.ok) throw new Error(`Acción ${k} de ${u} rechazada: ${r.motivo}`);
    return r.estado;
}

/** Aplica y exige que se rechace; devuelve el motivo. */
export function rechazo(e: EstadoPrograma, k: string, u: string, d?: Datos): string {
    const r = intento(e, k, u, d);
    if (r.ok) throw new Error(`Acción ${k} de ${u} aceptada y debía rechazarse`);
    return r.motivo;
}

export function correr(e: EstadoPrograma, pasos: [string, string, Datos?][]): EstadoPrograma {
    return pasos.reduce((acc, [k, u, d]) => hacer(acc, k, u, d), e);
}

/** Congela un valor en profundidad (para comprobar que el motor no muta el estado anterior). */
export function congelar<T>(v: T): T {
    if (v && typeof v === "object" && !Object.isFrozen(v)) {
        Object.freeze(v);
        for (const x of Object.values(v as object)) congelar(x);
    }
    return v;
}

/** Documento de sala de un programa con la plantilla dada (opcionalmente retocada) y el registro vacío. */
export function docProgramaDe(id: IdPlantilla, retoque?: (spec: ProgramaSpec) => void, creador = "ana", registroId = "prog1"): DocSala {
    const spec = especificacionDePlantilla(id);
    retoque?.(spec);
    const doc = docVacio("programa");
    doc.registro = { id: registroId, tipo: "programa", gen: 1, creada: 1, base: basePrograma(creador, spec), log: [] };
    return doc;
}
