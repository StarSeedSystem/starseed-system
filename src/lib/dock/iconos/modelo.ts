/**
 * Diseños de icono del dock (Ola 1025U · V1b) — modelo PURO.
 *
 * Alex: desde el dock, plantillas de iconos para todo el perfil (públicas de la Librería o guardadas
 * en su Biblioteca), el diseño de cada icono por separado, y variaciones con IA. Este módulo es el
 * contrato común de todo eso y no toca React, ni lucide, ni almacenamiento (lo importan tanto la UI
 * como las pruebas y el camino de sincronización):
 *
 *   · `DisenoIcono`   — forma + fondo + glifo + color + brillo (+ borde). Un DATO, nunca código.
 *   · `PlantillaIconos` — nombre, autor, licencia, un diseño por `iconKey` y uno por defecto.
 *   · `PerfilIconos`  — la plantilla que el perfil tiene aplicada (viaja con la cuenta).
 *   · `disenoEfectivo(item, perfil)` — qué diseño pinta un item: el suyo › el de la plantilla para su
 *     `iconKey` › el «por defecto» de la plantilla › ninguno (el icono de siempre).
 *   · `aplicarPlantilla(items, plantilla)` — la pone en el perfil; los diseños sueltos de cada item se
 *     limpian (o se conservan a petición).
 *
 * TODO lo que entra desde fuera (IA, archivo, Librería pública, sincronización) pasa por
 * `normalizarDiseno` / `normalizarPlantilla`: colores solo en hexadecimal, números acotados, glifos de
 * Lucide por clave, SVG por el saneador y la imagen solo como `data:` de mapa de bits con tope. Un
 * diseño no confiable no puede llevar una URL: ni imágenes remotas (rastreo) ni enlaces.
 */

import { MAX_SVG_CARACTERES, sanearSvg } from "./sanear-svg";

/* ─────────────────────────── Tipos ─────────────────────────── */

export const VERSION_DISENO = 1 as const;

export const FORMAS_ICONO = ["circulo", "cuadrado-suave", "gota", "hexagono", "flor", "rombo", "escudo"] as const;
export type FormaIcono = (typeof FORMAS_ICONO)[number];

export const ETIQUETA_FORMA: Record<FormaIcono, string> = {
    circulo: "Círculo",
    "cuadrado-suave": "Cuadrado suave",
    gota: "Gota",
    hexagono: "Hexágono",
    flor: "Flor",
    rombo: "Rombo",
    escudo: "Escudo",
};

export type FondoIcono =
    | { tipo: "color"; color: string }
    | { tipo: "degradado"; desde: string; hasta: string; angulo: number }
    | { tipo: "cristal"; tinte: string; intensidad: number }
    | { tipo: "ninguno" };

export type GlifoIcono =
    /** `clave: "auto"` = el icono de Lucide propio del item del dock. */
    | { tipo: "lucide"; clave: string }
    | { tipo: "svg"; svg: string }
    | { tipo: "imagen"; src: string };

export interface BordeIcono { color: string; ancho: number }

export interface DisenoIcono {
    v: typeof VERSION_DISENO;
    forma: FormaIcono;
    fondo: FondoIcono;
    glifo: GlifoIcono;
    colorGlifo: string;
    /** Tamaño del glifo respecto al icono (0,3–0,9). */
    escala: number;
    /** Resplandor del glifo y del borde interior (0–1). */
    brillo: number;
    borde?: BordeIcono;
    nombre?: string;
    /** De dónde viene: `serie`, `usuario`, `ia`, `libreria`, `biblioteca`… (informativo). */
    origen?: string;
}

export interface PlantillaIconos {
    v: typeof VERSION_DISENO;
    id: string;
    nombre: string;
    descripcion?: string;
    autor: string;
    licencia: string;
    /** Se usa para todo `iconKey` que no tenga diseño propio en `disenos`. */
    porDefecto: DisenoIcono;
    disenos: Record<string, DisenoIcono>;
    etiquetas?: string[];
}

