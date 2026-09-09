/**
 * UISPEC · LA INTERFAZ COMO DATO (Ola 307)
 *
 * La IA reescribe la interfaz en tiempo real, pero NUNCA escribiendo código que
 * el OS ejecute: escribe una especificación declarativa con vocabulario cerrado
 * que el OS valida y renderiza. Así el UI es totalmente editable y compartible
 * sin que un paquete ajeno pueda ejecutar nada en la máquina de nadie.
 *
 * Módulo PURO: sin red, sin disco, sin procesos. Nunca lanza excepciones.
 */

/** Vocabulario cerrado de bloques. No existe «script», ni html crudo, ni manejadores con código. */
export type TipoBloque =
    | "panel"
    | "rejilla"
    | "widget"
    | "lista"
    | "texto"
    | "acciones"
    | "embebido";

export type ValorPrimitivo = string | number | boolean;

/** Valor admitido en una prop: primitivo, lista de primitivos o registro plano de primitivos. */
export type ValorProp = ValorPrimitivo | ValorPrimitivo[] | Record<string, ValorPrimitivo>;

export type BloqueUi = {
    tipo: TipoBloque;
    id: string;
    props: Record<string, unknown>;
    hijos?: BloqueUi[];
};

export interface UiSpec {
    version: number;
    superficie: string;
    titulo?: string;
    bloques: BloqueUi[];
    tema?: string;
    meta?: Record<string, string>;
}

/** Profundidad máxima del árbol: impide que un modelo genere una estructura infinita. */
export const PROFUNDIDAD_MAXIMA = 6;

/** Número máximo de bloques en una especificación. */
export const MAXIMO_BLOQUES = 400;

/** Longitud máxima de cualquier cadena de la especificación. */
export const LONGITUD_MAXIMA_CADENA = 4000;

export const TIPOS_BLOQUE: readonly TipoBloque[] = [
    "panel",
    "rejilla",
    "widget",
    "lista",
    "texto",
    "acciones",
    "embebido",
];

/**
 * Props admitidas por cada tipo de bloque. Lo que no esté declarado aquí se
 * descarta al validar: el vocabulario es cerrado por seguridad, no por gusto.
 */
export const PROPS_PERMITIDAS: Record<string, string[]> = {
    panel: ["titulo", "subtitulo", "icono", "variante", "colapsable", "abierto", "ancho"],
    rejilla: ["columnas", "filas", "espacio", "alineacion", "ancho"],
    widget: ["fuente", "titulo", "icono", "altura", "refrescoSegundos", "parametros"],
    lista: ["titulo", "elementos", "icono", "vacio", "ordenable", "maximo"],
    texto: ["contenido", "nivel", "enfasis", "alineacion", "tono"],
    acciones: ["acciones", "alineacion", "tamano"],
    embebido: ["superficie", "ruta", "modo", "altura", "titulo"],
};

