/**
 * Validación de la ESPECIFICACIÓN de un programa y de los datos de sus bloques.
 *
 * Todo lo que llega —de una plantilla, del editor, de otro dispositivo o de la base— se trata
 * como no fiable: vocabulario cerrado, límites de tamaño y ninguna cadena con aspecto de código
 * (`pareceCodigo`, la misma guarda que usa `UiSpec`, para que la especificación siempre pueda
 * proyectarse a `UiSpec` sin que el validador la rechace). Nunca lanza.
 */
import { pareceCodigo } from "@/lib/nucleo/ui-spec";
import {
    LIM,
    esTipoBloqueProg,
    type BloqueContador,
    type BloqueEncuesta,
    type BloqueFormulario,
    type BloqueKanban,
    type BloqueProg,
    type BloqueTareas,
    type CampoFormulario,
    type DatosBloque,
    type ProgramaSpec,
    type Respuesta,
    type Tarea,
    type Tarjeta,
    type TipoCampo,
} from "./tipos";

const PATRON_ID = /^[a-z0-9][a-z0-9_-]{0,23}$/i;

export function idValido(v: unknown): v is string {
    return typeof v === "string" && PATRON_ID.test(v);
}

function esObjeto(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g;

/** Texto de una sola línea: sin controles ni bidireccionales, espacios colapsados, recortado. */
export function limpiarLinea(v: unknown, max: number): string {
    if (typeof v !== "string") return "";
    return v.replace(CONTROL, "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Texto de varias líneas: conserva los saltos de línea (máx. dos seguidos). */
export function limpiarParrafo(v: unknown, max: number): string {
    if (typeof v !== "string") return "";
    return v
        .replace(/\r\n?/g, "\n")
        .replace(CONTROL, "")
        .replace(/[ \t]+/g, " ")
        .replace(/ ?\n ?/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, max);
}

interface Ctx {
    problemas: string[];
    invalido: boolean;
}

function problema(ctx: Ctx, mensaje: string, grave = true): void {
    if (grave) ctx.invalido = true;
    if (!ctx.problemas.includes(mensaje)) ctx.problemas.push(mensaje);
}

/** Cadena de la especificación: limpia y sin aspecto de código. */
function linea(v: unknown, max: number, donde: string, ctx: Ctx): string {
    const s = limpiarLinea(v, max);
    if (pareceCodigo(s)) {
        problema(ctx, `«${donde}» parece código: un programa es dato, no código.`);
        return "";
    }
    return s;
}

function parrafo(v: unknown, max: number, donde: string, ctx: Ctx): string {
    const s = limpiarParrafo(v, max);
    if (pareceCodigo(s)) {
        problema(ctx, `«${donde}» parece código: un programa es dato, no código.`);
        return "";
    }
    return s;
}

function entero(v: unknown, min: number, max: number): number | null {
    if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v)) return null;
    if (v < min || v > max) return null;
    return v;
}

function enteroONulo(v: unknown, min: number, max: number, donde: string, ctx: Ctx): number | null {
    if (v === null || v === undefined) return null;
    const n = entero(v, min, max);
    if (n === null) problema(ctx, `«${donde}» debe ser un número entero entre ${min} y ${max}.`);
    return n;
}

// ───────────────────────────── Bloques ─────────────────────────────

function sanearTareas(x: Record<string, unknown>, id: string, semillas: boolean, ctx: Ctx): BloqueTareas {
    const b: BloqueTareas = { id, tipo: "tareas", titulo: linea(x.titulo, LIM.titulo, "título de la lista", ctx) || "Tareas" };
    if (semillas && Array.isArray(x.iniciales)) {
        const lista = x.iniciales
            .map((t) => linea(t, LIM.item, "tarea inicial", ctx))
            .filter((t) => t.length > 0)
            .slice(0, LIM.tareas);
        if (lista.length > 0) b.iniciales = lista;
    }
    return b;
}

function sanearContador(x: Record<string, unknown>, id: string, ctx: Ctx): BloqueContador {
    const tope = LIM.contadorTope;
    const paso = x.paso === undefined ? 1 : entero(x.paso, 1, 1_000_000);
    if (paso === null) problema(ctx, "El paso del contador debe ser un entero entre 1 y 1.000.000.");
    const inicial = x.inicial === undefined ? 0 : entero(x.inicial, -tope, tope);
    if (inicial === null) problema(ctx, "El valor inicial del contador no es válido.");
    const min = enteroONulo(x.min, -tope, tope, "mínimo del contador", ctx);
    const max = enteroONulo(x.max, -tope, tope, "máximo del contador", ctx);
    const porPersona = enteroONulo(x.porPersona, 1, 1000, "aportes por persona", ctx);
    const ini = inicial ?? 0;
    if (min !== null && max !== null && min > max) problema(ctx, "El mínimo del contador no puede ser mayor que el máximo.");
    if (min !== null && ini < min) problema(ctx, "El valor inicial queda por debajo del mínimo.");
    if (max !== null && ini > max) problema(ctx, "El valor inicial queda por encima del máximo.");
    return {
        id,
        tipo: "contador",
        titulo: linea(x.titulo, LIM.titulo, "título del contador", ctx) || "Contador",
        inicial: ini,
        paso: paso ?? 1,
        min,
        max,
        unidad: linea(x.unidad, 24, "unidad del contador", ctx),
        porPersona,
    };
}

function sanearEncuesta(x: Record<string, unknown>, id: string, ctx: Ctx): BloqueEncuesta {
    const brutas = Array.isArray(x.opciones) ? x.opciones : [];
    if (brutas.length > LIM.opciones) problema(ctx, `Una encuesta admite como máximo ${LIM.opciones} opciones.`);
    const opciones: BloqueEncuesta["opciones"] = [];
    const vistas = new Set<string>();
    brutas.slice(0, LIM.opciones).forEach((o, i) => {
        const obj = esObjeto(o) ? o : {};
        const oid = idValido(obj.id) ? obj.id : `o${i + 1}`;
        const texto = linea(typeof o === "string" ? o : obj.texto, LIM.etiqueta, "opción de la encuesta", ctx);
        if (!texto) return;
        if (vistas.has(oid)) {
            problema(ctx, `La opción «${oid}» está repetida.`);
            return;
        }
        vistas.add(oid);
        opciones.push({ id: oid, texto });
    });
    if (opciones.length < 2) problema(ctx, "Una encuesta necesita al menos dos opciones con texto.");
    const maxEl = x.maxElecciones === undefined ? 1 : entero(x.maxElecciones, 1, LIM.opciones);
    if (maxEl === null) problema(ctx, "El número de elecciones por persona no es válido.");
    return {
        id,
        tipo: "encuesta",
        titulo: linea(x.titulo, LIM.titulo, "título de la encuesta", ctx) || "Encuesta",
        pregunta: linea(x.pregunta, LIM.etiqueta * 2, "pregunta de la encuesta", ctx),
        opciones,
        maxElecciones: Math.max(1, Math.min(maxEl ?? 1, Math.max(1, opciones.length))),
    };
}

function sanearKanban(x: Record<string, unknown>, id: string, semillas: boolean, ctx: Ctx): BloqueKanban {
    const brutas = Array.isArray(x.columnas) ? x.columnas : [];
    if (brutas.length > LIM.columnas) problema(ctx, `Un tablero admite como máximo ${LIM.columnas} columnas.`);
    const columnas: BloqueKanban["columnas"] = [];
    const vistas = new Set<string>();
    brutas.slice(0, LIM.columnas).forEach((c, i) => {
        const obj = esObjeto(c) ? c : {};
        const cid = idValido(obj.id) ? obj.id : `c${i + 1}`;
        const titulo = linea(typeof c === "string" ? c : obj.titulo, LIM.etiqueta, "columna del tablero", ctx);
        if (!titulo) return;
        if (vistas.has(cid)) {
            problema(ctx, `La columna «${cid}» está repetida.`);
            return;
        }
        vistas.add(cid);
        columnas.push({ id: cid, titulo });
    });
    if (columnas.length < 1) problema(ctx, "Un tablero necesita al menos una columna con nombre.");
    const b: BloqueKanban = { id, tipo: "kanban", titulo: linea(x.titulo, LIM.titulo, "título del tablero", ctx) || "Tablero", columnas };
    if (semillas && Array.isArray(x.iniciales)) {
        const lista: NonNullable<BloqueKanban["iniciales"]> = [];
        for (const t of x.iniciales) {
            if (!esObjeto(t) || typeof t.col !== "string" || !vistas.has(t.col)) continue;
            const texto = linea(t.texto, LIM.item, "tarjeta inicial", ctx);
            if (texto) lista.push({ col: t.col, texto });
            if (lista.length >= LIM.tarjetas) break;
        }
        if (lista.length > 0) b.iniciales = lista;
    }
    return b;
}

const TIPOS_CAMPO: readonly TipoCampo[] = ["texto", "largo", "numero", "opcion", "casilla"];

function sanearCampos(v: unknown, ctx: Ctx): CampoFormulario[] {
    const brutos = Array.isArray(v) ? v : [];
    if (brutos.length > LIM.campos) problema(ctx, `Un formulario admite como máximo ${LIM.campos} campos.`);
    const out: CampoFormulario[] = [];
    const vistos = new Set<string>();
    brutos.slice(0, LIM.campos).forEach((c, i) => {
        if (!esObjeto(c)) return;
        const cid = idValido(c.id) ? c.id : `f${i + 1}`;
        const etiqueta = linea(c.etiqueta, LIM.etiqueta, "etiqueta del campo", ctx);
        const tipo = TIPOS_CAMPO.includes(c.tipo as TipoCampo) ? (c.tipo as TipoCampo) : "texto";
        if (!etiqueta) {
            problema(ctx, "Todos los campos del formulario necesitan una etiqueta.");
            return;
        }
        if (vistos.has(cid)) {
            problema(ctx, `El campo «${cid}» está repetido.`);
            return;
        }
        vistos.add(cid);
        const campo: CampoFormulario = { id: cid, etiqueta, tipo, obligatorio: c.obligatorio === true };
        if (tipo === "opcion") {
            const ops = (Array.isArray(c.opciones) ? c.opciones : [])
                .map((o) => linea(o, LIM.opcionCampo, "opción del campo", ctx))
                .filter((o, k, todas) => o.length > 0 && todas.indexOf(o) === k)
                .slice(0, LIM.opcionesCampo);
            if (ops.length < 2) problema(ctx, `El campo «${etiqueta}» necesita al menos dos opciones distintas.`);
            campo.opciones = ops;
        }
        out.push(campo);
    });
    if (out.length < 1) problema(ctx, "Un formulario necesita al menos un campo.");
    return out;
}

function sanearFormulario(x: Record<string, unknown>, id: string, ctx: Ctx): BloqueFormulario {
    return {
        id,
        tipo: "formulario",
        titulo: linea(x.titulo, LIM.titulo, "título del formulario", ctx) || "Formulario",
        descripcion: parrafo(x.descripcion, LIM.descripcion, "descripción del formulario", ctx),
        campos: sanearCampos(x.campos, ctx),
        cupo: enteroONulo(x.cupo, 1, LIM.respuestas, "cupo del formulario", ctx),
        confirmacion: linea(x.confirmacion, LIM.item, "mensaje de confirmación", ctx) || "Ya estás apuntada/o. Gracias.",
    };
}

export interface ResultadoBloque {
    bloque: BloqueProg | null;
    problemas: string[];
}

/** Deja un bloque limpio, o `null` (con los problemas) si no se puede salvar. */
export function sanearBloque(bruto: unknown, opciones: { semillas?: boolean } = {}): ResultadoBloque {
    const ctx: Ctx = { problemas: [], invalido: false };
    if (!esObjeto(bruto)) return { bloque: null, problemas: ["Un bloque debe ser un objeto."] };
    if (!esTipoBloqueProg(bruto.tipo)) {
        return { bloque: null, problemas: [`Tipo de bloque desconocido: «${String(bruto.tipo).slice(0, 30)}».`] };
    }
    if (!idValido(bruto.id)) return { bloque: null, problemas: ["Identificador de bloque no válido."] };
    const id = bruto.id;
    const semillas = opciones.semillas === true;
    let bloque: BloqueProg;
    switch (bruto.tipo) {
        case "titulo": {
            const texto = linea(bruto.texto, LIM.titulo, "título", ctx);
            if (!texto) problema(ctx, "El título no puede estar vacío.");
            const nivel = bruto.nivel === 1 || bruto.nivel === 3 ? bruto.nivel : 2;
            bloque = { id, tipo: "titulo", texto, nivel };
            break;
        }
        case "texto": {
            const texto = parrafo(bruto.texto, LIM.texto, "texto", ctx);
            if (!texto) problema(ctx, "El texto no puede estar vacío.");
            bloque = { id, tipo: "texto", texto };
            break;
        }
        case "tareas":
            bloque = sanearTareas(bruto, id, semillas, ctx);
            break;
        case "contador":
            bloque = sanearContador(bruto, id, ctx);
            break;
        case "encuesta":
            bloque = sanearEncuesta(bruto, id, ctx);
            break;
        case "kanban":
            bloque = sanearKanban(bruto, id, semillas, ctx);
            break;
        default:
            bloque = sanearFormulario(bruto, id, ctx);
    }
    return ctx.invalido ? { bloque: null, problemas: ctx.problemas } : { bloque, problemas: ctx.problemas };
}

/** El bloque sin su semilla (lo que se guarda en el estado). */
export function sinSemillas(b: BloqueProg): BloqueProg {
    if (b.tipo === "tareas" || b.tipo === "kanban") {
        const { iniciales: _descartada, ...resto } = b;
        void _descartada;
        return resto as BloqueProg;
    }
    return b;
}

// ───────────────────────────── Programa ─────────────────────────────

export interface ResultadoPrograma {
    spec: ProgramaSpec | null;
    problemas: string[];
}

/** Valida la especificación de un programa entera. */
export function sanearPrograma(bruto: unknown, opciones: { semillas?: boolean } = {}): ResultadoPrograma {
    const ctx: Ctx = { problemas: [], invalido: false };
    if (!esObjeto(bruto)) return { spec: null, problemas: ["La especificación de un programa debe ser un objeto."] };
    if (bruto.v !== undefined && bruto.v !== 1) problema(ctx, "Versión de programa no soportada.");
    const titulo = linea(bruto.titulo, LIM.titulo, "título del programa", ctx) || "Programa sin título";
    const descripcion = parrafo(bruto.descripcion, LIM.descripcion, "descripción del programa", ctx);
    const brutos = Array.isArray(bruto.bloques) ? bruto.bloques : [];
    if (!Array.isArray(bruto.bloques)) problema(ctx, "La lista de bloques falta o no es una lista.");
    if (brutos.length > LIM.bloques) problema(ctx, `Un programa admite como máximo ${LIM.bloques} bloques.`);
    const bloques: BloqueProg[] = [];
    const ids = new Set<string>();
    for (const b of brutos.slice(0, LIM.bloques)) {
        const r = sanearBloque(b, opciones);
        if (!r.bloque) {
            for (const p of r.problemas) problema(ctx, p);
            continue;
        }
        if (ids.has(r.bloque.id)) {
            problema(ctx, `Identificador de bloque repetido: «${r.bloque.id}».`);
            continue;
        }
        ids.add(r.bloque.id);
        bloques.push(r.bloque);
        for (const p of r.problemas) problema(ctx, p, false);
    }
    if (ctx.invalido) return { spec: null, problemas: ctx.problemas };
    return { spec: { v: 1, titulo, descripcion, abierto: bruto.abierto === true, bloques }, problemas: ctx.problemas };
}

// ───────────────────────────── Datos de los bloques ─────────────────────────────

/** Datos con los que nace un bloque (con su semilla, si la lleva). */
export function datosIniciales(b: BloqueProg): DatosBloque {
    switch (b.tipo) {
        case "tareas":
            return {
                tipo: "tareas",
                items: (b.iniciales ?? []).map((texto, i): Tarea => ({ id: `s${i + 1}`, texto, hecha: false, por: "", hechaPor: "", t: 0 })),
            };
        case "contador":
            return { tipo: "contador", aportes: {} };
        case "encuesta":
            return { tipo: "encuesta", votos: {}, cerrada: false };
        case "kanban":
            return {
                tipo: "kanban",
                tarjetas: (b.iniciales ?? []).map((t, i): Tarjeta => ({ id: `s${i + 1}`, col: t.col, texto: t.texto, por: "", t: 0 })),
            };
        case "formulario":
            return { tipo: "formulario", respuestas: [], cerrado: false };
        default:
            return { tipo: b.tipo };
    }
}

function valorDeCampo(v: unknown): string | number | boolean | null {
    if (typeof v === "string") return v.slice(0, LIM.valorLargo);
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "boolean") return v;
    return null;
}

