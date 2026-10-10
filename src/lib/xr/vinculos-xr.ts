/**
 * StarSeed XR · VÍNCULOS DE ENTRADA. Qué hace cada botón, gesto, tecla o frase dentro del visor y cómo se
 * reconfigura sin dejar a nadie atrapado. Los mandos exponen el gamepad `xr-standard` (botón 0 gatillo, 1
 * empuñadura, 3 stick pulsado, 4 A/X, 5 B/Y; ejes 2 y 3 = stick); los botones del sistema (menú / logo) NO
 * llegan a la página. Los gatillos de mando se traducen a `FuenteControl` de la Protomolécula
 * (`vinculos-control.ts`): así el mismo «aprender» y las mismas curvas sirven en el visor (índice 0 = mano
 * izquierda, 1 = derecha). Módulo PURO.
 */
import type { EntradaXR, Mano } from "./tipos";

export const ACCIONES_XR = [
    "seleccionar", "agarrar", "menu-mano", "abrir-dock", "recentrar", "salir", "hablar", "teletransporte", "giro-izquierda", "giro-derecha", "atras",
] as const;
export type AccionXR = (typeof ACCIONES_XR)[number];

export const GESTOS = ["pellizco", "pellizco-doble", "palma-a-la-cara", "puno-cerrado", "tocar-muneca", "pellizco-palma"] as const;
export type Gesto = (typeof GESTOS)[number];

export type Gatillo =
    | { tipo: "boton"; indice: number; mano: Mano }
    | { tipo: "eje"; indice: number; direccion: "+" | "-"; mano: Mano }
    | { tipo: "gesto"; gesto: Gesto; mano: Mano | "cualquiera" }
    | { tipo: "tecla"; codigo: string }
    | { tipo: "frase"; texto: string };

export type MapaEntrada = Partial<Record<AccionXR, Gatillo[]>>;

/** Gestos que el sistema del visor se queda (Quest: el pellizco con la palma hacia ti abre su menú). */
export const GESTOS_RESERVADOS: readonly Gesto[] = ["pellizco-palma"];
/** Acciones sin las que alguien queda atrapado: siempre tienen al menos un gatillo. */
export const ACCIONES_OBLIGATORIAS: readonly AccionXR[] = ["salir", "menu-mano"];

const b = (indice: number, mano: Mano): Gatillo => ({ tipo: "boton", indice, mano });
const e = (indice: number, direccion: "+" | "-", mano: Mano): Gatillo => ({ tipo: "eje", indice, direccion, mano });

export const MAPAS_DEFECTO: Record<EntradaXR, MapaEntrada> = {
    mandos: {
        seleccionar: [b(0, "derecha"), b(0, "izquierda")], agarrar: [b(1, "derecha"), b(1, "izquierda")], "menu-mano": [b(4, "izquierda")],
        "abrir-dock": [b(5, "izquierda")], recentrar: [b(3, "derecha")], salir: [b(5, "derecha")], hablar: [b(4, "derecha")],
        teletransporte: [e(3, "-", "derecha")], "giro-izquierda": [e(2, "-", "derecha")], "giro-derecha": [e(2, "+", "derecha")], atras: [b(3, "izquierda")],
    },
    manos: {
        seleccionar: [{ tipo: "gesto", gesto: "pellizco", mano: "cualquiera" }], agarrar: [{ tipo: "gesto", gesto: "puno-cerrado", mano: "cualquiera" }],
        "menu-mano": [{ tipo: "gesto", gesto: "palma-a-la-cara", mano: "izquierda" }], "abrir-dock": [{ tipo: "gesto", gesto: "tocar-muneca", mano: "derecha" }],
        recentrar: [{ tipo: "gesto", gesto: "pellizco-doble", mano: "izquierda" }], salir: [{ tipo: "frase", texto: "salir" }, { tipo: "gesto", gesto: "tocar-muneca", mano: "izquierda" }],
    },
    "mirada-pellizco": {
        seleccionar: [{ tipo: "gesto", gesto: "pellizco", mano: "cualquiera" }], agarrar: [{ tipo: "gesto", gesto: "pellizco-doble", mano: "cualquiera" }],
        "menu-mano": [{ tipo: "gesto", gesto: "palma-a-la-cara", mano: "izquierda" }], salir: [{ tipo: "frase", texto: "salir" }, { tipo: "gesto", gesto: "tocar-muneca", mano: "izquierda" }],
    },
    "teclado-raton": {
        seleccionar: [{ tipo: "tecla", codigo: "Enter" }], "menu-mano": [{ tipo: "tecla", codigo: "KeyM" }], "abrir-dock": [{ tipo: "tecla", codigo: "KeyD" }],
        recentrar: [{ tipo: "tecla", codigo: "KeyC" }], salir: [{ tipo: "tecla", codigo: "Escape" }], hablar: [{ tipo: "tecla", codigo: "Space" }], atras: [{ tipo: "tecla", codigo: "Backspace" }],
    },
    gamepad: {
        seleccionar: [b(0, "derecha")], agarrar: [b(5, "derecha")], "menu-mano": [b(3, "izquierda")], "abrir-dock": [b(2, "izquierda")],
        recentrar: [b(9, "derecha")], salir: [b(8, "derecha")], hablar: [b(1, "derecha")], atras: [b(1, "izquierda")],
    },
    tactil: { seleccionar: [{ tipo: "frase", texto: "toque" }], "menu-mano": [{ tipo: "frase", texto: "toque-largo" }], salir: [{ tipo: "frase", texto: "salir" }] },
    voz: { salir: [{ tipo: "frase", texto: "salir" }], recentrar: [{ tipo: "frase", texto: "recentra" }], "menu-mano": [{ tipo: "frase", texto: "abre el menú" }], hablar: [{ tipo: "frase", texto: "astraura" }] },
};