export interface PerfilIconos {
    v: typeof VERSION_DISENO;
    plantilla: PlantillaIconos | null;
    /** Epoch ms del último cambio (informativo). */
    actualizado: number;
}

/** Lo mínimo que necesita este módulo de un item del dock (el tipo fuerte vive en `dock-config.ts`). */
export interface ItemIcono {
    id: string;
    iconKey: string;
    color?: string;
    diseno?: DisenoIcono | null;
}

/* ─────────────────────────── Límites ─────────────────────────── */

export const LIMITES = {
    escalaMin: 0.3,
    escalaMax: 0.9,
    escalaDefecto: 0.56,
    bordeMax: 6,
    /** Imagen del glifo ya reducida: data URL de mapa de bits, en caracteres. */
    imagenMaxCaracteres: 40_000,
    svgMaxCaracteres: MAX_SVG_CARACTERES,
    nombreMax: 60,
    descripcionMax: 240,
    autorMax: 60,
    licenciaMax: 60,
    etiquetasMax: 8,
    disenosPorPlantillaMax: 80,
    /** Una plantilla serializada no pasa de esto (viaja con la cuenta y con la Librería). */
    plantillaMaxBytes: 150_000,
} as const;

export const LICENCIA_DEFECTO = "Libre · uso y remezcla permitidos";
export const AUTOR_DEFECTO = "Anónimo";

/** Matiz del dock actual de cada `DockColor`, para que el editor arranque igual que lo que se ve. */
export const TINTE_DE_COLOR_DOCK: Record<string, string> = {
    neutral: "#94a3b8",
    cyan: "#22d3ee",
    crimson: "#f87171",
    amber: "#fbbf24",
    emerald: "#34d399",
    purple: "#c084fc",
};

/* ─────────────────────────── Utilidades ─────────────────────────── */

const RE_HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RE_CLAVE_LUCIDE = /^[A-Za-z][A-Za-z0-9]{0,40}$/;
const RE_IMAGEN = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
const RE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

function esObjeto(x: unknown): x is Record<string, unknown> {
    return !!x && typeof x === "object" && !Array.isArray(x);
}

function acotar(x: unknown, min: number, max: number, defecto: number): number {
    const n = typeof x === "number" ? x : typeof x === "string" ? parseFloat(x) : NaN;
    if (!Number.isFinite(n)) return defecto;
    return Math.min(max, Math.max(min, n));
}

function texto(x: unknown, max: number): string | undefined {
    if (typeof x !== "string") return undefined;
    // sin caracteres de control ni saltos: es una etiqueta, no un párrafo
    const limpio = x.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
    return limpio || undefined;
}

