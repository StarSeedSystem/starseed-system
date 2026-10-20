/**
 * Colmena (COL1012I) · de lo que publica un nodo en su latido a lo que se pinta en SU tarjeta de /metagenesis:
 * la línea de información, los botones «Desconectar» y «Usar como contenedor» y la orden que manda cada uno.
 *
 * PURO: sin `window`, sin Supabase, sin Node. Las decisiones de los botones viven en `colmena.ts`
 * (`botonesNeurona`); aquí solo se traduce un `NodoVista` a esa ficha y se añaden las reglas de honestidad
 * que dependen del latido:
 *   · un latido viejo (el nodo publicaba «no apto» sin motivo y `en_curso` siempre vacío) no se toma por verdad:
 *     el botón se ve, desactivado, y dice que hay que actualizar ese nodo;
 *   · un nodo en modo de prueba solo simularía la orden: los botones se desactivan con esa razón;
 *   · mientras el traspaso entre contenedores no esté activo (`relevo`), «Desconectar» y «Usar como contenedor»
 *     no cambiarían nada: se ven desactivados con esa razón (la regla está en `botonesNeurona`);
 *   · nunca se enseñan ids de tarea, ramas ni sha: solo cuántas hay y cuándo fue el último punto de control.
 * Contrato: architecture/colmena-relevo-contenedores.md §3-4.
 */

import { botonesNeurona, ordenContenedor, ordenDesconectar, type Boton, type NeuronaColmena, type SO } from "@/lib/metagenesis/colmena";
import {
    ORDEN_CADUCA_MS,
    esDestinoPara,
    validarArgs,
    type AccionOrden,
    type ArgsOrden,
    type NodoVista,
    type OrdenVista,
    type TareaEnCurso,
} from "@/lib/metagenesis/remoto-nodos";
import { textoHace } from "@/lib/metagenesis/remoto";

/** Las dos órdenes que van a un nodo concreto (el resto van al que dirige). */
export type ClaveBoton = "desconectar" | "contenedor";

export interface OrdenDeBoton {
    accion: ClaveBoton;
    /** Id del nodo: nunca «lider» ni «todos» (el nodo y el servidor lo rechazan). */
    para: string;
    args: ArgsOrden;
}

/** PURA. El sistema de un medio de MetaGenesis, para la ficha del botón (el trabajador solo corre en Linux, Mac y WSL2). */
export function soDeMedio(medio: string): SO {
    if (medio === "mac") return "macos";
    if (medio === "oracle-a1" || medio === "nube-cowork" || medio === "gh-actions") return "linux";
    return "otro";
}

/**
 * PURA. Un nodo con el latido de antes del arreglo (COL1012I) publicaba `contenedor: {activo:false, agentes:0,
 * apto:false, motivo:""}` SIEMPRE (el `M.` sin definir lo tragaba un `except`). Un nodo que de verdad no es apto
 * dice por qué, así que «no apto sin motivo» es un nodo que aún no informa.
 */
function latidoViejo(n: NodoVista): boolean {
    const c = n.contenedor;
    return !!c && !c.apto && !c.activo && c.agentes === 0 && c.motivo.trim() === "";
}

/** PURA. ¿Hay una orden reciente de esta acción para este nodo que nadie ha contestado aún? */
function ordenEnCamino(ordenes: readonly OrdenVista[], accion: ClaveBoton, nodo: string, ahora: number): boolean {
    return ordenes.some(
        (o) => o.accion === accion && o.para === nodo && (o.estado === "pendiente" || o.estado === "tomada") && ahora - o.t < ORDEN_CADUCA_MS,
    );
}