const TIPOS_POR_ENTRADA: Record<EntradaXR, Gatillo["tipo"][]> = {
    mandos: ["boton", "eje", "frase"], manos: ["gesto", "frase"], "mirada-pellizco": ["gesto", "frase"], "teclado-raton": ["tecla", "frase"],
    gamepad: ["boton", "eje", "frase"], tactil: ["frase"], voz: ["frase"],
};

export const claveGatillo = (g: Gatillo): string =>
    g.tipo === "boton" ? `boton:${g.mano}:${g.indice}` : g.tipo === "eje" ? `eje:${g.mano}:${g.indice}${g.direccion}` : g.tipo === "gesto" ? `gesto:${g.mano}:${g.gesto}` : g.tipo === "tecla" ? `tecla:${g.codigo}` : `frase:${g.texto.toLowerCase()}`;

export function validarMapa(entrada: EntradaXR, mapa: MapaEntrada): { ok: boolean; problemas: string[] } {
    const problemas: string[] = [];
    const usados = new Map<string, AccionXR>();
    for (const a of ACCIONES_XR) {
        for (const g of mapa[a] ?? []) {
            if (!TIPOS_POR_ENTRADA[entrada].includes(g.tipo)) problemas.push(`«${a}»: un gatillo de tipo ${g.tipo} no existe con ${entrada}.`);
            if (g.tipo === "gesto" && GESTOS_RESERVADOS.includes(g.gesto)) problemas.push(`«${a}»: el gesto ${g.gesto} es del sistema del visor y no se puede reasignar.`);
            if (g.tipo === "boton" && (!Number.isInteger(g.indice) || g.indice < 0 || g.indice > 9)) problemas.push(`«${a}»: el botón ${g.indice} no existe (0 a 9).`);
            const k = claveGatillo(g);
            const previa = usados.get(k);
            if (previa && previa !== a) problemas.push(`«${a}» y «${previa}» usan el mismo gatillo (${k}).`);
            usados.set(k, a);
        }
    }
    for (const a of ACCIONES_OBLIGATORIAS) if (!(mapa[a]?.length)) problemas.push(`Falta un gatillo para «${a}»: sin él alguien podría quedar atrapado.`);
    return { ok: problemas.length === 0, problemas };
}

/** Asigna un gatillo a una acción. Si otra acción lo tenía, se le quita y se dice cuál (nunca en silencio). */
export function asignar(mapa: MapaEntrada, accion: AccionXR, g: Gatillo): { mapa: MapaEntrada; desplazada: AccionXR | null } {
    const k = claveGatillo(g);
    const nuevo: MapaEntrada = {};
    let desplazada: AccionXR | null = null;
    for (const a of ACCIONES_XR) {
        const resto = (mapa[a] ?? []).filter((x) => a === accion || claveGatillo(x) !== k);
        if (a !== accion && resto.length !== (mapa[a] ?? []).length) desplazada = a;
        if (resto.length) nuevo[a] = resto;
    }
    nuevo[accion] = [g, ...(nuevo[accion] ?? []).filter((x) => claveGatillo(x) !== k)];
    return { mapa: nuevo, desplazada };
}

/** Forma que entiende `FuenteControl` (gamepad) de la Protomolécula; `null` si el gatillo no es de mando. */
export type FuenteGamepadXR = { tipo: "gamepad"; control: "eje" | "boton"; numero: number; indice: number };
export function gatilloAFuente(g: Gatillo): FuenteGamepadXR | null {
    if (g.tipo === "boton") return { tipo: "gamepad", control: "boton", numero: g.indice, indice: g.mano === "izquierda" ? 0 : 1 };
    if (g.tipo === "eje") return { tipo: "gamepad", control: "eje", numero: g.indice, indice: g.mano === "izquierda" ? 0 : 1 };
    return null;
}
