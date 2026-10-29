/**
 * StarSeed XR · UiSpec → escena 3D neutra (XR1010AN · contrato §3 b, escalón 2).
 * Traduce el vocabulario cerrado del núcleo a un árbol que uikit recorre sin ejecutar nada.
 * PURO y sin colores: los tokens viven en `uispec-uikit.tsx`. Nunca lanza; descarta props no
 * declaradas, texto con forma de código y URLs que no sean https.
 */
import {
    LONGITUD_MAXIMA_CADENA, MAXIMO_BLOQUES, PROFUNDIDAD_MAXIMA, PROPS_PERMITIDAS,
    pareceCodigo, validarUiSpec, type BloqueUi, type UiSpec,
} from "../../../lib/nucleo/ui-spec";
export const TIPOS_NODO = ["columna", "fila", "texto", "boton", "imagen", "lista", "tarjeta", "separador", "nopintable"] as const;
export type TipoNodo = (typeof TIPOS_NODO)[number];
export interface Nodo { tipo: TipoNodo; props: Record<string, unknown>; hijos: Nodo[] }
export interface ResultadoEscena3D { arbol: Nodo[]; avisos: string[] }
export interface ResultadoValidado { arbol: Nodo[] | null; problemas: string[]; avisos: string[]; spec: UiSpec | null }
export const MOTIVO_SIN_VISTA = "Este bloque aún no tiene vista 3D";
const OMITIDO = "[contenido omitido]";
const CAMPOS_TEXTO = new Set(["titulo", "subtitulo", "contenido", "vacio", "elementos", "icono", "variante", "alineacion", "tono", "enfasis", "alt"]);
const PATRON_IMAGEN = /^https:\/\/[^\s<>"']+\.(png|jpe?g|webp|gif|avif|svg)(\?[^\s<>"']*)?$/i;
const PATRON_ACCION = /^[a-z0-9][a-z0-9._:-]{0,79}$/i;
const esObjetoPlano = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);
/** Texto visible: sin etiquetas HTML y sin nada con forma de código. */
export function limpiarTexto(valor: string): string {
    if (pareceCodigo(valor)) return OMITIDO;
    return valor.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, LONGITUD_MAXIMA_CADENA);
}
/** Solo una URL de imagen https, sin espacios ni formas de código; cualquier otra se descarta. */
export function urlImagenSegura(valor: unknown): string | null {
    if (typeof valor !== "string") return null;
    const url = valor.trim();
    if (url.length > 2048 || pareceCodigo(url)) return null;
    return PATRON_IMAGEN.test(url) ? url : null;
}
function sanearValor(clave: string, valor: unknown): unknown {
    if (typeof valor === "string") {
        if (CAMPOS_TEXTO.has(clave)) return limpiarTexto(valor);
        return pareceCodigo(valor) ? OMITIDO : valor.slice(0, LONGITUD_MAXIMA_CADENA);
    }
    if (typeof valor === "number") return Number.isFinite(valor) ? valor : undefined;
    if (typeof valor === "boolean") return valor;
    if (Array.isArray(valor)) return valor.map((v) => sanearValor(clave, v)).filter((v) => v !== undefined);
    if (esObjetoPlano(valor)) {
        const registro: Record<string, unknown> = {};
        for (const k of Object.keys(valor)) {
            const v = sanearValor(k, valor[k]);
            if (v !== undefined) registro[k] = v;
        }
        return registro;
    }
    return undefined;
}

/** Solo las props declaradas en `PROPS_PERMITIDAS[tipo]`; el resto se anota y se tira. */
function propsPermitidas(b: BloqueUi, avisos: string[]): Record<string, unknown> {
    const permitidas = PROPS_PERMITIDAS[b.tipo] ?? [];
    const salida: Record<string, unknown> = {};
    for (const clave of Object.keys(b.props ?? {})) {
        if (!permitidas.includes(clave)) { avisos.push(`Prop «${clave}» descartada en «${b.id}»: no está permitida.`); continue; }
        const valor = sanearValor(clave, b.props[clave]);
        if (valor !== undefined) salida[clave] = valor;
    }
    return salida;
}

interface Ctx { avisos: string[]; bloques: number }
const nopintable = (b: BloqueUi): Nodo => ({ tipo: "nopintable", props: { motivo: MOTIVO_SIN_VISTA, bloque: b.tipo }, hijos: [] });

function mapear(b: BloqueUi, profundidad: number, ctx: Ctx): Nodo[] {
    if (profundidad > PROFUNDIDAD_MAXIMA) {
        ctx.avisos.push(`Profundidad máxima (${PROFUNDIDAD_MAXIMA}) alcanzada en «${b.id}»: se corta.`);
        return [];
    }
    if (ctx.bloques >= MAXIMO_BLOQUES) {
        const aviso = `Máximo de ${MAXIMO_BLOQUES} bloques: se ignoran los restantes.`;
        if (!ctx.avisos.includes(aviso)) ctx.avisos.push(aviso);
        return [];
    }
    ctx.bloques += 1;
    const props = propsPermitidas(b, ctx.avisos);
    const hijos = (b.hijos ?? []).flatMap((h) => mapear(h, profundidad + 1, ctx));
    switch (b.tipo as string) {
        case "panel":
            return [props.variante === "separador" ? { tipo: "separador", props: {}, hijos: [] } : { tipo: "tarjeta", props, hijos }];
        case "rejilla":
            return [{ tipo: typeof props.columnas === "number" && props.columnas <= 1 ? "columna" : "fila", props, hijos }];
        case "texto":
            return [{ tipo: "texto", props, hijos }];
        case "acciones": {
            const acciones = Array.isArray(props.acciones)
                ? props.acciones.filter((a): a is string => typeof a === "string" && PATRON_ACCION.test(a))
                : [];
            const botones: Nodo[] = acciones.map((accion) => ({ tipo: "boton", props: { accion, etiqueta: accion }, hijos: [] }));
            return [{ tipo: "fila", props: { alineacion: props.alineacion, tamano: props.tamano }, hijos: botones }];
        }
        case "lista":
            return [{ tipo: "lista", props, hijos }];
        case "widget": {
            const src = urlImagenSegura(props.fuente);
            return [src ? { tipo: "imagen", props: { src, alt: typeof props.titulo === "string" ? props.titulo : "Imagen" }, hijos: [] } : nopintable(b)];
        }
        case "embebido":
        default:
            return [nopintable(b)];
    }
}

/** Traduce una spec ya construida; si se pasa algo sin validar, las guardas siguen actuando. */
export function aEscena3D(spec: UiSpec): ResultadoEscena3D {
    const ctx: Ctx = { avisos: [], bloques: 0 };
    return { arbol: (Array.isArray(spec.bloques) ? spec.bloques : []).flatMap((b) => mapear(b, 1, ctx)), avisos: ctx.avisos };
}

/** Valida primero (vocabulario cerrado del núcleo) y sólo entonces traduce. */
export function escena3DDesde(bruto: unknown): ResultadoValidado {
    const { spec, problemas } = validarUiSpec(bruto);
    if (!spec) return { arbol: null, problemas, avisos: [], spec: null };
    const r = aEscena3D(spec);
    return { arbol: r.arbol, problemas, avisos: r.avisos, spec };
}
