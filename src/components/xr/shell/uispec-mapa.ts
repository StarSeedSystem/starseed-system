/**
 * StarSeed XR · UISPEC → ESCENA 3D (XR1010AN · `architecture/starseed-xr.md` §3 b, escalón 2).
 * Módulo PURO: `UiSpec` → árbol neutro para uikit. Sin código ejecutable, sin red ni disco.
 */
import {
    MAXIMO_BLOQUES,
    PROFUNDIDAD_MAXIMA,
    PROPS_PERMITIDAS,
    pareceCodigo,
    validarUiSpec,
    type BloqueUi,
    type UiSpec,
} from "@/lib/nucleo/ui-spec";
export type TipoNodo3D =
    | "columna" | "fila" | "texto" | "boton" | "imagen"
    | "lista" | "tarjeta" | "separador" | "nopintable";
export interface Nodo3D {
    tipo: TipoNodo3D;
    props: Record<string, unknown>;
    hijos: Nodo3D[];
    motivo?: string;
    bloqueId?: string;
}
export const OMITIDO = "[contenido omitido]";
export const MOTIVO_SIN_VISTA = "Este bloque aún no tiene vista 3D";
const AVISO_BLOQUES = `La página supera el máximo de ${MAXIMO_BLOQUES} bloques: se muestran los primeros.`;
const AVISO_PROFUNDIDAD = `Profundidad excesiva: el máximo es ${PROFUNDIDAD_MAXIMA} niveles.`;
const AVISO_IMAGEN = "Solo se muestran imágenes por https";
function sinEtiquetas(valor: string): string {
    return valor.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
function cadenaSegura(valor: unknown): string | undefined {
    if (typeof valor !== "string" || pareceCodigo(valor)) return undefined;
    return sinEtiquetas(valor);
}
function esHttps(url: string): boolean {
    return /^https:\/\/[^\s]+$/i.test(url);
}
function valorSeguro(valor: unknown): unknown {
    if (typeof valor === "string") return cadenaSegura(valor);
    if (typeof valor === "number") return Number.isFinite(valor) ? valor : undefined;
    if (typeof valor === "boolean") return valor;
    if (Array.isArray(valor)) return valor.map(valorSeguro).filter((v) => v !== undefined);
    if (typeof valor !== "object" || valor === null) return undefined;
    const salida: Record<string, unknown> = {};
    for (const [clave, v] of Object.entries(valor)) {
        const limpio = valorSeguro(v);
        if (limpio !== undefined) salida[clave] = limpio;
    }
    return salida;
}
function propsPermitidas(tipo: string, bruto: Record<string, unknown>): Record<string, unknown> {
    const salida: Record<string, unknown> = {};
    for (const clave of PROPS_PERMITIDAS[tipo] ?? []) {
        if (!(clave in bruto)) continue;
        const limpio = valorSeguro(bruto[clave]);
        if (limpio !== undefined) salida[clave] = limpio;
    }
    return salida;
}
function noPintable(bloqueId: string, motivo: string): Nodo3D {
    return { tipo: "nopintable", props: {}, hijos: [], motivo, bloqueId };
}
function nodoWidget(id: string, props: Record<string, unknown>): Nodo3D {
    if (props.fuente !== "imagen") return noPintable(id, MOTIVO_SIN_VISTA);
    const params = props.parametros;
    const crudo = params && typeof params === "object" && !Array.isArray(params)
        ? (params as Record<string, unknown>).url ?? (params as Record<string, unknown>).src
        : undefined;
    if (typeof crudo !== "string" || !esHttps(crudo)) return noPintable(id, AVISO_IMAGEN);
    const alt = typeof props.titulo === "string" ? props.titulo : "";
    return { tipo: "imagen", props: { url: crudo, alt }, hijos: [], bloqueId: id };
}
interface Contexto { bloques: number; }
function mapear(bloque: BloqueUi, profundidad: number, ctx: Contexto): Nodo3D {
    const id = typeof bloque.id === "string" ? bloque.id : "";
    if (profundidad > PROFUNDIDAD_MAXIMA) return noPintable(id, AVISO_PROFUNDIDAD);
    ctx.bloques += 1;
    if (ctx.bloques > MAXIMO_BLOQUES) return noPintable(id, AVISO_BLOQUES);
    const bruto = (bloque.props ?? {}) as Record<string, unknown>;
    const tipo = String(bloque.tipo);
    const props = propsPermitidas(tipo, bruto);
    const hijos = Array.isArray(bloque.hijos) ? bloque.hijos.map((h) => mapear(h, profundidad + 1, ctx)) : [];
    switch (tipo) {
        case "panel": return { tipo: "tarjeta", props, hijos, bloqueId: id };
        case "rejilla": return { tipo: props.alineacion === "fila" ? "fila" : "columna", props, hijos, bloqueId: id };
        case "texto":
            if (typeof bruto.contenido === "string") props.contenido = cadenaSegura(bruto.contenido) ?? OMITIDO;
            return { tipo: "texto", props, hijos, bloqueId: id };
        case "lista": return { tipo: "lista", props, hijos, bloqueId: id };
        case "acciones": {
            const acciones = Array.isArray(props.acciones)
                ? props.acciones.filter((a): a is string => typeof a === "string" && a.length > 0)
                : [];
            const botones = acciones.map((a) => ({ tipo: "boton" as const, props: { id: a, etiqueta: a }, hijos: [], bloqueId: a }));
            return { tipo: "fila", props, hijos: [...hijos, ...botones], bloqueId: id };
        }
        case "widget": return nodoWidget(id, props);
        default: return noPintable(id, MOTIVO_SIN_VISTA);
    }
}
export function aEscena3D(spec: UiSpec): Nodo3D {
    const ctx: Contexto = { bloques: 0 };
    const hijos: Nodo3D[] = [];
    let cortado = false;
    for (const bloque of Array.isArray(spec.bloques) ? spec.bloques : []) {
        if (ctx.bloques >= MAXIMO_BLOQUES) { cortado = true; break; }
        hijos.push(mapear(bloque, 1, ctx));
    }
    if (cortado) hijos.push(noPintable("", AVISO_BLOQUES));
    const props: Record<string, unknown> = { superficie: spec.superficie };
    const titulo = cadenaSegura(spec.titulo);
    if (titulo !== undefined && titulo.length > 0) props.titulo = titulo;
    return { tipo: "columna", props, hijos };
}
export function escenaSegura(bruto: unknown): { raiz: Nodo3D | null; problemas: string[] } {
    const { spec, problemas } = validarUiSpec(bruto);
    return { raiz: spec ? aEscena3D(spec) : null, problemas };
}
