/**
 * UISPEC → ESCENA 3D (XR1010AN · contrato `architecture/starseed-xr.md` §3 b, escalón 2).
 * Cualquier página declarada como `UiSpec` (vocabulario cerrado del núcleo) se pinta sola
 * en el visor: este módulo PURO convierte la especificación en un árbol NEUTRO que
 * `uispec-uikit.tsx` dibuja con uikit. Los manejadores nunca ejecutan código: un botón
 * solo emite el `id` del bloque a un callback. Sin red, disco ni procesos; nunca lanza.
 */
import { MAXIMO_BLOQUES, PROFUNDIDAD_MAXIMA, PROPS_PERMITIDAS, TIPOS_BLOQUE, pareceCodigo, validarUiSpec, type BloqueUi, type UiSpec } from "@/lib/nucleo/ui-spec";

/** Los tipos de nodo que el renderizador 3D sabe dibujar. */
export type TipoNodoEscena =
    | "columna" | "fila" | "texto" | "boton" | "imagen"
    | "lista" | "tarjeta" | "separador" | "nopintable";

export interface NodoEscena {
    tipo: TipoNodoEscena;
    props: Record<string, unknown>;
    hijos: NodoEscena[];
}
/** Motivo uniforme para lo que todavía no tiene vista 3D (§3 b, honestidad). */
export const MOTIVO_NOPINTABLE = "Este bloque aún no tiene vista 3D";
const OMITIDO = "[contenido omitido]";
/** Limpia un texto: recorta, corta a 2000 y disfraza lo que huele a código. */
export function textoSeguro(valor: string, maximo = 2000): string {
    const limpio = valor.trim();
    if (pareceCodigo(limpio)) return OMITIDO;
    if (limpio.length <= maximo) return limpio;
    return `${limpio.slice(0, maximo)}…`;
}
/** Solo `https` y sin huecos; cualquier otra URL no es una imagen que se dibuje. */
export function urlImagenSegura(valor: string): boolean {
    return /^https:\/\/[^\s]+$/i.test(valor) && !pareceCodigo(valor);
}

/** Convierte una especificación en árbol 3D: valida, mapea y explica avisos. */
export function aEscena3D(bruto: unknown): { raiz: NodoEscena | null; avisos: string[] } {
    const { spec, problemas } = validarUiSpec(bruto);
    if (!spec) return { raiz: null, avisos: problemas.length > 0 ? problemas : ["La página no es una especificación válida."] };
    const avisos: string[] = [];
    return { raiz: arbolDe(spec, avisos), avisos };
}
interface Recorrido { avisos: string[]; bloques: number }
/** Solo pasan las PROPS_PERMITIDAS (el vocabulario es cerrado por seguridad). */
function recogerprops(bloque: BloqueUi, usar: string[]): Record<string, unknown> {
    const permitidas = new Set(PROPS_PERMITIDAS[bloque.tipo] ?? []);
    const props: Record<string, unknown> = {};
    for (const clave of usar) {
        const valor = bloque.props[clave];
        if (!permitidas.has(clave)) continue;
        else if (typeof valor === "boolean") props[clave] = valor;
        else if (typeof valor === "number" && Number.isFinite(valor)) props[clave] = valor;
        else if (typeof valor === "string") props[clave] = textoSeguro(valor);
    }
    return props;
}
/** Mapea una especificación YA VÁLIDA con los límites propios del visor. */
export function arbolDe(spec: UiSpec, avisos: string[] = []): NodoEscena {
    const recorrido: Recorrido = { avisos, bloques: 0 };
    const hijos: NodoEscena[] = [];
    if (typeof spec.titulo === "string" && spec.titulo.trim() !== "") {
        hijos.push({ tipo: "texto", props: { nivel: 1, contenido: textoSeguro(spec.titulo, 200) }, hijos: [] });
    }
    for (const bloque of spec.bloques) hijos.push(bloqueANodo(bloque, 1, recorrido));
    return { tipo: "columna", props: {}, hijos };
}
/** Devuelve un nodo que no se pinta y dice por qué. */
const nopintable = (motivo: string): NodoEscena => ({ tipo: "nopintable", props: { motivo }, hijos: [] });
/** Recorre los hijos con los contadores del recorrido. */
const hijosDe = (bloque: BloqueUi, prof: number, recorrido: Recorrido): NodoEscena[] =>
    (bloque.hijos ?? []).map((hijo) => bloqueANodo(hijo, prof + 1, recorrido));