/** Hexadecimal estricto (se expande #rgb → #rrggbb y se pasa a minúsculas). Cualquier otra cosa: el respaldo. */
export function normalizarColor(x: unknown, respaldo: string): string {
    if (typeof x !== "string") return respaldo;
    const v = x.trim();
    if (!RE_HEX.test(v)) return respaldo;
    const m = v.toLowerCase();
    if (m.length === 4) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
    if (m.length === 5) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}${m[4]}${m[4]}`;
    return m;
}

export function esColorHex(x: unknown): x is string {
    return typeof x === "string" && RE_HEX.test(x.trim());
}

/** Tamaño aproximado (caracteres del JSON) para topes y presupuestos. */
export function estimarBytes(x: unknown): number {
    try { return JSON.stringify(x)?.length ?? 0; } catch { return Number.MAX_SAFE_INTEGER; }
}

/* ─────────────────────────── Diseño base ─────────────────────────── */

/** El diseño de partida: cristal líquido tintado, glifo del propio item. */
export function disenoBase(tinte = "#22d3ee"): DisenoIcono {
    return {
        v: VERSION_DISENO,
        forma: "circulo",
        fondo: { tipo: "cristal", tinte, intensidad: 0.5 },
        glifo: { tipo: "lucide", clave: "auto" },
        colorGlifo: "#ffffff",
        escala: LIMITES.escalaDefecto,
        brillo: 0.25,
        origen: "usuario",
    };
}

/** El diseño que reproduce el aspecto actual de un item (para que el editor empiece donde está el icono). */
export function disenoInicialDeItem(item: Pick<ItemIcono, "iconKey" | "color">): DisenoIcono {
    const tinte = TINTE_DE_COLOR_DOCK[item.color ?? "neutral"] ?? TINTE_DE_COLOR_DOCK.neutral;
    return { ...disenoBase(tinte), colorGlifo: tinte, brillo: 0.15 };
}

/* ─────────────────────────── Normalización (entrada no confiable) ─────────────────────────── */

function normalizarFondo(x: unknown, tinteDefecto: string): FondoIcono {
    if (!esObjeto(x)) return { tipo: "cristal", tinte: tinteDefecto, intensidad: 0.5 };
    switch (x.tipo) {
        case "color":
            return { tipo: "color", color: normalizarColor(x.color, tinteDefecto) };
        case "degradado":
            return {
                tipo: "degradado",
                desde: normalizarColor(x.desde, tinteDefecto),
                hasta: normalizarColor(x.hasta, "#0b1220"),
                angulo: Math.round(acotar(x.angulo, 0, 360, 135)),
            };
        case "cristal":
            return {
                tipo: "cristal",
                tinte: normalizarColor(x.tinte, tinteDefecto),
                intensidad: Math.round(acotar(x.intensidad, 0, 1, 0.5) * 100) / 100,
            };
        case "ninguno":
            return { tipo: "ninguno" };
        default:
            return { tipo: "cristal", tinte: tinteDefecto, intensidad: 0.5 };
    }
}

function normalizarGlifo(x: unknown): GlifoIcono | null {
    if (!esObjeto(x)) return { tipo: "lucide", clave: "auto" };
    switch (x.tipo) {
        case "lucide": {
            const clave = typeof x.clave === "string" ? x.clave.trim() : "auto";
            return { tipo: "lucide", clave: clave === "auto" || RE_CLAVE_LUCIDE.test(clave) ? clave : "auto" };
        }
        case "svg": {
            const r = sanearSvg(x.svg);
            return r.ok ? { tipo: "svg", svg: r.svg } : null;
        }
        case "imagen": {
            const src = typeof x.src === "string" ? x.src.trim() : "";
            if (!src || src.length > LIMITES.imagenMaxCaracteres || !RE_IMAGEN.test(src)) return null;
            return { tipo: "imagen", src };
        }
        default:
            return { tipo: "lucide", clave: "auto" };
    }
}

/**
 * Convierte CUALQUIER cosa en un diseño válido y acotado, o `null` si no hay forma de salvarlo
 * (un glifo SVG que el saneador rechaza, una imagen que no es un `data:` de mapa de bits…).
 * Idempotente: normalizar un diseño ya normalizado lo devuelve igual.
 */
export function normalizarDiseno(entrada: unknown): DisenoIcono | null {
    if (!esObjeto(entrada)) return null;
    const forma = (FORMAS_ICONO as readonly string[]).includes(entrada.forma as string) ? (entrada.forma as FormaIcono) : "circulo";
    const glifo = normalizarGlifo(entrada.glifo);
    if (!glifo) return null;
    const diseno: DisenoIcono = {
        v: VERSION_DISENO,
        forma,
        fondo: normalizarFondo(entrada.fondo, "#22d3ee"),
        glifo,
        colorGlifo: normalizarColor(entrada.colorGlifo, "#ffffff"),
        escala: Math.round(acotar(entrada.escala, LIMITES.escalaMin, LIMITES.escalaMax, LIMITES.escalaDefecto) * 100) / 100,
        brillo: Math.round(acotar(entrada.brillo, 0, 1, 0) * 100) / 100,
    };
    if (esObjeto(entrada.borde)) {
        const ancho = Math.round(acotar(entrada.borde.ancho, 0, LIMITES.bordeMax, 0) * 10) / 10;
        if (ancho > 0) diseno.borde = { color: normalizarColor(entrada.borde.color, "#ffffff"), ancho };
    }
    const nombre = texto(entrada.nombre, LIMITES.nombreMax);
    if (nombre) diseno.nombre = nombre;
    const origen = texto(entrada.origen, 40);
    if (origen) diseno.origen = origen;
    return diseno;
}

/** Los items del dock vienen del almacén (o de la cuenta): se validan una vez por objeto. */
const CACHE_VALIDACION = new WeakMap<object, DisenoIcono | null>();

function validadoConCache(x: unknown): DisenoIcono | null {
    if (!esObjeto(x)) return null;
    if (CACHE_VALIDACION.has(x)) return CACHE_VALIDACION.get(x) ?? null;
    const v = normalizarDiseno(x);
    CACHE_VALIDACION.set(x, v);
    return v;
}

export interface LecturaPlantilla {
    plantilla: PlantillaIconos | null;
    /** Diseños que no se pudieron aceptar (SVG rechazado, presupuesto, demasiados…). */
    omitidos: number;
    motivos: string[];
}

/** Lee una plantilla no confiable. Descarta lo inválido y avisa de cuánto; `null` si no queda nada usable. */
export function leerPlantilla(entrada: unknown): LecturaPlantilla {
    const vacia = (motivo: string): LecturaPlantilla => ({ plantilla: null, omitidos: 0, motivos: [motivo] });
    if (!esObjeto(entrada)) return vacia("No es una plantilla de iconos");
    const motivos: string[] = [];
    let omitidos = 0;

    const nombre = texto(entrada.nombre, LIMITES.nombreMax);
    if (!nombre) return vacia("La plantilla no tiene nombre");
    const porDefecto = normalizarDiseno(entrada.porDefecto);
    if (!porDefecto) return vacia("La plantilla no trae un diseño por defecto válido");

    const idCrudo = typeof entrada.id === "string" ? entrada.id.trim().toLowerCase() : "";
    const id = RE_ID.test(idCrudo) ? idCrudo : crearIdPlantilla(nombre);

    const disenos: Record<string, DisenoIcono> = {};
    let presupuesto = LIMITES.plantillaMaxBytes - estimarBytes(porDefecto) - 600;
    const crudos = esObjeto(entrada.disenos) ? Object.entries(entrada.disenos) : [];
    for (const [clave, d] of crudos) {
        if (!RE_CLAVE_LUCIDE.test(clave)) { omitidos++; continue; }
        if (Object.keys(disenos).length >= LIMITES.disenosPorPlantillaMax) { omitidos++; continue; }
        const v = normalizarDiseno(d);
        if (!v) { omitidos++; continue; }
        const peso = estimarBytes(v) + clave.length + 4;
        if (peso > presupuesto) { omitidos++; continue; }
        presupuesto -= peso;
        disenos[clave] = v;
    }
    if (omitidos) motivos.push(`${omitidos} diseño(s) de la plantilla no se aceptaron (no válidos o fuera del tamaño máximo)`);

    const plantilla: PlantillaIconos = {
        v: VERSION_DISENO,
        id,
        nombre,
        autor: texto(entrada.autor, LIMITES.autorMax) ?? AUTOR_DEFECTO,
        licencia: texto(entrada.licencia, LIMITES.licenciaMax) ?? LICENCIA_DEFECTO,
        porDefecto,
        disenos,
    };
    const descripcion = texto(entrada.descripcion, LIMITES.descripcionMax);
    if (descripcion) plantilla.descripcion = descripcion;
    if (Array.isArray(entrada.etiquetas)) {
        const et = entrada.etiquetas.map((e) => texto(e, 24)).filter((e): e is string => !!e).slice(0, LIMITES.etiquetasMax);
        if (et.length) plantilla.etiquetas = et;
    }
    return { plantilla, omitidos, motivos };
}

export function normalizarPlantilla(entrada: unknown): PlantillaIconos | null {
    return leerPlantilla(entrada).plantilla;
}

export function perfilVacio(ahora = 0): PerfilIconos {
    return { v: VERSION_DISENO, plantilla: null, actualizado: ahora };
}

export function normalizarPerfil(entrada: unknown): PerfilIconos {
    if (!esObjeto(entrada)) return perfilVacio();
    const plantilla = entrada.plantilla == null ? null : normalizarPlantilla(entrada.plantilla);
    const actualizado = typeof entrada.actualizado === "number" && Number.isFinite(entrada.actualizado) ? entrada.actualizado : 0;
    return { v: VERSION_DISENO, plantilla, actualizado };
}

/** Un `id` estable y legible: `nombre-en-minusculas-xxxx`. */
export function crearIdPlantilla(nombre: string, ahora: number = Date.now()): string {
    const base = nombre
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "plantilla";
    return `${base}-${Math.abs(Math.floor(ahora)).toString(36).slice(-5)}`;
}

/* ─────────────────────────── Resolución y aplicación ─────────────────────────── */

const tiene = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * El diseño que se pinta para un item. Orden: el suyo (cambiado a mano) › el de la plantilla del perfil
 * para su `iconKey` › el «por defecto» de la plantilla › `null` (se pinta el icono de siempre).
 */
export function disenoEfectivo(item: ItemIcono, perfil?: PerfilIconos | null): DisenoIcono | null {
    const propio = validadoConCache(item.diseno);
    if (propio) return propio;
    const pl = perfil?.plantilla;
    if (!pl) return null;
    if (tiene(pl.disenos, item.iconKey)) {
        const d = validadoConCache(pl.disenos[item.iconKey]);
        if (d) return d;
    }
    return validadoConCache(pl.porDefecto);
}

/** ¿De dónde sale el diseño efectivo? Para decirlo en el editor («de la plantilla X», «tuyo»). */
export function procedenciaDiseno(item: ItemIcono, perfil?: PerfilIconos | null): "propio" | "plantilla" | "ninguno" {
    if (validadoConCache(item.diseno)) return "propio";
    return disenoEfectivo(item, perfil) ? "plantilla" : "ninguno";
}

export interface ResultadoAplicar<T extends ItemIcono> {
    ok: boolean;
    items: T[];
    perfil: PerfilIconos;
    /** Diseños sueltos de items que se quitaron para que mande la plantilla. */
    limpiados: number;
    /** Diseños sueltos que se conservaron (`conservarManuales`). */
    conservados: number;
    motivo?: string;
}

/**
 * Pone una plantilla en el perfil. Los diseños que el usuario cambió a mano en cada item se limpian
 * (mandan los de la plantilla) salvo `conservarManuales: true`. NO muta: devuelve items nuevos.
 */
export function aplicarPlantilla<T extends ItemIcono>(
    items: readonly T[],
    plantilla: PlantillaIconos,
    opciones: { conservarManuales?: boolean; ahora?: number } = {},
): ResultadoAplicar<T> {
    const p = normalizarPlantilla(plantilla);
    if (!p) {
        return { ok: false, items: [...items], perfil: perfilVacio(), limpiados: 0, conservados: 0, motivo: "La plantilla no es válida." };
    }
    let limpiados = 0;
    let conservados = 0;
    const nuevos = items.map((it) => {
        if (!it.diseno) return it;
        if (opciones.conservarManuales) { conservados++; return it; }
        limpiados++;
        const { diseno: _quitado, ...resto } = it;
        void _quitado;
        return resto as T;
    });
    return {
        ok: true,
        items: nuevos,
        perfil: { v: VERSION_DISENO, plantilla: p, actualizado: opciones.ahora ?? Date.now() },
        limpiados,
        conservados,
    };
}

/** Cambia (o quita, con `null`) el diseño propio de UN item. No muta. */
export function ponerDisenoItem<T extends ItemIcono>(items: readonly T[], itemId: string, diseno: DisenoIcono | null): T[] {
    return items.map((it) => {
        if (it.id !== itemId) return it;
        if (diseno === null) {
            if (!it.diseno) return it;
            const { diseno: _q, ...resto } = it;
            void _q;
            return resto as T;
        }
        return { ...it, diseno };
    });
}

/** Quita el diseño propio de TODOS los items (los vuelve a la plantilla o al icono de siempre). */
export function quitarDisenosPropios<T extends ItemIcono>(items: readonly T[]): { items: T[]; quitados: number } {
    let quitados = 0;
    const nuevos = items.map((it) => {
        if (!it.diseno) return it;
        quitados++;
        const { diseno: _q, ...resto } = it;
        void _q;
        return resto as T;
    });
    return { items: nuevos, quitados };
}

export interface MetaPlantilla { nombre: string; autor?: string; licencia?: string; descripcion?: string; id?: string; ahora?: number }

/**
 * La plantilla que describe el dock tal como está ahora (lo que se ve), para guardarla o compartirla.
 * Solo entran los items que tienen un diseño efectivo; el «por defecto» es el de la plantilla aplicada o,
 * si no hay, el más repetido.
 */
export function plantillaDesdeDock(
    items: readonly ItemIcono[],
    perfil: PerfilIconos | null | undefined,
    meta: MetaPlantilla,
): PlantillaIconos | null {
    const disenos: Record<string, DisenoIcono> = {};
    const cuenta = new Map<string, { d: DisenoIcono; n: number }>();
    for (const it of items) {
        const d = disenoEfectivo(it, perfil);
        if (!d) continue;
        if (!tiene(disenos, it.iconKey)) disenos[it.iconKey] = d;
        const k = JSON.stringify([d.forma, d.fondo, d.colorGlifo, d.brillo, d.escala, d.borde]);
        const c = cuenta.get(k);
        if (c) c.n++; else cuenta.set(k, { d, n: 1 });
    }
    if (!Object.keys(disenos).length) return null;
    const masRepetido = [...cuenta.values()].sort((a, b) => b.n - a.n)[0]?.d;
    const porDefecto = perfil?.plantilla?.porDefecto ?? (masRepetido ? { ...masRepetido, glifo: { tipo: "lucide" as const, clave: "auto" } } : disenoBase());
    return normalizarPlantilla({
        v: VERSION_DISENO,
        id: meta.id ?? crearIdPlantilla(meta.nombre, meta.ahora),
        nombre: meta.nombre,
        descripcion: meta.descripcion,
        autor: meta.autor ?? AUTOR_DEFECTO,
        licencia: meta.licencia ?? LICENCIA_DEFECTO,
        porDefecto,
        disenos,
    });
}

/**
 * Un solo diseño como plantilla de ESTILO: la misma forma, fondo, color y brillo para todos los iconos,
 * cada uno con su propio glifo (`auto`). Un glifo concreto aplicado a todo el dock no tendría sentido.
 */
export function disenoComoPlantilla(diseno: DisenoIcono, meta: MetaPlantilla): PlantillaIconos | null {
    return normalizarPlantilla({
        v: VERSION_DISENO,
        id: meta.id ?? crearIdPlantilla(meta.nombre, meta.ahora),
        nombre: meta.nombre,
        descripcion: meta.descripcion,
        autor: meta.autor ?? AUTOR_DEFECTO,
        licencia: meta.licencia ?? LICENCIA_DEFECTO,
        porDefecto: { ...diseno, glifo: { tipo: "lucide", clave: "auto" } },
        disenos: {},
    });
}

export function disenosIguales(a: DisenoIcono | null | undefined, b: DisenoIcono | null | undefined): boolean {
    if (!a || !b) return a === b || (!a && !b);
    return JSON.stringify(a) === JSON.stringify(b);
}
