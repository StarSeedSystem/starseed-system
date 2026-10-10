/**
 * StarSeed XR · resolución de referencias habladas («el grupo de la banda», «Ana», «este grupo»).
 * Exacto = mismas palabras con sentido (sin artículos); parcial = lo dicho cabe dentro de un nombre más largo.
 * Un parcial NUNCA se acepta solo: se pregunta «¿te refieres a …?». Dos exactos = ambiguo.
 */
import type { ContextoVoz, RefResuelta, Referenciable, TipoRef } from "./intenciones-tipos";

export const limpiar = (s: string): string =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\blibreria\b/g, "biblioteca").replace(/[¿?¡!"«»()]/g, " ").replace(/\s+/g, " ").trim();

const VACIAS = new Set(["el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al", "a", "mi", "mis", "tu", "tus", "este", "esta", "estos", "estas", "ese", "esa", "esos", "esas", "grupo", "grupos", "equipo", "comunidad", "colectivo", "estacion", "servidor", "llamada", "contacto"]);
const palabras = (s: string): string[] => limpiar(s).replace(/[,.;]/g, " ").split(" ").filter((p) => p && !VACIAS.has(p));

export type Busqueda =
    | { estado: "exacto"; ref: RefResuelta }
    | { estado: "ambiguo" | "parcial"; candidatos: RefResuelta[] }
    | { estado: "ninguno" };

const aRef = (tipo: TipoRef, r: Referenciable): RefResuelta => ({ tipo, id: r.id, nombre: r.nombre, ...(r.miembros !== undefined ? { miembros: r.miembros } : {}) });

export function buscar(tipo: TipoRef, lista: Referenciable[], texto: string): Busqueda {
    const q = palabras(texto);
    if (!q.length) return { estado: "ninguno" };
    const exactos: Referenciable[] = [];
    const parciales: Referenciable[] = [];
    for (const r of lista) {
        const nombres = [r.nombre, ...(r.alias ?? [])].map(palabras);
        if (nombres.some((n) => n.length === q.length && q.every((p) => n.includes(p)))) exactos.push(r);
        else if (nombres.some((n) => q.every((p) => n.includes(p)))) parciales.push(r);
    }
    if (exactos.length === 1) return { estado: "exacto", ref: aRef(tipo, exactos[0]) };
    if (exactos.length > 1) return { estado: "ambiguo", candidatos: exactos.map((r) => aRef(tipo, r)) };
    if (parciales.length) return { estado: "parcial", candidatos: parciales.map((r) => aRef(tipo, r)) };
    return { estado: "ninguno" };
}

const DEICTICO = /^(?:este|esta|ese|esa|estos|estas|esos|esas|aqui)\b/;
export const esDeictico = (texto: string): boolean => DEICTICO.test(limpiar(texto));

/** «este grupo» = el grupo que la persona señala o mira ahora; si no hay, no se inventa. */
export function porEnfoque(ctx: ContextoVoz, tipo: TipoRef): RefResuelta | null {
    if (!ctx.enfoque || ctx.enfoque.tipo !== tipo) return null;
    const r = listaDe(ctx, tipo).find((x) => x.id === ctx.enfoque?.id);
    return r ? aRef(tipo, r) : null;
}

export function pregunta(b: Exclude<Busqueda, { estado: "exacto" }>, que: string, dicho: string): string {
    if (b.estado === "ninguno") return `No encuentro ${que} «${dicho.trim()}». Dime su nombre exacto o señálalo.`;
    const nombres = b.candidatos.slice(0, 4).map((c) => `«${c.nombre}»`).join(", ");
    return b.estado === "parcial" && b.candidatos.length === 1
        ? `¿Te refieres a ${nombres}? Dime «sí» o el nombre exacto.`
        : `Hay varios que encajan con «${dicho.trim()}»: ${nombres}. ¿Cuál?`;
}

export const listaDe = (ctx: ContextoVoz, tipo: TipoRef): Referenciable[] =>
    ({ grupo: ctx.grupos, persona: ctx.contactos, estacion: ctx.estaciones, servidor: ctx.servidores })[tipo];

/** Busca en varias listas a la vez: un exacto único gana; dos exactos (aunque sean de listas distintas) son ambiguos. */
export function buscarEn(tipos: TipoRef[], ctx: ContextoVoz, texto: string): Busqueda {
    const exactos: RefResuelta[] = [];
    const parciales: RefResuelta[] = [];
    for (const t of tipos) {
        const b = buscar(t, listaDe(ctx, t), texto);
        if (b.estado === "exacto") exactos.push(b.ref);
        else if (b.estado === "ambiguo") exactos.push(...b.candidatos);
        else if (b.estado === "parcial") parciales.push(...b.candidatos);
    }
    if (exactos.length === 1) return { estado: "exacto", ref: exactos[0] };
    if (exactos.length > 1) return { estado: "ambiguo", candidatos: exactos };
    return parciales.length ? { estado: "parcial", candidatos: parciales } : { estado: "ninguno" };
}

export type Eleccion =
    | { tipo: "elegido"; ref: RefResuelta }
    | { tipo: "cancelado" }
    | { tipo: "sigue"; pregunta: string };

const ORDINALES: [RegExp, number][] = [
    [/\b(?:primero|primera|uno|1)\b/, 0], [/\b(?:segundo|segunda|dos|2)\b/, 1], [/\b(?:tercero|tercera|tres|3)\b/, 2], [/\b(?:cuarto|cuarta|cuatro|4)\b/, 3],
];

/** Respuesta hablada a «¿Cuál?»: «sí» (si había uno), «el segundo», «la última», el nombre; «no» / «cancela» corta. Nunca elige por azar. */
export function elegirCandidato(frase: string, candidatos: RefResuelta[]): Eleccion {
    const t = limpiar(frase);
    if (/^(?:no|ninguno|ninguna|cancela|cancelar|olvidalo|para)\b/.test(t)) return { tipo: "cancelado" };
    if (candidatos.length === 1 && /^(?:si|sip|vale|dale|ese|esa|ese mismo|correcto|confirmo|exacto|ok)\b/.test(t)) return { tipo: "elegido", ref: candidatos[0] };
    if (/\b(?:ultimo|ultima)\b/.test(t)) return { tipo: "elegido", ref: candidatos[candidatos.length - 1] };
    const orden = ORDINALES.find(([r]) => r.test(t));
    if (orden && orden[1] < candidatos.length) return { tipo: "elegido", ref: candidatos[orden[1]] };
    const q = palabras(t);
    const coinciden = q.length ? candidatos.filter((c) => q.every((p) => palabras(c.nombre).includes(p))) : [];
    if (coinciden.length === 1) return { tipo: "elegido", ref: coinciden[0] };
    const lista = candidatos.slice(0, 4).map((c, i) => `${i + 1}. «${c.nombre}»`).join(", ");
    return { tipo: "sigue", pregunta: `No te he entendido. Di el número o el nombre: ${lista}, o «cancela».` };
}