/** `panel` → `tarjeta`; el icono solo se dibuja si es una imagen `https`. */
function tarjetaDe(bloque: BloqueUi, prof: number, recorrido: Recorrido): NodoEscena {
    const hijos = hijosDe(bloque, prof, recorrido);
    const icono = bloque.props.icono;
    if (typeof icono === "string" && urlImagenSegura(icono)) hijos.push({ tipo: "imagen", props: { url: icono }, hijos: [] });
    return { tipo: "tarjeta", props: recogerprops(bloque, ["titulo", "subtitulo"]), hijos };
}
/** `lista` → `lista` con cada elemento saneado. */
function propsDeLista(bloque: BloqueUi): Record<string, unknown> {
    const props = recogerprops(bloque, ["titulo", "vacio", "maximo"]);
    const elementos = bloque.props.elementos;
    if (Array.isArray(elementos)) props.elementos = elementos.filter((e): e is string => typeof e === "string").map((e) => textoSeguro(e, 300));
    return props;
}
/** `acciones` → una `fila` de `boton`; cada botón SOLO emite el id de su bloque. */
function botonesDe(bloque: BloqueUi): NodoEscena[] {
    const acciones = bloque.props.acciones;
    if (!Array.isArray(acciones)) return [];
    return acciones
        .filter((a): a is string => typeof a === "string")
        .map((accion) => ({ tipo: "boton", props: { etiqueta: textoSeguro(accion, 60), accion, bloque: bloque.id }, hijos: [] }));
}

/** Un bloque del vocabulario cerrado → nodo neutro (o `nopintable` honesto). */
export function bloqueANodo(bloque: BloqueUi, prof: number, recorrido: Recorrido = { avisos: [], bloques: 0 }): NodoEscena {
    if (!bloque) return nopintable(MOTIVO_NOPINTABLE);
    recorrido.bloques += 1;
    if (recorrido.bloques > MAXIMO_BLOQUES) {
        if (recorrido.bloques === MAXIMO_BLOQUES + 1) recorrido.avisos.push(`Se cortaron bloques: el visor muestra el máximo de ${MAXIMO_BLOQUES}.`);
        return nopintable("Este bloque no se muestra: la página supera el máximo de bloques.");
    }
    if (prof > PROFUNDIDAD_MAXIMA) return nopintable(`Este bloque no se muestra: supera la profundidad máxima (${PROFUNDIDAD_MAXIMA}).`);
    if (typeof bloque.tipo !== "string" || !TIPOS_BLOQUE.includes(bloque.tipo as BloqueUi["tipo"])) return nopintable(MOTIVO_NOPINTABLE);
    switch (bloque.tipo) {
        case "panel":
            return tarjetaDe(bloque, prof, recorrido);
        case "rejilla":
            return { tipo: "fila", props: recogerprops(bloque, ["columnas"]), hijos: hijosDe(bloque, prof, recorrido) };
        case "lista":
            return { tipo: "lista", props: propsDeLista(bloque), hijos: [] };
        case "texto":
            return { tipo: "texto", props: recogerprops(bloque, ["contenido", "nivel", "tono", "enfasis"]), hijos: [] };
        case "acciones":
            return { tipo: "fila", props: recogerprops(bloque, ["alineacion"]), hijos: botonesDe(bloque) };
        default:
            // `widget` (datos en vivo) y `embebido` (superficie 2D en marcha): aún sin vista 3D.
            return nopintable(MOTIVO_NOPINTABLE);
    }
}
