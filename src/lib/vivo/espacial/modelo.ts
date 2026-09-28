/**
 * Escena 3D compartida · MODELO (L5 · 2026-09-28).
 * ============================================================================
 * El documento de una escena es DATO, nunca código: primitivas, rótulos, imágenes y modelos GLB
 * por dirección https, luces y un ambiente (cielo + suelo). Todo lo que llega de otra persona
 * (Supabase, broadcast) pasa por `sanearDoc`/`sanearObjeto` antes de tocar la escena: números
 * finitos y acotados, colores #rrggbb, textos cortos sin caracteres de control y direcciones SOLO
 * https (sin credenciales ni `javascript:`/`data:`/`blob:`).
 *
 * Cada objeto lleva su marca `actualizado` (ms, reloj híbrido: nunca retrocede respecto a lo ya
 * visto) y `por` (quién lo tocó, para el desempate determinista). El borrado es LÁPIDA
 * (`borrado: true`), nunca desaparición: si el objeto se esfumara del mapa, la siguiente fusión
 * con alguien que aún lo tuviera lo resucitaría. La fusión vive en `./fusion`.
 *
 * Módulo PURO: sin red, sin DOM, sin reloj (el «ahora» siempre entra como argumento).
 */

export type Vec3 = [number, number, number];

export const TIPOS_OBJETO = [
    "caja",
    "esfera",
    "cilindro",
    "cono",
    "toro",
    "plano",
    "texto",
    "imagen",
    "modelo",
    "luz",
] as const;

export type TipoObjeto = (typeof TIPOS_OBJETO)[number];

export interface MaterialObjeto {
    /** #rrggbb */
    color: string;
    /** 0…1 */
    metalico: number;
    /** 0…1 */
    rugosidad: number;
    /** 0…2 — brillo propio (emisivo del mismo color). */
    emisivo: number;
    /** 0.05…1 */
    opacidad: number;
    alambre: boolean;
}

export interface ObjetoEscena {
    id: string;
    tipo: TipoObjeto;
    nombre: string;
    /** Posición (m). */
    pos: Vec3;
    /** Rotación Euler XYZ (rad). */
    rot: Vec3;
    /** Escala por eje. */
    esc: Vec3;
    material: MaterialObjeto;
    /** Solo `texto`. */
    texto?: string;
    /** Solo `imagen` y `modelo`: dirección https. */
    url?: string;
    /** Solo `luz`: intensidad (0…20) y alcance (m, 0 = infinito). */
    intensidad?: number;
    alcance?: number;
    /** Bloqueado: nadie lo mueve por accidente (se desbloquea desde el inspector). */
    bloqueado?: boolean;
    /** Marca de la última edición (ms, reloj híbrido). */
    actualizado: number;
    /** Quién hizo esa edición (dispositivo:pestaña). */
    por: string;
    /** Lápida. */
    borrado?: boolean;
}

export const CIELOS = ["nebulosa", "amanecer", "mediodia", "atardecer", "noche", "estudio"] as const;
export type IdCielo = (typeof CIELOS)[number];

export interface AmbienteEscena {
    cielo: IdCielo;
    /** Suelo con rejilla visible. */
    suelo: boolean;
    actualizado: number;
    por: string;
}

export interface DocEscena {
    version: 1;
    tipo: "escena3d";
    objetos: Record<string, ObjetoEscena>;
    ambiente: AmbienteEscena;
}

/** Techo de objetos VIVOS: una escena no puede tumbar el móvil más modesto ni el canal. */
export const LIMITE_OBJETOS = 400;
export const LARGO_TEXTO = 280;
export const LARGO_NOMBRE = 60;
export const LARGO_URL = 2048;
const LIMITE_POS = 500;
const LIMITE_ESC = 100;
const MIN_ESC = 0.01;

// ───────────────────────────── Cielos (datos puros) ─────────────────────────────