/**
 * Datos guardados de un bloque (por ejemplo, la instantánea de una compactación), validados
 * contra su definición. Devuelve los datos iniciales si lo guardado no encaja.
 */
export function sanearDatos(b: BloqueProg, bruto: unknown): DatosBloque | null {
    if (!esObjeto(bruto) || bruto.tipo !== b.tipo) return null;
    switch (b.tipo) {
        case "tareas": {
            if (!Array.isArray(bruto.items)) return null;
            const items: Tarea[] = [];
            const vistos = new Set<string>();
            for (const x of bruto.items.slice(0, LIM.tareas)) {
                if (!esObjeto(x) || typeof x.id !== "string" || x.id.length === 0 || x.id.length > 48 || vistos.has(x.id)) continue;
                vistos.add(x.id);
                items.push({
                    id: x.id,
                    texto: limpiarLinea(x.texto, LIM.item),
                    hecha: x.hecha === true,
                    por: limpiarLinea(x.por, LIM.nombre),
                    hechaPor: limpiarLinea(x.hechaPor, LIM.nombre),
                    t: typeof x.t === "number" && Number.isFinite(x.t) ? x.t : 0,
                });
            }
            return { tipo: "tareas", items };
        }
        case "contador": {
            const aportes: Record<string, number> = {};
            if (esObjeto(bruto.aportes)) {
                for (const [uid, n] of Object.entries(bruto.aportes).slice(0, LIM.aportantes)) {
                    if (uid.length > 0 && uid.length <= 80 && typeof n === "number" && Number.isInteger(n) && n !== 0) aportes[uid] = n;
                }
            }
            return { tipo: "contador", aportes };
        }
        case "encuesta": {
            const votos: Record<string, string[]> = {};
            const validas = new Set(b.opciones.map((o) => o.id));
            if (esObjeto(bruto.votos)) {
                for (const [uid, lista] of Object.entries(bruto.votos).slice(0, LIM.votantes)) {
                    if (!Array.isArray(lista) || uid.length === 0 || uid.length > 80) continue;
                    const unicas = [...new Set(lista.filter((o): o is string => typeof o === "string" && validas.has(o)))].slice(0, b.maxElecciones);
                    if (unicas.length > 0) votos[uid] = unicas;
                }
            }
            return { tipo: "encuesta", votos, cerrada: bruto.cerrada === true };
        }
        case "kanban": {
            if (!Array.isArray(bruto.tarjetas)) return null;
            const cols = new Set(b.columnas.map((c) => c.id));
            const primera = b.columnas[0]?.id ?? "";
            const tarjetas: Tarjeta[] = [];
            const vistos = new Set<string>();
            for (const x of bruto.tarjetas.slice(0, LIM.tarjetas)) {
                if (!esObjeto(x) || typeof x.id !== "string" || x.id.length === 0 || x.id.length > 48 || vistos.has(x.id)) continue;
                vistos.add(x.id);
                tarjetas.push({
                    id: x.id,
                    col: typeof x.col === "string" && cols.has(x.col) ? x.col : primera,
                    texto: limpiarLinea(x.texto, LIM.item),
                    por: limpiarLinea(x.por, LIM.nombre),
                    t: typeof x.t === "number" && Number.isFinite(x.t) ? x.t : 0,
                });
            }
            return { tipo: "kanban", tarjetas };
        }
        case "formulario": {
            if (!Array.isArray(bruto.respuestas)) return null;
            const respuestas: Respuesta[] = [];
            const vistos = new Set<string>();
            for (const x of bruto.respuestas.slice(0, LIM.respuestas)) {
                if (!esObjeto(x) || typeof x.uid !== "string" || x.uid.length === 0 || x.uid.length > 80 || vistos.has(x.uid)) continue;
                vistos.add(x.uid);
                const v: Respuesta["v"] = {};
                if (esObjeto(x.v)) {
                    for (const c of b.campos) {
                        const val = valorDeCampo(x.v[c.id]);
                        if (val !== null) v[c.id] = val;
                    }
                }
                respuestas.push({ uid: x.uid, nombre: limpiarLinea(x.nombre, LIM.nombre), t: typeof x.t === "number" && Number.isFinite(x.t) ? x.t : 0, v });
            }
            return { tipo: "formulario", respuestas, cerrado: bruto.cerrado === true };
        }
        default:
            return { tipo: b.tipo };
    }
}

/**
 * Tras editar la definición de un bloque, ajusta sus datos para que sigan siendo coherentes
 * (votos a opciones que ya no existen, tarjetas en columnas borradas…).
 */
export function reconciliar(b: BloqueProg, datos: DatosBloque | undefined): DatosBloque {
    return sanearDatos(b, datos) ?? datosIniciales(sinSemillas(b));
}
