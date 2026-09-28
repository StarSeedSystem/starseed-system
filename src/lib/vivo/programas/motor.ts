/**
 * El MOTOR del programa en vivo: convierte el diario compartido de acciones en el estado del
 * programa aplicando reglas puras. Es la única «autoridad»: cada acción —propia o de otro
 * dispositivo— pasa por `aplicar`, y una acción inválida (votar en una encuesta cerrada, apuntarse
 * sin plazas, mover una tarjeta que ya no existe…) se rechaza igual en todos los clientes.
 *
 *   base    → `{ creador, spec, datos?, ids? }`  (`spec` = ProgramaSpec; `datos`/`ids` solo en
 *             registros compactados)
 *   acciones → ver `K` en `tipos.ts`
 *
 * Diseño de la concurrencia: cada acción dice el resultado que quiere («esta tarea, hecha»,
 * «mi voto: B»), no una diferencia («alterna»), así dos personas que hacen lo mismo a la vez no
 * se deshacen entre sí. Lo que sí compite (la última plaza, mover la misma tarjeta) lo decide el
 * orden común del diario, y a quien pierde se le explica.
 *
 * Módulo PURO: sin red, sin reloj, sin azar; nunca lanza.
 */
import type { Datos, Entrada, Motor, MotorCualquiera, Registro, Resultado } from "@/lib/vivo/juegos/tipos";
import { pareceCodigo } from "@/lib/nucleo/ui-spec";
import { comprobarPasoContador, datosDeTipo, validarRespuesta } from "./derivados";
import { datosIniciales, limpiarLinea, limpiarParrafo, reconciliar, sanearBloque, sanearDatos, sanearPrograma, sinSemillas } from "./esquema";
import {
    K,
    LIM,
    type BloqueProg,
    type EstadoPrograma,
    type ProgramaSpec,
    type Respuesta,
    type Tarea,
    type Tarjeta,
} from "./tipos";

type R = Resultado<EstadoPrograma>;

const no = (motivo: string): R => ({ ok: false, motivo });
const ok = (e: EstadoPrograma): R => ({ ok: true, estado: { ...e, n: e.n + 1 } });

