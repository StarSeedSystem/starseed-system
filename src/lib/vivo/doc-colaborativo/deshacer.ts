/**
 * Deshacer/rehacer SELECTIVO para edición a varias manos (2026-09-28).
 *
 * Un deshacer ingenuo (volver a la foto anterior del documento) borraría también lo que otras
 * personas escribieron entre medias. Aquí cada paso guarda, por unidad tocada, la versión de
 * antes y la de después: deshacer solo devuelve a su estado previo las unidades que siguen tal y
 * como TÚ las dejaste; si alguien las cambió después, se respetan (no se pisa trabajo ajeno).
 * Los cambios seguidos con la misma clave (escribir, arrastrar) forman un solo paso. Puro.
 */

import { mismoContenido, type CambioUnidad, type UnidadColab } from "./modelo";

export interface Parche<P> {
    id: string;
    antes: UnidadColab<P> | null;
    despues: UnidadColab<P>;
}

interface Paso<P> {
    parches: Map<string, Parche<P>>;
    clave: string | null;
    t: number;
}

export interface OpcionesPaso {
    agrupar?: string;
    /** La agrupación caduca tras estos ms sin cambios. */
    ventana?: number;
}

export const PASOS_DESHACER = 100;

function aCambio<P>(objetivo: UnidadColab<P> | null): CambioUnidad<P> | null {
    // La unidad no existía: deshacer = borrarla.
    if (!objetivo) return null;
    if (objetivo.borrado) return { id: objetivo.id, borrar: true, orden: objetivo.orden };
    if (objetivo.datos === undefined) return null;
    return { id: objetivo.id, datos: objetivo.datos, orden: objetivo.orden, borrar: false };
}

export class PilaDeshacer<P> {
    private pasado: Paso<P>[] = [];
    private futuro: Paso<P>[] = [];

    get puedeDeshacer(): boolean {
        return this.pasado.length > 0;
    }

    get puedeRehacer(): boolean {
        return this.futuro.length > 0;
    }

    /** Anota un cambio local (lo que devolvió el motor al aplicarlo). */
    registrar(parches: Parche<P>[], opciones: OpcionesPaso = {}, ahora = Date.now()): void {
        if (!parches.length) return;
        const ultimo = this.pasado[this.pasado.length - 1];
        const agrupa =
            !!opciones.agrupar &&
            !!ultimo &&
            ultimo.clave === opciones.agrupar &&
            (opciones.ventana === undefined || ahora - ultimo.t <= opciones.ventana);
        const paso: Paso<P> = agrupa ? ultimo : { parches: new Map(), clave: opciones.agrupar ?? null, t: ahora };
        for (const p of parches) {
            const previo = paso.parches.get(p.id);
            // En un mismo paso: el «antes» es el primero y el «después», el último.
            paso.parches.set(p.id, { id: p.id, antes: previo ? previo.antes : p.antes, despues: p.despues });
        }
        paso.t = ahora;
        if (!agrupa) {
            this.pasado.push(paso);
            if (this.pasado.length > PASOS_DESHACER) this.pasado.shift();
        }
        this.futuro = [];
    }

    /** Cambios que deshacen el último paso (solo lo que nadie ha tocado después). null = nada. */
    deshacer(actual: (id: string) => UnidadColab<P> | undefined): CambioUnidad<P>[] | null {
        const paso = this.pasado.pop();
        if (!paso) return null;
        this.futuro.push(paso);
        return this.revertir(paso, actual, "antes");
    }

    rehacer(actual: (id: string) => UnidadColab<P> | undefined): CambioUnidad<P>[] | null {
        const paso = this.futuro.pop();
        if (!paso) return null;
        this.pasado.push(paso);
        return this.revertir(paso, actual, "despues");
    }

    /**
     * Tras aplicar un deshacer/rehacer el motor devuelve las versiones nuevas: se apuntan en el
     * paso para que el siguiente rehacer/deshacer compare con lo que de verdad quedó.
     */
    sellar(parches: Parche<P>[], hacia: "antes" | "despues"): void {
        const paso = hacia === "antes" ? this.futuro[this.futuro.length - 1] : this.pasado[this.pasado.length - 1];
        if (!paso) return;
        for (const p of parches) {
            const previo = paso.parches.get(p.id);
            if (!previo) continue;
            if (hacia === "antes") paso.parches.set(p.id, { ...previo, antes: p.despues });
            else paso.parches.set(p.id, { ...previo, despues: p.despues });
        }
    }

    vaciar(): void {
        this.pasado = [];
        this.futuro = [];
    }

    private revertir(paso: Paso<P>, actual: (id: string) => UnidadColab<P> | undefined, hacia: "antes" | "despues"): CambioUnidad<P>[] {
        const cambios: CambioUnidad<P>[] = [];
        for (const p of paso.parches.values()) {
            const esperado = hacia === "antes" ? p.despues : p.antes;
            const objetivo = hacia === "antes" ? p.antes : p.despues;
            const ahora = actual(p.id);
            // Si otra persona la cambió después, se respeta su versión.
            const intacta = esperado ? mismoContenido(ahora, esperado) : !ahora || !!ahora.borrado;
            if (!intacta) continue;
            const c = aCambio(objetivo);
            if (c) cambios.push(c);
            else if (ahora && !ahora.borrado) cambios.push({ id: p.id, borrar: true });
        }
        return cambios;
    }
}