export interface PresetCielo {
    id: IdCielo;
    etiqueta: string;
    descripcion: string;
    /** Color de fondo/niebla. */
    fondo: string;
    /** Luz hemisférica: cielo, suelo, intensidad. */
    hemi: { cielo: string; suelo: string; intensidad: number };
    /** Luz direccional («sol»): posición, color, intensidad. */
    sol: { pos: Vec3; color: string; intensidad: number };
    /** Usa el cielo físico (`Sky` de drei) con esta posición de sol; null = fondo liso. */
    cieloFisico: Vec3 | null;
    estrellas: boolean;
    /** Color de la rejilla del suelo. */
    rejilla: string;
    /** Color del suelo (disco opaco que da horizonte y recibe sombras). */
    suelo: string;
}

export const PRESETS_CIELO: Record<IdCielo, PresetCielo> = {
    nebulosa: {
        id: "nebulosa",
        etiqueta: "Nebulosa StarSeed",
        descripcion: "Violeta profundo con estrellas",
        fondo: "#0a0718",
        hemi: { cielo: "#7C5CFF", suelo: "#0b1024", intensidad: 0.9 },
        sol: { pos: [6, 10, 4], color: "#cfd8ff", intensidad: 1.4 },
        cieloFisico: null,
        estrellas: true,
        rejilla: "#7C5CFF",
        suelo: "#0d0b1f",
    },
    amanecer: {
        id: "amanecer",
        etiqueta: "Amanecer",
        descripcion: "Luz rasante y cálida",
        fondo: "#f3c9a4",
        hemi: { cielo: "#ffd9b0", suelo: "#3a2a3f", intensidad: 0.8 },
        sol: { pos: [12, 3, -6], color: "#ffb37a", intensidad: 1.8 },
        cieloFisico: [100, 6, -60],
        estrellas: false,
        rejilla: "#FFBF00",
        suelo: "#3b2c33",
    },
    mediodia: {
        id: "mediodia",
        etiqueta: "Mediodía",
        descripcion: "Cielo claro y sombras cortas",
        fondo: "#9cc9ff",
        hemi: { cielo: "#ffffff", suelo: "#5b6b4a", intensidad: 1.1 },
        sol: { pos: [3, 14, 2], color: "#ffffff", intensidad: 2.2 },
        cieloFisico: [20, 100, 10],
        estrellas: false,
        rejilla: "#007FFF",
        suelo: "#3f4a3c",
    },
    atardecer: {
        id: "atardecer",
        etiqueta: "Atardecer",
        descripcion: "Horizonte encendido",
        fondo: "#e08a5a",
        hemi: { cielo: "#ff9e6b", suelo: "#2b1a2e", intensidad: 0.75 },
        sol: { pos: [-12, 2.5, -8], color: "#ff8a4c", intensidad: 1.7 },
        cieloFisico: [-100, 3, -60],
        estrellas: false,
        rejilla: "#DC143C",
        suelo: "#2b1b24",
    },
    noche: {
        id: "noche",
        etiqueta: "Noche estrellada",
        descripcion: "Luna fría y cielo abierto",
        fondo: "#03040c",
        hemi: { cielo: "#3b4a7a", suelo: "#050608", intensidad: 0.45 },
        sol: { pos: [-4, 9, 6], color: "#aebcff", intensidad: 0.7 },
        cieloFisico: null,
        estrellas: true,
        rejilla: "#14B8A6",
        suelo: "#06070d",
    },
    estudio: {
        id: "estudio",
        etiqueta: "Estudio neutro",
        descripcion: "Gris suave para ver formas y colores",
        fondo: "#2a2d36",
        hemi: { cielo: "#ffffff", suelo: "#44464f", intensidad: 1.0 },
        sol: { pos: [5, 8, 6], color: "#ffffff", intensidad: 1.6 },
        cieloFisico: null,
        estrellas: false,
        rejilla: "#9aa0ad",
        suelo: "#34373f",
    },
};

// ───────────────────────────── Paleta ─────────────────────────────

export const PALETA_ESCENA = [
    "#7C5CFF",
    "#007FFF",
    "#10B981",
    "#39FF14",
    "#FFBF00",
    "#DC143C",
    "#14B8A6",
    "#F97316",
    "#EC4899",
    "#F5F5F7",
] as const;