/** PURA. La ficha de la colmena de un nodo, con lo que dice su latido y las órdenes que ya van hacia él. */
export function neuronaDeNodo(n: NodoVista, ordenes: readonly OrdenVista[] = [], ahora = Date.now()): NeuronaColmena {
    const viejo = latidoViejo(n);
    const contenedor = viejo ? null : n.contenedor;
    return {
        nodo: n.nodo,
        vivo: n.vivo,
        so: soDeMedio(n.medio),
        enCurso: n.enCurso.length,
        contenedor,
        desconectando: n.desconectando === true || ordenEnCamino(ordenes, "desconectar", n.nodo, ahora),
        // Sin dato, el traspaso NO está activo: ningún nodo lo declara todavía.
        relevoActivo: n.relevo === true,
        sinDatosTrabajo: viejo || n.informaTrabajo === false,
        sinDatosCapacidad: contenedor === null,
        // Un orquestador vivo sin tareas publicadas puede estar entre dos: no se dice «puedes apagarlo sin más».
        orquestadorVivo: n.orquestadores.length > 0,
    };
}

const EN_PRUEBA = "Este nodo trabaja en modo de prueba: la orden solo se simularía y no cambiaría nada.";
const SIN_DESTINO = "Este nodo no tiene un identificador de destino válido: no puedo mandarle órdenes desde aquí.";

/**
 * PURA. Los dos botones de la tarjeta de un nodo, con las reglas que dependen del nodo concreto:
 *   · sin destino válido (su id no pasa la lista blanca) o con una orden imposible de armar, el botón se ve
 *     desactivado diciéndolo (no se descubre al pulsar);
 *   · en modo de prueba la orden solo se simularía: desactivado con esa razón.
 */
export function botonesDeNodo(n: NodoVista, ordenes: readonly OrdenVista[] = [], ahora = Date.now()): { desconectar: Boton; contenedor: Boton } {
    const base = botonesNeurona(neuronaDeNodo(n, ordenes, ahora));
    const sinOrden = (clave: ClaveBoton, b: Boton): Boton =>
        b.visible && b.habilitado && ordenDeBoton(clave, n) === null ? { ...b, habilitado: false, confirmar: false, explica: SIN_DESTINO } : b;
    const aPrueba = (b: Boton): Boton => (b.visible ? { ...b, habilitado: false, confirmar: false, explica: EN_PRUEBA } : b);
    const desconectar = sinOrden("desconectar", base.desconectar);
    const contenedor = sinOrden("contenedor", base.contenedor);
    if (n.modo !== "seco") return { desconectar, contenedor };
    return { desconectar: aPrueba(desconectar), contenedor: aPrueba(contenedor) };
}

/**
 * PURA. ¿Por qué esta orden ya no se puede mandar a este nodo? null = se puede. Es la defensa del clic: el botón
 * desactivado no se pulsa, pero entre el dibujo y el clic el latido puede cambiar (el nodo pasó a prueba, el
 * traspaso dejó de estar activo, la orden anterior sigue en camino) y entonces se dice la razón en vez de mandar
 * algo que la propia ficha ya da por no pulsable.
 */
export function porQueNoSePuedeMandar(clave: ClaveBoton, n: NodoVista, ordenes: readonly OrdenVista[] = [], ahora = Date.now()): string | null {
    const boton = botonesDeNodo(n, ordenes, ahora)[clave];
    if (!boton.visible) return "Esta orden ya no está disponible para este nodo: su estado cambió.";
    if (!boton.habilitado) return `«${boton.etiqueta}» ya no se puede mandar a este nodo: ${boton.explica}`;
    return null;
}

const MS_SI_MAYOR = 1e11;

/**
 * PURA. El último punto de control entre las tareas en curso, en ms. El latido lo publica en SEGUNDOS
 * (`time.time()` del nodo); por si algún nodo mandara ms, un valor por encima de 1e11 ya se toma por ms.
 * Un punto sin `sha` o con `t` 0 no es un punto.
 */
export function ultimoPunto(enCurso: readonly TareaEnCurso[]): { t: number | null; sinPunto: number } {
    let mejor: number | null = null;
    let sinPunto = 0;
    for (const e of enCurso) {
        const p = e.punto;
        if (!p || !p.sha || !(p.t > 0)) {
            sinPunto += 1;
            continue;
        }
        const ms = p.t < MS_SI_MAYOR ? p.t * 1000 : p.t;
        if (mejor === null || ms > mejor) mejor = ms;
    }
    return { t: mejor, sinPunto };
}