/** Cadenas que huelen a código ejecutable. Su sola presencia invalida la especificación. */
const PATRONES_CODIGO: readonly RegExp[] = [
    /<\s*script/i,
    /<\s*iframe/i,
    /javascript\s*:/i,
    /\bon[a-z]+\s*=/i,
    /\beval\s*\(/i,
    /\bnew\s+Function\s*\(/i,
    /data\s*:\s*text\/html/i,
];

/** Ids de bloque y de acción: letras, dígitos y separadores sobrios. */
const PATRON_ID = /^[a-z0-9][a-z0-9._:-]{0,79}$/i;

/** Rutas embebidas: siempre internas al OS, nunca una URL externa. */
const PATRON_RUTA = /^\/[a-z0-9\-_/.]*$/i;

/** ¿Esta cadena parece código en vez de contenido? */
export function pareceCodigo(valor: string): boolean {
    return PATRONES_CODIGO.some((patron) => patron.test(valor));
}

function esObjetoPlano(valor: unknown): valor is Record<string, unknown> {
    return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function esPrimitivo(valor: unknown): valor is ValorPrimitivo {
    return (
        typeof valor === "string" ||
        typeof valor === "boolean" ||
        (typeof valor === "number" && Number.isFinite(valor))
    );
}

interface Contexto {
    problemas: string[];
    ids: Set<string>;
    bloques: number;
    invalida: boolean;
}

function anotar(ctx: Contexto, mensaje: string): void {
    if (!ctx.problemas.includes(mensaje)) ctx.problemas.push(mensaje);
}

function invalidar(ctx: Contexto, mensaje: string): void {
    ctx.invalida = true;
    anotar(ctx, mensaje);
}

/** Depura una cadena: recorta, comprueba longitud y rechaza cualquier cosa que parezca código. */
function depurarCadena(valor: string, donde: string, ctx: Contexto): string | undefined {
    const limpia = valor.trim();
    if (limpia.length > LONGITUD_MAXIMA_CADENA) {
        invalidar(ctx, `Cadena demasiado larga en ${donde} (máximo ${LONGITUD_MAXIMA_CADENA}).`);
        return undefined;
    }
    if (pareceCodigo(limpia)) {
        invalidar(ctx, `Cadena con aspecto de código en ${donde}: la interfaz es dato, no código.`);
        return undefined;
    }
    return limpia;
}

/** Depura el valor de una prop: primitivo, lista de primitivos o registro plano de primitivos. */
function depurarValor(valor: unknown, donde: string, ctx: Contexto): ValorProp | undefined {
    if (typeof valor === "string") return depurarCadena(valor, donde, ctx);
    if (typeof valor === "boolean") return valor;
    if (typeof valor === "number") {
        if (!Number.isFinite(valor)) {
            anotar(ctx, `Número no finito descartado en ${donde}.`);
            return undefined;
        }
        return valor;
    }
    if (Array.isArray(valor)) {
        const lista: ValorPrimitivo[] = [];
        for (const elemento of valor) {
            const depurado = depurarValor(elemento, donde, ctx);
            if (esPrimitivo(depurado)) lista.push(depurado);
            else if (depurado !== undefined) anotar(ctx, `Elemento anidado descartado en ${donde}.`);
        }
        return lista;
    }
    if (esObjetoPlano(valor)) {
        const registro: Record<string, ValorPrimitivo> = {};
        for (const clave of Object.keys(valor)) {
            const depurado = depurarValor(valor[clave], `${donde}.${clave}`, ctx);
            if (esPrimitivo(depurado)) registro[clave] = depurado;
            else if (depurado !== undefined) anotar(ctx, `Valor anidado descartado en ${donde}.${clave}.`);
        }
        return registro;
    }
    anotar(ctx, `Valor de tipo no admitido descartado en ${donde}.`);
    return undefined;
}

/** Aplica las reglas propias de algunos tipos: ids de acción y rutas internas. */
function afinarPorTipo(tipo: TipoBloque, props: Record<string, unknown>, donde: string, ctx: Contexto): void {
    if (tipo === "acciones" && Array.isArray(props.acciones)) {
        const validas = props.acciones.filter(
            (accion) => typeof accion === "string" && PATRON_ID.test(accion),
        );
        if (validas.length !== props.acciones.length) {
            anotar(ctx, `Acciones con identificador inválido descartadas en ${donde}.`);
        }
        props.acciones = validas;
    }
    if (tipo === "embebido" && typeof props.ruta === "string" && !PATRON_RUTA.test(props.ruta)) {
        anotar(ctx, `Ruta no interna descartada en ${donde}: sólo se embeben superficies del OS.`);
        delete props.ruta;
    }
}

/** Valida un bloque y devuelve su versión depurada, o `null` si no se puede salvar. */
function depurarBloque(bruto: unknown, profundidad: number, camino: string, ctx: Contexto): BloqueUi | null {
    if (!esObjetoPlano(bruto)) {
        invalidar(ctx, `Bloque no es un objeto en ${camino}.`);
        return null;
    }
    if (profundidad > PROFUNDIDAD_MAXIMA) {
        invalidar(ctx, `Profundidad excesiva en ${camino}: el máximo es ${PROFUNDIDAD_MAXIMA} niveles.`);
        return null;
    }
    ctx.bloques += 1;
    if (ctx.bloques > MAXIMO_BLOQUES) {
        invalidar(ctx, `Demasiados bloques: el máximo es ${MAXIMO_BLOQUES}.`);
        return null;
    }

    const tipo = bruto.tipo;
    if (typeof tipo !== "string" || !TIPOS_BLOQUE.includes(tipo as TipoBloque)) {
        invalidar(ctx, `Tipo de bloque desconocido en ${camino}: «${String(tipo)}».`);
        return null;
    }
    const tipoBloque = tipo as TipoBloque;

    const id = bruto.id;
    if (typeof id !== "string" || !PATRON_ID.test(id)) {
        invalidar(ctx, `Identificador de bloque inválido en ${camino}: «${String(id)}».`);
        return null;
    }
    if (ctx.ids.has(id)) {
        invalidar(ctx, `Identificador de bloque duplicado: «${id}».`);
        return null;
    }
    ctx.ids.add(id);

    const permitidas = PROPS_PERMITIDAS[tipoBloque] ?? [];
    const propsBrutas = esObjetoPlano(bruto.props) ? bruto.props : {};
    if (bruto.props !== undefined && !esObjetoPlano(bruto.props)) {
        anotar(ctx, `Props no es un objeto en «${id}»: se ignoran.`);
    }
    const props: Record<string, unknown> = {};
    for (const clave of Object.keys(propsBrutas)) {
        if (!permitidas.includes(clave)) {
            anotar(ctx, `Prop no declarada recortada en «${id}»: «${clave}».`);
            continue;
        }
        const depurado = depurarValor(propsBrutas[clave], `${id}.${clave}`, ctx);
        if (depurado !== undefined) props[clave] = depurado;
    }
    afinarPorTipo(tipoBloque, props, `«${id}»`, ctx);

    const bloque: BloqueUi = { tipo: tipoBloque, id, props };

    if (bruto.hijos !== undefined) {
        if (!Array.isArray(bruto.hijos)) {
            anotar(ctx, `Hijos no es una lista en «${id}»: se ignoran.`);
        } else {
            const hijos: BloqueUi[] = [];
            for (const hijo of bruto.hijos) {
                const depurado = depurarBloque(hijo, profundidad + 1, `${camino} > ${id}`, ctx);
                if (depurado) hijos.push(depurado);
            }
            bloque.hijos = hijos;
        }
    }
    return bloque;
}

/** Nombres de superficie: identificadores sobrios del OS, tipo «os:escritorio» o «/salas/3d». */
const PATRON_SUPERFICIE = /^[a-z0-9/][a-z0-9._:\-/]{0,119}$/i;

/**
 * Valida una especificación llegada de cualquier sitio (un modelo, un paquete de
 * la Biblioteca, otro usuario de la malla) y devuelve una copia depurada.
 * Desconfía de todo y NUNCA lanza: si algo no cuadra, `spec` viene a `null`.
 */
export function validarUiSpec(bruto: unknown): { spec: UiSpec | null; problemas: string[] } {
    const ctx: Contexto = { problemas: [], ids: new Set<string>(), bloques: 0, invalida: false };

    if (!esObjetoPlano(bruto)) {
        return { spec: null, problemas: ["La especificación no es un objeto."] };
    }

    const version = bruto.version;
    if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
        invalidar(ctx, "Versión inválida: debe ser un entero mayor o igual que 1.");
    }

    const superficie = typeof bruto.superficie === "string" ? bruto.superficie.trim() : "";
    if (!superficie || !PATRON_SUPERFICIE.test(superficie) || pareceCodigo(superficie)) {
        invalidar(ctx, `Superficie inválida: «${String(bruto.superficie)}».`);
    }

    let titulo: string | undefined;
    if (bruto.titulo !== undefined) {
        if (typeof bruto.titulo !== "string") anotar(ctx, "Título no es una cadena: se ignora.");
        else titulo = depurarCadena(bruto.titulo, "titulo", ctx);
    }

    let tema: string | undefined;
    if (bruto.tema !== undefined) {
        if (typeof bruto.tema !== "string") anotar(ctx, "Tema no es una cadena: se ignora.");
        else tema = depurarCadena(bruto.tema, "tema", ctx);
    }

    let meta: Record<string, string> | undefined;
    if (bruto.meta !== undefined) {
        if (!esObjetoPlano(bruto.meta)) {
            anotar(ctx, "Meta no es un objeto: se ignora.");
        } else {
            meta = {};
            for (const clave of Object.keys(bruto.meta)) {
                const valor = bruto.meta[clave];
                if (typeof valor !== "string") {
                    anotar(ctx, `Meta «${clave}» descartada: sólo se admiten cadenas.`);
                    continue;
                }
                const depurada = depurarCadena(valor, `meta.${clave}`, ctx);
                if (depurada !== undefined) meta[clave] = depurada;
            }
        }
    }

    const bloques: BloqueUi[] = [];
    if (!Array.isArray(bruto.bloques)) {
        invalidar(ctx, "La lista de bloques falta o no es una lista.");
    } else {
        for (const hijo of bruto.bloques) {
            const depurado = depurarBloque(hijo, 1, "raíz", ctx);
            if (depurado) bloques.push(depurado);
        }
    }

    if (ctx.invalida) return { spec: null, problemas: ctx.problemas };

    const spec: UiSpec = { version: version as number, superficie, bloques };
    if (titulo) spec.titulo = titulo;
    if (tema) spec.tema = tema;
    if (meta && Object.keys(meta).length > 0) spec.meta = meta;
    return { spec, problemas: ctx.problemas };
}

/** Serializa de forma estable (claves ordenadas) para comparar props sin falsos positivos. */
function huella(valor: unknown): string {
    if (Array.isArray(valor)) return `[${valor.map(huella).join(",")}]`;
    if (esObjetoPlano(valor)) {
        const claves = Object.keys(valor).sort();
        return `{${claves.map((clave) => `${clave}:${huella(valor[clave])}`).join(",")}}`;
    }
    return JSON.stringify(valor) ?? "null";
}

/** Recorre el árbol y devuelve cada bloque por su id. */
export function aplanarBloques(spec: UiSpec): Map<string, BloqueUi> {
    const mapa = new Map<string, BloqueUi>();
    const pendientes: BloqueUi[] = [...(spec.bloques ?? [])];
    while (pendientes.length > 0) {
        const bloque = pendientes.shift();
        if (!bloque) continue;
        if (!mapa.has(bloque.id)) mapa.set(bloque.id, bloque);
        if (bloque.hijos) pendientes.push(...bloque.hijos);
    }
    return mapa;
}

/**
 * Qué cambia de la especificación `a` a la `b`, por id de bloque.
 * Se le enseña al usuario ANTES de aplicar nada: sin sorpresas.
 */
export function diffUiSpec(
    a: UiSpec,
    b: UiSpec,
): { anadidos: string[]; quitados: string[]; cambiados: string[] } {
    const antes = aplanarBloques(a);
    const despues = aplanarBloques(b);
    const anadidos: string[] = [];
    const quitados: string[] = [];
    const cambiados: string[] = [];

    for (const id of despues.keys()) {
        if (!antes.has(id)) anadidos.push(id);
    }
    for (const [id, bloque] of antes) {
        const nuevo = despues.get(id);
        if (!nuevo) {
            quitados.push(id);
            continue;
        }
        const mismoTipo = bloque.tipo === nuevo.tipo;
        const mismasProps = huella(bloque.props) === huella(nuevo.props);
        const hijosAntes = (bloque.hijos ?? []).map((hijo) => hijo.id).join(",");
        const hijosDespues = (nuevo.hijos ?? []).map((hijo) => hijo.id).join(",");
        if (!mismoTipo || !mismasProps || hijosAntes !== hijosDespues) cambiados.push(id);
    }

    return { anadidos: anadidos.sort(), quitados: quitados.sort(), cambiados: cambiados.sort() };
}

/** Superficies que una especificación declara o embebe. */
export function superficiesDe(spec: UiSpec): string[] {
    const superficies = new Set<string>();
    if (typeof spec.superficie === "string" && spec.superficie) superficies.add(spec.superficie);
    for (const bloque of aplanarBloques(spec).values()) {
        if (bloque.tipo !== "embebido") continue;
        const superficie = bloque.props.superficie;
        if (typeof superficie === "string" && superficie) superficies.add(superficie);
    }
    return [...superficies].sort();
}

/**
 * Superficies presentes en `a` que desaparecen en `b`.
 * Alimenta a `validarContraInvariantes`: una spec que borre una superficie
 * fundamental del OS (identidad, gobernanza, privacidad…) se rechaza.
 */
export function superficiesQuitadas(a: UiSpec, b: UiSpec): string[] {
    const despues = new Set(superficiesDe(b));
    return superficiesDe(a).filter((superficie) => !despues.has(superficie));
}