function esObjeto(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function conDatos(e: EstadoPrograma, id: string, datos: EstadoPrograma["datos"][string]): EstadoPrograma {
    return { ...e, datos: { ...e.datos, [id]: datos } };
}

function puedeEstructura(e: EstadoPrograma, u: string): boolean {
    return e.abierto || e.creador === u;
}

const SIN_PERMISO = "Solo quien creó el programa puede cambiar su estructura.";

function bloqueDe<T extends BloqueProg["tipo"]>(
    e: EstadoPrograma,
    id: unknown,
    tipo: T,
): { ok: true; b: Extract<BloqueProg, { tipo: T }> } | { ok: false; motivo: string } {
    if (typeof id !== "string") return { ok: false, motivo: "Falta el bloque." };
    const b = e.bloques.find((x) => x.id === id);
    if (!b) return { ok: false, motivo: "Ese bloque ya no existe." };
    if (b.tipo !== tipo) return { ok: false, motivo: "Esa acción no corresponde a ese bloque." };
    return { ok: true, b: b as Extract<BloqueProg, { tipo: T }> };
}

const nombreDe = (d: Datos): string => limpiarLinea(d.nom, LIM.nombre);

// ───────────────────────────── Estado inicial ─────────────────────────────

const ESPECIFICACION_VACIA: ProgramaSpec = { v: 1, titulo: "Programa", descripcion: "", abierto: false, bloques: [] };

function inicial(base: Datos): EstadoPrograma {
    const creador = typeof base.creador === "string" ? base.creador.slice(0, 80) : "";
    const { spec } = sanearPrograma(base.spec, { semillas: true });
    const s = spec ?? ESPECIFICACION_VACIA;
    const guardados = esObjeto(base.datos) ? base.datos : {};
    const datos: EstadoPrograma["datos"] = {};
    for (const b of s.bloques) datos[b.id] = sanearDatos(b, guardados[b.id]) ?? datosIniciales(b);
    return {
        creador,
        titulo: s.titulo,
        descripcion: s.descripcion,
        abierto: s.abierto,
        bloques: s.bloques.map(sinSemillas),
        datos,
        n: 0,
    };
}

// ───────────────────────────── Acciones ─────────────────────────────

function aplicarTarea(e: EstadoPrograma, x: Entrada, d: Datos): R {
    const r = bloqueDe(e, d.b, "tareas");
    if (!r.ok) return no(r.motivo);
    const dat = datosDeTipo(e.datos[r.b.id], "tareas");
    if (!dat) return no("El bloque no tiene datos válidos.");
    if (x.k === K.tareaAdd) {
        const texto = limpiarLinea(d.texto, LIM.item);
        if (!texto) return no("Escribe la tarea.");
        if (dat.items.length >= LIM.tareas) return no("La lista está llena.");
        const item: Tarea = { id: x.id, texto, hecha: false, por: nombreDe(d), hechaPor: "", t: x.t };
        return ok(conDatos(e, r.b.id, { tipo: "tareas", items: [...dat.items, item] }));
    }
    if (x.k === K.tareaMarcar) {
        if (typeof d.hecha !== "boolean") return no("Indica si la tarea está hecha.");
        const i = dat.items.findIndex((t) => t.id === d.i);
        if (i < 0) return no("Esa tarea ya no existe.");
        const actual = dat.items[i];
        const nueva: Tarea = { ...actual, hecha: d.hecha, hechaPor: d.hecha ? nombreDe(d) : "" };
        const items = dat.items.slice();
        items[i] = nueva;
        return ok(conDatos(e, r.b.id, { tipo: "tareas", items }));
    }
    // quitar: idempotente (si ya no está, el resultado deseado ya se cumple)
    return ok(conDatos(e, r.b.id, { tipo: "tareas", items: dat.items.filter((t) => t.id !== d.i) }));
}

function aplicarContar(e: EstadoPrograma, x: Entrada, d: Datos): R {
    const r = bloqueDe(e, d.b, "contador");
    if (!r.ok) return no(r.motivo);
    const dat = datosDeTipo(e.datos[r.b.id], "contador");
    if (!dat) return no("El bloque no tiene datos válidos.");
    if (d.d !== 1 && d.d !== -1) return no("El contador solo sube o baja de uno en uno.");
    const c = comprobarPasoContador(r.b, dat.aportes, x.u, d.d);
    if (!c.ok) return no(c.motivo);
    const aportes = { ...dat.aportes };
    if (c.aporte === 0) delete aportes[x.u];
    else aportes[x.u] = c.aporte;
    return ok(conDatos(e, r.b.id, { tipo: "contador", aportes }));
}

function aplicarVotar(e: EstadoPrograma, x: Entrada, d: Datos): R {
    const r = bloqueDe(e, d.b, "encuesta");
    if (!r.ok) return no(r.motivo);
    const dat = datosDeTipo(e.datos[r.b.id], "encuesta");
    if (!dat) return no("El bloque no tiene datos válidos.");
    if (dat.cerrada) return no("La encuesta está cerrada.");
    if (!Array.isArray(d.o)) return no("Elige una opción.");
    const validas = new Set(r.b.opciones.map((o) => o.id));
    const elegidas = [...new Set(d.o.filter((o): o is string => typeof o === "string"))];
    if (elegidas.some((o) => !validas.has(o))) return no("Esa opción ya no existe.");
    if (elegidas.length > r.b.maxElecciones) {
        return no(r.b.maxElecciones === 1 ? "Solo puedes elegir una opción." : `Puedes elegir hasta ${r.b.maxElecciones} opciones.`);
    }
    const votos = { ...dat.votos };
    if (elegidas.length === 0) delete votos[x.u];
    else {
        if (!(x.u in votos) && Object.keys(votos).length >= LIM.votantes) return no("La encuesta ya tiene demasiadas personas.");
        votos[x.u] = elegidas;
    }
    return ok(conDatos(e, r.b.id, { tipo: "encuesta", votos, cerrada: dat.cerrada }));
}

function aplicarKanban(e: EstadoPrograma, x: Entrada, d: Datos): R {
    const r = bloqueDe(e, d.b, "kanban");
    if (!r.ok) return no(r.motivo);
    const dat = datosDeTipo(e.datos[r.b.id], "kanban");
    if (!dat) return no("El bloque no tiene datos válidos.");
    const columnas = new Set(r.b.columnas.map((c) => c.id));
    const guardar = (tarjetas: Tarjeta[]): R => ok(conDatos(e, r.b.id, { tipo: "kanban", tarjetas }));

    if (x.k === K.tarjetaAdd) {
        if (typeof d.col !== "string" || !columnas.has(d.col)) return no("Esa columna ya no existe.");
        const texto = limpiarLinea(d.texto, LIM.item);
        if (!texto) return no("Escribe la tarjeta.");
        if (dat.tarjetas.length >= LIM.tarjetas) return no("El tablero está lleno.");
        return guardar([...dat.tarjetas, { id: x.id, col: d.col, texto, por: nombreDe(d), t: x.t }]);
    }
    if (x.k === K.tarjetaQuitar) return guardar(dat.tarjetas.filter((t) => t.id !== d.i));

    const idx = dat.tarjetas.findIndex((t) => t.id === d.i);
    if (idx < 0) return no("Esa tarjeta ya no existe.");
    const tarjeta = dat.tarjetas[idx];

    if (x.k === K.tarjetaEditar) {
        const texto = limpiarLinea(d.texto, LIM.item);
        if (!texto) return no("La tarjeta no puede quedar vacía.");
        const tarjetas = dat.tarjetas.slice();
        tarjetas[idx] = { ...tarjeta, texto };
        return guardar(tarjetas);
    }
    // mover
    if (typeof d.col !== "string" || !columnas.has(d.col)) return no("Esa columna ya no existe.");
    const resto = dat.tarjetas.filter((t) => t.id !== tarjeta.id);
    const enColumna = resto.filter((t) => t.col === d.col);
    const pos = typeof d.pos === "number" && Number.isInteger(d.pos) && d.pos >= 0 ? d.pos : enColumna.length;
    let destino: number;
    if (pos >= enColumna.length) {
        const ultima = enColumna[enColumna.length - 1];
        destino = ultima ? resto.indexOf(ultima) + 1 : resto.length;
    } else {
        destino = resto.indexOf(enColumna[pos]);
    }
    const tarjetas = resto.slice();
    tarjetas.splice(destino, 0, { ...tarjeta, col: d.col });
    return guardar(tarjetas);
}

function aplicarFormulario(e: EstadoPrograma, x: Entrada, d: Datos): R {
    const r = bloqueDe(e, d.b, "formulario");
    if (!r.ok) return no(r.motivo);
    const dat = datosDeTipo(e.datos[r.b.id], "formulario");
    if (!dat) return no("El bloque no tiene datos válidos.");
    if (x.k === K.respuestaQuitar) {
        const objetivo = typeof d.uid === "string" && d.uid ? d.uid : x.u;
        if (objetivo !== x.u && !puedeEstructura(e, x.u)) return no("Solo quien creó el programa puede quitar la respuesta de otra persona.");
        return ok(conDatos(e, r.b.id, { tipo: "formulario", respuestas: dat.respuestas.filter((p) => p.uid !== objetivo), cerrado: dat.cerrado }));
    }
    if (dat.cerrado) return no("El formulario está cerrado.");
    const v = validarRespuesta(r.b, d.v);
    if (!v.ok) return no(v.motivo);
    const i = dat.respuestas.findIndex((p) => p.uid === x.u);
    if (i < 0 && r.b.cupo !== null && dat.respuestas.length >= r.b.cupo) return no("Ya no quedan plazas.");
    if (i < 0 && dat.respuestas.length >= LIM.respuestas) return no("El formulario ya tiene demasiadas respuestas.");
    const nueva: Respuesta = { uid: x.u, nombre: nombreDe(d), t: x.t, v: v.v };
    const respuestas = dat.respuestas.slice();
    if (i < 0) respuestas.push(nueva);
    else respuestas[i] = nueva;
    return ok(conDatos(e, r.b.id, { tipo: "formulario", respuestas, cerrado: dat.cerrado }));
}

function aplicarEstructura(e: EstadoPrograma, x: Entrada, d: Datos): R {
    if (x.k === K.abierto) {
        if (e.creador !== x.u) return no("Solo quien creó el programa decide quién puede cambiarlo.");
        if (typeof d.abierto !== "boolean") return no("Indica si el programa queda abierto a cambios.");
        return ok({ ...e, abierto: d.abierto });
    }
    if (!puedeEstructura(e, x.u)) return no(SIN_PERMISO);

    switch (x.k) {
        case K.titulo: {
            let titulo = e.titulo;
            let descripcion = e.descripcion;
            if (d.titulo === undefined && d.descripcion === undefined) return no("No hay nada que cambiar.");
            if (d.titulo !== undefined) {
                titulo = limpiarLinea(d.titulo, LIM.titulo);
                if (!titulo) return no("El título no puede estar vacío.");
            }
            if (d.descripcion !== undefined) descripcion = limpiarParrafo(d.descripcion, LIM.descripcion);
            if (pareceCodigo(titulo) || pareceCodigo(descripcion)) return no("Eso parece código: un programa es dato, no código.");
            return ok({ ...e, titulo, descripcion });
        }
        case K.bloqueAdd: {
            const s = sanearBloque(d.bloque, { semillas: true });
            if (!s.bloque) return no(s.problemas[0] ?? "El bloque no es válido.");
            if (e.bloques.length >= LIM.bloques) return no(`Un programa admite como máximo ${LIM.bloques} bloques.`);
            if (e.bloques.some((b) => b.id === s.bloque!.id)) return no("Ya existe un bloque con ese identificador.");
            const nuevo = sinSemillas(s.bloque);
            const despues = typeof d.despues === "string" ? e.bloques.findIndex((b) => b.id === d.despues) : -1;
            const bloques = e.bloques.slice();
            bloques.splice(despues >= 0 ? despues + 1 : bloques.length, 0, nuevo);
            return ok({ ...e, bloques, datos: { ...e.datos, [nuevo.id]: datosIniciales(s.bloque) } });
        }
        case K.bloqueQuitar: {
            if (typeof d.b !== "string") return no("Falta el bloque.");
            if (!e.bloques.some((b) => b.id === d.b)) return ok(e);
            const datos = { ...e.datos };
            delete datos[d.b];
            return ok({ ...e, bloques: e.bloques.filter((b) => b.id !== d.b), datos });
        }
        case K.bloqueMover: {
            const i = e.bloques.findIndex((b) => b.id === d.b);
            if (i < 0) return no("Ese bloque ya no existe.");
            if (d.dir !== 1 && d.dir !== -1) return no("Indica hacia dónde mover el bloque.");
            const j = i + d.dir;
            if (j < 0 || j >= e.bloques.length) return ok(e);
            const bloques = e.bloques.slice();
            [bloques[i], bloques[j]] = [bloques[j], bloques[i]];
            return ok({ ...e, bloques });
        }
        case K.bloqueEditar: {
            const s = sanearBloque(d.bloque);
            if (!s.bloque) return no(s.problemas[0] ?? "El bloque no es válido.");
            const i = e.bloques.findIndex((b) => b.id === s.bloque!.id);
            if (i < 0) return no("Ese bloque ya no existe.");
            if (e.bloques[i].tipo !== s.bloque.tipo) return no("No se puede cambiar el tipo de un bloque: añade uno nuevo.");
            const bloques = e.bloques.slice();
            bloques[i] = s.bloque;
            return ok({ ...e, bloques, datos: { ...e.datos, [s.bloque.id]: reconciliar(s.bloque, e.datos[s.bloque.id]) } });
        }
        case K.encuestaCerrar: {
            const r = bloqueDe(e, d.b, "encuesta");
            if (!r.ok) return no(r.motivo);
            const dat = datosDeTipo(e.datos[r.b.id], "encuesta");
            if (!dat || typeof d.cerrada !== "boolean") return no("Indica si la encuesta queda cerrada.");
            return ok(conDatos(e, r.b.id, { ...dat, cerrada: d.cerrada }));
        }
        default: {
            // formulario.cerrar
            const r = bloqueDe(e, d.b, "formulario");
            if (!r.ok) return no(r.motivo);
            const dat = datosDeTipo(e.datos[r.b.id], "formulario");
            if (!dat || typeof d.cerrado !== "boolean") return no("Indica si el formulario queda cerrado.");
            return ok(conDatos(e, r.b.id, { ...dat, cerrado: d.cerrado }));
        }
    }
}

const ESTRUCTURA: ReadonlySet<string> = new Set([K.titulo, K.abierto, K.bloqueAdd, K.bloqueQuitar, K.bloqueMover, K.bloqueEditar, K.encuestaCerrar, K.formularioCerrar]);

function aplicar(e: EstadoPrograma, x: Entrada): R {
    if (x.n !== e.n) return no("Acción fuera de orden.");
    const d: Datos = x.d ?? {};
    if (ESTRUCTURA.has(x.k)) return aplicarEstructura(e, x, d);
    switch (x.k) {
        case K.tareaAdd:
        case K.tareaMarcar:
        case K.tareaQuitar:
            return aplicarTarea(e, x, d);
        case K.contar:
            return aplicarContar(e, x, d);
        case K.votar:
            return aplicarVotar(e, x, d);
        case K.tarjetaAdd:
        case K.tarjetaMover:
        case K.tarjetaEditar:
        case K.tarjetaQuitar:
            return aplicarKanban(e, x, d);
        case K.respuesta:
        case K.respuestaQuitar:
            return aplicarFormulario(e, x, d);
        default:
            return no("Acción desconocida.");
    }
}

export const motorPrograma: Motor<EstadoPrograma> = { inicial, aplicar };

/** Tipo de registro de los programas. */
export const TIPO_REGISTRO_PROGRAMA = "programa";

export function buscarMotorProgramas(tipo: string): MotorCualquiera | null {
    return tipo === TIPO_REGISTRO_PROGRAMA ? motorPrograma : null;
}

// ───────────────────────────── Bases de registro ─────────────────────────────

function aJson(x: unknown): Datos {
    return JSON.parse(JSON.stringify(x)) as Datos;
}

/** Base de un programa nuevo (la especificación, con sus semillas). */
export function basePrograma(creador: string, spec: ProgramaSpec): Datos {
    return aJson({ creador, spec });
}

/**
 * Base de un registro COMPACTADO: la especificación y los datos vigentes, más los últimos ids del
 * diario que se pliega (para que quien tenía una acción sin guardar no la repita).
 */
export function baseCompactada(estado: EstadoPrograma, registro: Registro): Datos {
    const spec: ProgramaSpec = { v: 1, titulo: estado.titulo, descripcion: estado.descripcion, abierto: estado.abierto, bloques: estado.bloques };
    return aJson({
        creador: estado.creador,
        spec,
        datos: estado.datos,
        ids: registro.log.slice(-LIM.idsAlCompactar).map((x) => x.id),
    });
}

/** ¿Conviene compactar este registro? */
export function convieneCompactar(registro: Registro | null): boolean {
    return !!registro && registro.log.length >= LIM.compactarDesde;
}