const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`;

/**
 * PURA. Las líneas de información de la tarjeta, sin ids ni rutas:
 *   «2 agentes · puede ser contenedor» y «1 tarea en curso · Último punto de control hace 5 min».
 * Un nodo caído lo dice primero: lo que sigue es su ÚLTIMO latido, no lo de ahora. Y mientras el reparto de tareas a
 * contenedores no esté activo, «contenedor activo» no se escribe: un nodo apuntado solo está apuntado.
 */
export function lineaDeNodo(n: NodoVista, ahora = Date.now()): string[] {
    const viejo = latidoViejo(n);
    const c = viejo ? null : n.contenedor;
    const lineas: string[] = [];
    if (!n.vivo) lineas.push(n.hace_ms === null ? "Este nodo no ha latido todavía" : `Según su último latido (${textoHace(n.hace_ms)})`);
    if (!c) lineas.push("Este nodo aún no informa de lo que puede aportar como contenedor.");
    else if (!c.apto) lineas.push(`${c.activo ? "Apuntado como contenedor, pero ahora no puede" : "No puede ser contenedor"}${c.motivo ? `: ${c.motivo}` : ""}`);
    else if (!c.activo) lineas.push(`${plural(c.agentes, "agente", "agentes")} · puede ser contenedor`);
    else if (n.relevo === true) lineas.push(`${plural(c.agentes, "agente", "agentes")} · contenedor activo`);
    else lineas.push(`Apuntado como contenedor (hasta ${plural(c.agentes, "agente", "agentes")}) · el reparto de tareas aún no está activo`);
    if (viejo || n.informaTrabajo === false) {
        lineas.push("Este nodo aún no informa de su trabajo.");
        return lineas;
    }
    if (n.enCurso.length === 0) {
        lineas.push(n.orquestadores.length > 0 ? "Orquestador en marcha · ninguna tarea publicada ahora" : "Sin tareas en curso");
        return lineas;
    }
    const { t, sinPunto } = ultimoPunto(n.enCurso);
    const punto = t === null ? "Sin punto de control todavía" : `Último punto de control ${textoHace(Math.max(0, ahora - t))}`;
    const sin = t !== null && sinPunto > 0 ? ` · ${plural(sinPunto, "tarea sin punto", "tareas sin punto")}` : "";
    lineas.push(`${plural(n.enCurso.length, "tarea en curso", "tareas en curso")} · ${punto}${sin}`);
    return lineas;
}

/**
 * PURA. La orden que manda un botón de la tarjeta, o null si no hay destino válido (la tarjeta lo dice en vez
 * de mandarla). «Usar como contenedor» activa con los agentes que el nodo puede aportar; «Dejar de usar» apaga.
 */
export function ordenDeBoton(clave: ClaveBoton, n: NodoVista): OrdenDeBoton | null {
    if (!esDestinoPara(clave as AccionOrden, n.nodo)) return null;
    if (clave === "desconectar") {
        const o = ordenDesconectar(n.nodo);
        return validarArgs(o.accion, o.args) === null ? o : null;
    }
    const activar = !n.contenedor?.activo;
    const agentes = n.contenedor?.agentes ?? 0;
    if (activar && !(agentes >= 1)) return null;
    const o = ordenContenedor(n.nodo, activar, activar ? agentes : undefined);
    return validarArgs(o.accion, o.args) === null ? o : null;
}

/**
 * Texto del aviso tras mandar una orden a un nodo concreto: dice cuándo la recoge y no promete el resultado.
 * Si el traspaso entre contenedores aún no está activo, lo dice: la orden solo cambia lo que ese nodo ofrece.
 */
export function avisoDeOrdenANodo(etiquetaOrden: string, etiquetaNodo: string, relevoActivo = false): string {
    const base = `Orden «${etiquetaOrden}» enviada a ${etiquetaNodo}: la recoge ese nodo en cuanto lata (hasta 5 min; 2 si dirige) y su respuesta aparece abajo.`;
    return relevoActivo ? base : `${base} Hoy solo cambia lo que ese nodo ofrece: el traspaso y el reparto de tareas a contenedores aún no están activos.`;
}
