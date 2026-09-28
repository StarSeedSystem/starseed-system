/**
 * vista — lógica PURA de la app de Contactos: qué muestra la lista según la selección de la
 * barra lateral, el texto, el orden y la agrupación; recuentos de la barra; etiquetas de
 * cumpleaños y utilidades de fecha/URL. Sin React: se prueba sola.
 */

import {
    agruparContactos,
    filtrarContactos,
    ordenarContactos,
    proximosCumpleanos,
    type GrupoContactos,
    type ProximoCumpleanos,
} from "@/lib/contactos/modelo";
import {
    RELACIONES,
    type AgrupacionContactos,
    type CategoriaContactos,
    type Contacto,
    type FiltroContactos,
    type ListaContactos,
    type OrdenContactos,
    type TipoRelacion,
} from "@/lib/contactos/tipos";

/** Días que abarca «Próximos cumpleaños». */
export const DIAS_CUMPLEANOS = 30;

export type SeleccionLateral =
    | { tipo: "todos" }
    | { tipo: "favoritos" }
    | { tipo: "publicos" }
    | { tipo: "privados" }
    | { tipo: "starseed" }
    | { tipo: "cumpleanos" }
    | { tipo: "relacion"; id: TipoRelacion }
    | { tipo: "categoria"; id: string }
    | { tipo: "lista"; id: string };

export const SELECCION_INICIAL: SeleccionLateral = { tipo: "todos" };

export function claveSeleccion(sel: SeleccionLateral): string {
    return "id" in sel ? `${sel.tipo}:${sel.id}` : sel.tipo;
}

export function mismaSeleccion(a: SeleccionLateral, b: SeleccionLateral): boolean {
    return claveSeleccion(a) === claveSeleccion(b);
}

/** Traduce la selección de la barra + el texto de búsqueda al filtro puro del modelo. */
export function filtroDeSeleccion(sel: SeleccionLateral, texto: string): FiltroContactos {
    const f: FiltroContactos = { texto };
    switch (sel.tipo) {
        case "favoritos":
            f.soloFavoritos = true;
            break;
        case "publicos":
            f.visibilidad = "publica";
            break;
        case "privados":
            f.visibilidad = "privada";
            break;
        case "starseed":
            f.soloStarseed = true;
            break;
        case "relacion":
            f.relacion = sel.id;
            break;
        case "categoria":
            f.categoria = sel.id;
            break;
        case "lista":
            f.lista = sel.id;
            break;
        default:
            break;
    }
    return f;
}

export interface RecuentosLateral {
    todos: number;
    favoritos: number;
    publicos: number;
    privados: number;
    starseed: number;
    cumpleanos: number;
    relacion: Record<TipoRelacion, number>;
    categoria: Record<string, number>;
    lista: Record<string, number>;
}

export function contarLateral(contactos: Contacto[], hoy: Date): RecuentosLateral {
    const relacion = RELACIONES.reduce(
        (acc, r) => {
            acc[r.id] = 0;
            return acc;
        },
        {} as Record<TipoRelacion, number>,
    );
    const categoria: Record<string, number> = {};
    const lista: Record<string, number> = {};
    let favoritos = 0;
    let publicos = 0;
    let starseed = 0;
    for (const c of contactos) {
        if (c.favorito) favoritos++;
        if (c.visibilidad === "publica") publicos++;
        if (c.userId) starseed++;
        relacion[c.relacion] = (relacion[c.relacion] ?? 0) + 1;
        for (const id of c.categorias) categoria[id] = (categoria[id] ?? 0) + 1;
        for (const id of c.listas) lista[id] = (lista[id] ?? 0) + 1;
    }
    return {
        todos: contactos.length,
        favoritos,
        publicos,
        privados: contactos.length - publicos,
        starseed,
        cumpleanos: proximosCumpleanos(contactos, hoy, DIAS_CUMPLEANOS).length,
        relacion,
        categoria,
        lista,
    };
}

export interface ParametrosVista {
    contactos: Contacto[];
    categorias: CategoriaContactos[];
    seleccion: SeleccionLateral;
    texto: string;
    orden: OrdenContactos;
    agrupacion: AgrupacionContactos;
    hoy: Date;
}

export interface ResultadoVista {
    grupos: GrupoContactos[];
    /** Contactos visibles, en el orden en que se pintan (sin repetir). */
    visibles: Contacto[];
    total: number;
    /** Cumpleaños por id de contacto (solo en la vista «Próximos cumpleaños»). */
    cumpleanos: Map<string, ProximoCumpleanos>;
}

/** Calcula los grupos que pinta la lista. */
export function calcularVista(p: ParametrosVista): ResultadoVista {
    const base = filtrarContactos(p.contactos, filtroDeSeleccion(p.seleccion, p.texto), p.categorias);
    const cumpleanos = new Map<string, ProximoCumpleanos>();

    if (p.seleccion.tipo === "cumpleanos") {
        const proximos = proximosCumpleanos(base, p.hoy, DIAS_CUMPLEANOS);
        for (const x of proximos) cumpleanos.set(x.contacto.id, x);
        const contactos = proximos.map((x) => x.contacto);
        const grupos: GrupoContactos[] = contactos.length
            ? [{ clave: "cumpleanos", titulo: `Próximos ${DIAS_CUMPLEANOS} días`, color: "#F43F5E", contactos }]
            : [];
        return { grupos, visibles: contactos, total: contactos.length, cumpleanos };
    }

    const ordenados = ordenarContactos(base, p.orden);
    const grupos = ordenados.length ? agruparContactos(ordenados, p.agrupacion, p.categorias) : [];
    const vistos = new Set<string>();
    const visibles: Contacto[] = [];
    for (const g of grupos) {
        for (const c of g.contactos) {
            if (vistos.has(c.id)) continue;
            vistos.add(c.id);
            visibles.push(c);
        }
    }
    return { grupos, visibles, total: ordenados.length, cumpleanos };
}

