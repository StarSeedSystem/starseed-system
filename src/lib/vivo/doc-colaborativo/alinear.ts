/**
 * Alinear lo que devuelve un editor sin ids (el editor tipo Word emite `DocRico`: una lista de
 * bloques anónimos) con las unidades con id que se estaban mostrando. De ahí salen los cambios por
 * unidad: qué bloques cambiaron, cuáles nacieron (y con qué clave de orden) y cuáles se borraron.
 *
 * Estrategia (la de los editores reales, suficiente para escribir, pegar, partir y unir párrafos):
 *   1. prefijo común igual → mismos ids;
 *   2. sufijo común igual → mismos ids;
 *   3. en el tramo del medio, emparejar por posición (esos son los editados); lo que sobra a la
 *      derecha son bloques nuevos y lo que sobra a la izquierda, borrados.
 * El emparejamiento es monótono, así que las claves de orden existentes siguen crecientes y solo
 * los bloques nuevos (o empatados) reciben clave. Puro.
 */

import { clavesParaSecuencia } from "./orden";
import type { CambioUnidad } from "./modelo";

export interface BloqueConId<P> {
    id: string;
    orden: string;
    datos: P;
}

export interface ResultadoAlineacion<P> {
    /** Lo que queda mostrado tras el cambio (mismo orden que el editor). */
    mostrado: BloqueConId<P>[];
    /** Cambios por unidad a aplicar en el motor. */
    cambios: CambioUnidad<P>[];
}

/**
 * @param anteriores lo que el editor mostraba (con ids y claves)
 * @param nuevos lo que el editor emite ahora (sin ids)
 * @param iguales comparación de contenido de dos bloques
 * @param nuevoId fábrica de ids para los bloques que nacen
 */
export function alinearBloques<P>(
    anteriores: BloqueConId<P>[],
    nuevos: P[],
    iguales: (a: P, b: P) => boolean,
    nuevoId: () => string,
): ResultadoAlineacion<P> {
    const nA = anteriores.length;
    const nN = nuevos.length;
    let pre = 0;
    while (pre < nA && pre < nN && iguales(anteriores[pre].datos, nuevos[pre])) pre++;
    let suf = 0;
    while (suf < nA - pre && suf < nN - pre && iguales(anteriores[nA - 1 - suf].datos, nuevos[nN - 1 - suf])) suf++;

    const medioA = anteriores.slice(pre, nA - suf);
    const medioN = nuevos.slice(pre, nN - suf);
    const emparejados = Math.min(medioA.length, medioN.length);

    // Secuencia resultante: {id, orden previo o null (nuevo), datos, cambiado}
    const secuencia: { id: string; orden: string | null; datos: P; cambiado: boolean; previo?: BloqueConId<P> }[] = [];
    for (let i = 0; i < pre; i++) secuencia.push({ id: anteriores[i].id, orden: anteriores[i].orden, datos: anteriores[i].datos, cambiado: false });
    for (let i = 0; i < medioN.length; i++) {
        if (i < emparejados) {
            const a = medioA[i];
            const mismo = iguales(a.datos, medioN[i]);
            secuencia.push({ id: a.id, orden: a.orden, datos: mismo ? a.datos : medioN[i], cambiado: !mismo, previo: a });
        } else {
            secuencia.push({ id: nuevoId(), orden: null, datos: medioN[i], cambiado: true });
        }
    }
    for (let i = nA - suf; i < nA; i++) secuencia.push({ id: anteriores[i].id, orden: anteriores[i].orden, datos: anteriores[i].datos, cambiado: false });

    const claves = clavesParaSecuencia(secuencia.map((s) => ({ id: s.id, orden: s.orden })));
    const cambios: CambioUnidad<P>[] = [];
    const mostrado: BloqueConId<P>[] = [];
    for (const s of secuencia) {
        const orden = claves.get(s.id) ?? s.orden!;
        const esNuevo = s.orden === null;
        const reordenado = !esNuevo && claves.has(s.id);
        if (esNuevo) cambios.push({ id: s.id, datos: s.datos, orden });
        else if (s.cambiado || reordenado) {
            const c: CambioUnidad<P> = { id: s.id };
            if (s.cambiado) c.datos = s.datos;
            if (reordenado) c.orden = orden;
            cambios.push(c);
        }
        mostrado.push({ id: s.id, orden, datos: s.datos });
    }
    for (let i = emparejados; i < medioA.length; i++) cambios.push({ id: medioA[i].id, borrar: true });
    return { mostrado, cambios };
}