// ───────────────────────────── Saneado ─────────────────────────────

function num(v: unknown, respaldo: number, min: number, max: number): number {
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    if (!Number.isFinite(n)) return respaldo;
    return Math.min(max, Math.max(min, n));
}

function vec3(v: unknown, respaldo: Vec3, min: number, max: number): Vec3 {
    if (!Array.isArray(v) || v.length !== 3) return [...respaldo] as Vec3;
    return [num(v[0], respaldo[0], min, max), num(v[1], respaldo[1], min, max), num(v[2], respaldo[2], min, max)];
}

export function colorValido(v: unknown, respaldo = "#7C5CFF"): string {
    if (typeof v !== "string") return respaldo;
    const t = v.trim();
    if (/^#[0-9a-f]{6}$/i.test(t)) return t.toUpperCase();
    if (/^#[0-9a-f]{3}$/i.test(t)) {
        const [r, g, b] = t.slice(1).split("");
        return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }
    return respaldo;
}

/** Texto de una línea o párrafo corto: sin caracteres de control (salvo saltos en rótulos). */
export function textoLimpio(v: unknown, largo: number, permitirSaltos = false): string {
    if (typeof v !== "string") return "";
    const sinControl = permitirSaltos
        ? v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
        : v.replace(/[\u0000-\u001f\u007f]/g, " ");
    const colapsado = permitirSaltos
        ? sinControl.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n")
        : sinControl.replace(/\s+/g, " ");
    const t = colapsado.trim();
    return t.length > largo ? t.slice(0, largo) : t;
}

/**
 * Solo https, con host, sin credenciales. Devuelve la dirección normalizada o null.
 * (Los modelos e imágenes se piden desde el navegador de cada persona: nada de http en claro.)
 */
export function urlHttpsSegura(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const t = v.trim();
    if (!t || t.length > LARGO_URL || /\s/.test(t)) return null;
    let u: URL;
    try {
        u = new URL(t);
    } catch {
        return null;
    }
    if (u.protocol !== "https:") return null;
    if (!u.hostname || u.username || u.password) return null;
    return u.toString();
}

export function materialPorDefecto(color = "#7C5CFF"): MaterialObjeto {
    return { color, metalico: 0.1, rugosidad: 0.45, emisivo: 0, opacidad: 1, alambre: false };
}

export function sanearMaterial(v: unknown, respaldo: MaterialObjeto = materialPorDefecto()): MaterialObjeto {
    const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
    return {
        color: colorValido(o.color, respaldo.color),
        metalico: num(o.metalico, respaldo.metalico, 0, 1),
        rugosidad: num(o.rugosidad, respaldo.rugosidad, 0, 1),
        emisivo: num(o.emisivo, respaldo.emisivo, 0, 2),
        opacidad: num(o.opacidad, respaldo.opacidad, 0.05, 1),
        alambre: o.alambre === true,
    };
}

function esTipo(v: unknown): v is TipoObjeto {
    return typeof v === "string" && (TIPOS_OBJETO as readonly string[]).includes(v);
}

function idValido(v: unknown): v is string {
    return typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
}

function porValido(v: unknown): string {
    return typeof v === "string" ? textoLimpio(v, 80) : "";
}

/** Lápida mínima: solo lo necesario para ganar la fusión (sin datos que ya no hacen falta). */
export function lapida(id: string, tipo: TipoObjeto, actualizado: number, por: string): ObjetoEscena {
    return {
        id,
        tipo,
        nombre: "",
        pos: [0, 0, 0],
        rot: [0, 0, 0],
        esc: [1, 1, 1],
        material: materialPorDefecto(),
        actualizado,
        por,
        borrado: true,
    };
}

/** Objeto de fuera → objeto válido, o null si no se puede salvar (sin id, tipo o marca). */
export function sanearObjeto(v: unknown): ObjetoEscena | null {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    if (!idValido(o.id) || !esTipo(o.tipo)) return null;
    const actualizado = num(o.actualizado, NaN, 0, Number.MAX_SAFE_INTEGER);
    if (!Number.isFinite(actualizado)) return null;
    const por = porValido(o.por);
    if (o.borrado === true) return lapida(o.id, o.tipo, actualizado, por);

    const obj: ObjetoEscena = {
        id: o.id,
        tipo: o.tipo,
        nombre: textoLimpio(o.nombre, LARGO_NOMBRE) || NOMBRE_TIPO[o.tipo],
        pos: vec3(o.pos, [0, 0, 0], -LIMITE_POS, LIMITE_POS),
        rot: vec3(o.rot, [0, 0, 0], -Math.PI * 4, Math.PI * 4),
        esc: vec3(o.esc, [1, 1, 1], MIN_ESC, LIMITE_ESC),
        material: sanearMaterial(o.material),
        actualizado,
        por,
    };
    if (o.bloqueado === true) obj.bloqueado = true;
    if (o.tipo === "texto") obj.texto = textoLimpio(o.texto, LARGO_TEXTO, true) || "Texto";
    if (o.tipo === "imagen" || o.tipo === "modelo") {
        const url = urlHttpsSegura(o.url);
        if (!url) return null; // una imagen/modelo sin dirección válida no es nada que mostrar
        obj.url = url;
    }
    if (o.tipo === "luz") {
        obj.intensidad = num(o.intensidad, 3, 0, 20);
        obj.alcance = num(o.alcance, 12, 0, 200);
    }
    return obj;
}

function esCielo(v: unknown): v is IdCielo {
    return typeof v === "string" && (CIELOS as readonly string[]).includes(v);
}

export function ambientePorDefecto(): AmbienteEscena {
    return { cielo: "nebulosa", suelo: true, actualizado: 0, por: "" };
}

export function sanearAmbiente(v: unknown): AmbienteEscena {
    const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
    const base = ambientePorDefecto();
    return {
        cielo: esCielo(o.cielo) ? o.cielo : base.cielo,
        suelo: typeof o.suelo === "boolean" ? o.suelo : base.suelo,
        actualizado: num(o.actualizado, 0, 0, Number.MAX_SAFE_INTEGER),
        por: porValido(o.por),
    };
}

export function docVacio(): DocEscena {
    return { version: 1, tipo: "escena3d", objetos: {}, ambiente: ambientePorDefecto() };
}

/** ¿Parece el doc de una escena (y no el de una pizarra o un escritorio)? */
export function esDocEscena(v: unknown): boolean {
    return !!v && typeof v === "object" && (v as Record<string, unknown>).tipo === "escena3d";
}

/**
 * Doc de fuera → doc válido. Los objetos inválidos se descartan uno a uno (nunca tumban la
 * escena entera). Si hay más vivos que el techo, se conservan los más recientes y se dice
 * cuántos quedaron fuera (`descartados`) para avisar con honestidad.
 */
export function sanearDoc(v: unknown): { doc: DocEscena; descartados: number } {
    const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
    const crudos = o.objetos && typeof o.objetos === "object" ? Object.values(o.objetos as Record<string, unknown>) : [];
    const objetos: Record<string, ObjetoEscena> = {};
    let descartados = 0;
    for (const c of crudos) {
        const obj = sanearObjeto(c);
        if (!obj) {
            descartados += 1;
            continue;
        }
        const previo = objetos[obj.id];
        if (!previo || obj.actualizado > previo.actualizado) objetos[obj.id] = obj;
    }
    const vivos = Object.values(objetos).filter((x) => !x.borrado);
    if (vivos.length > LIMITE_OBJETOS) {
        const sobran = vivos.sort((a, b) => b.actualizado - a.actualizado).slice(LIMITE_OBJETOS);
        for (const s of sobran) delete objetos[s.id];
        descartados += sobran.length;
    }
    return { doc: { version: 1, tipo: "escena3d", objetos, ambiente: sanearAmbiente(o.ambiente) }, descartados };
}

export function contarVivos(doc: DocEscena): number {
    let n = 0;
    for (const o of Object.values(doc.objetos)) if (!o.borrado) n += 1;
    return n;
}

/** Objetos vivos en orden estable (por marca y luego id): la lista de la UI no «baila». */
export function objetosVivos(doc: DocEscena): ObjetoEscena[] {
    return Object.values(doc.objetos)
        .filter((o) => !o.borrado)
        .sort((a, b) => a.actualizado - b.actualizado || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// ───────────────────────────── Reloj híbrido y creación ─────────────────────────────

/**
 * Marca de una edición nueva: nunca menor que lo ya visto + 1. Así una edición hecha DESPUÉS de
 * ver la de otra persona gana siempre, aunque el reloj de este dispositivo vaya atrasado.
 */
export function siguienteMarca(ahora: number, maxVisto: number): number {
    const a = Number.isFinite(ahora) ? Math.floor(ahora) : 0;
    const m = Number.isFinite(maxVisto) ? Math.floor(maxVisto) : 0;
    return Math.max(a, m + 1);
}

export const NOMBRE_TIPO: Record<TipoObjeto, string> = {
    caja: "Caja",
    esfera: "Esfera",
    cilindro: "Cilindro",
    cono: "Cono",
    toro: "Toro",
    plano: "Plano",
    texto: "Rótulo",
    imagen: "Imagen",
    modelo: "Modelo 3D",
    luz: "Luz",
};

let secuencia = 0;
export function nuevoIdObjeto(aleatorio: () => number = Math.random): string {
    secuencia = (secuencia + 1) % 1_000_000;
    const r = Math.floor(aleatorio() * 36 ** 6).toString(36).padStart(6, "0");
    return `o_${secuencia.toString(36)}${r}`;
}

export interface OpcionesNuevoObjeto {
    color?: string;
    texto?: string;
    url?: string;
    pos?: Vec3;
    /** Giro sobre el eje vertical (rad): los carteles e imágenes nacen mirando a quien los pone. */
    giroY?: number;
    nombre?: string;
}

/**
 * Objeto nuevo listo para la escena. Las imágenes y modelos exigen una dirección https válida
 * (si no, lanza un Error con el mensaje para la persona).
 */
export function crearObjeto(
    tipo: TipoObjeto,
    opciones: OpcionesNuevoObjeto,
    marca: { actualizado: number; por: string; id?: string },
): ObjetoEscena {
    const color = colorValido(opciones.color, tipo === "luz" ? "#FFBF00" : "#7C5CFF");
    const alturaBase: Record<TipoObjeto, number> = {
        caja: 0.5,
        esfera: 0.5,
        cilindro: 0.5,
        cono: 0.5,
        toro: 0.8,
        plano: 0.01,
        texto: 1.4,
        imagen: 1.3,
        modelo: 0,
        luz: 2.5,
    };
    const obj: ObjetoEscena = {
        id: marca.id ?? nuevoIdObjeto(),
        tipo,
        nombre: textoLimpio(opciones.nombre, LARGO_NOMBRE) || NOMBRE_TIPO[tipo],
        pos: opciones.pos ? vec3(opciones.pos, [0, 0, 0], -LIMITE_POS, LIMITE_POS) : [0, alturaBase[tipo], 0],
        rot: tipo === "plano" ? [-Math.PI / 2, 0, 0] : [0, num(opciones.giroY, 0, -Math.PI * 4, Math.PI * 4), 0],
        esc: tipo === "plano" ? [3, 3, 1] : [1, 1, 1],
        material: materialPorDefecto(color),
        actualizado: marca.actualizado,
        por: marca.por,
    };
    if (tipo === "texto") obj.texto = textoLimpio(opciones.texto, LARGO_TEXTO, true) || "Hola, StarSeed";
    if (tipo === "imagen" || tipo === "modelo") {
        const url = urlHttpsSegura(opciones.url);
        if (!url) throw new Error("Escribe una dirección que empiece por https://");
        obj.url = url;
    }
    if (tipo === "luz") {
        obj.intensidad = 3;
        obj.alcance = 12;
        obj.material = { ...obj.material, emisivo: 1 };
    }
    return obj;
}