/** Título legible de la selección actual. */
export function tituloSeleccion(
    sel: SeleccionLateral,
    categorias: CategoriaContactos[],
    listas: ListaContactos[],
): string {
    switch (sel.tipo) {
        case "todos":
            return "Todos los contactos";
        case "favoritos":
            return "Favoritos";
        case "publicos":
            return "Públicos";
        case "privados":
            return "Privados";
        case "starseed":
            return "En StarSeed";
        case "cumpleanos":
            return "Próximos cumpleaños";
        case "relacion":
            return RELACIONES.find((r) => r.id === sel.id)?.etiqueta ?? "Relación";
        case "categoria":
            return categorias.find((c) => c.id === sel.id)?.nombre ?? "Categoría";
        case "lista":
            return listas.find((l) => l.id === sel.id)?.nombre ?? "Lista";
    }
}

/** Línea secundaria de una fila: el apodo, o el @usuario. */
export function subtituloContacto(c: Pick<Contacto, "apodo" | "username" | "organizacion">): string | null {
    if (c.apodo) return `«${c.apodo}»`;
    if (c.username) return `@${c.username}`;
    if (c.organizacion) return c.organizacion;
    return null;
}

/** Letras del índice lateral, en el mismo orden que la agrupación por letra del modelo. */
export const LETRAS_INDICE = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ#".split("");

function inicioDelDia(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Días que faltan (0 = hoy). */
export function diasHasta(fecha: Date, hoy: Date): number {
    const ms = inicioDelDia(fecha).getTime() - inicioDelDia(hoy).getTime();
    return Math.round(ms / 86_400_000);
}

/** «hoy», «mañana», «en 5 días», con la edad si se conoce. */
export function etiquetaCumple(p: ProximoCumpleanos, hoy: Date): string {
    const dias = diasHasta(p.fecha, hoy);
    const cuando = dias <= 0 ? "hoy" : dias === 1 ? "mañana" : `en ${dias} días`;
    return p.cumple !== undefined && p.cumple > 0 ? `${cuando} · cumple ${p.cumple}` : cuando;
}

const MESES = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
];

export const NOMBRES_MES = MESES;

/** «12 de marzo» o «12 de marzo de 1990» a partir de «AAAA-MM-DD» / «--MM-DD». */
export function formatearCumple(cumple: string | undefined | null): string | null {
    if (!cumple) return null;
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cumple);
    if (m) {
        const mes = MESES[Number(m[2]) - 1];
        return mes ? `${Number(m[3])} de ${mes} de ${m[1]}` : null;
    }
    m = /^--(\d{2})-(\d{2})$/.exec(cumple);
    if (m) {
        const mes = MESES[Number(m[1]) - 1];
        return mes ? `${Number(m[2])} de ${mes}` : null;
    }
    return null;
}

/** «AAAA-MM-DD» de una fecha local (para `<input type="date">`). */
export function ymdLocal(d: Date): string {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Convierte el día elegido en el formulario de notas a la `fecha` ISO de la nota: si es hoy,
 * la hora actual (así lo recién anotado queda arriba); si no, mediodía local de ese día (a
 * salvo de saltos de zona horaria que lo movieran de mes).
 */
export function fechaNotaIso(ymd: string, ahora: Date = new Date()): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (!m) return ahora.toISOString();
    if (ymd === ymdLocal(ahora)) return ahora.toISOString();
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0).toISOString();
}

/**
 * Normaliza una URL escrita a mano. Solo se aceptan http(s): nada de `javascript:` ni
 * `data:`. Sin esquema, se asume https. Devuelve null si no es válida.
 */
export function normalizarUrl(valor: string): string | null {
    const t = valor.trim();
    if (!t) return null;
    const conEsquema = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
    try {
        const u = new URL(conEsquema);
        if (u.protocol !== "http:" && u.protocol !== "https:") return null;
        if (!u.hostname || !u.hostname.includes(".")) return null;
        return u.toString();
    } catch {
        return null;
    }
}

/** Host legible de una URL segura, o null si no es http(s). */
export function hostDeUrl(url: string): string | null {
    try {
        const u = new URL(url);
        if (u.protocol !== "http:" && u.protocol !== "https:") return null;
        return u.hostname.replace(/^www\./, "");
    } catch {
        return null;
    }
}

/** Nombre del archivo de exportación: `contactos-starseed-AAAA-MM-DD.vcf`. */
export function nombreArchivoVcf(hoy: Date, sufijo = ""): string {
    return `contactos-starseed${sufijo ? `-${sufijo}` : ""}-${ymdLocal(hoy)}.vcf`;
}
