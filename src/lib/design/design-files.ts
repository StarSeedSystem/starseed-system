/*
 * design-files — Formato de ARCHIVO DE DISEÑO de StarSeed OS (.ssdesign.json).
 * ---------------------------------------------------------------------------
 * Un `DesignFile` es un envoltorio universal, compartible e instalable, que
 * empaqueta CUALQUIER pieza de personalización del sistema (tema completo,
 * paleta, tipografía, fondo, layout, skin de widget, estilo de componente o de
 * página) como un archivo con metadatos, previsualización y un `payload`
 * aplicable.
 *
 * COHERENCIA (regla de oro): este formato NO reinventa el theming. Se apoya
 * ENTERAMENTE en el contrato congelado `theme-engine.ts` (ThemeTokens/
 * ThemePack + applyThemeTokens/applyTheme/saveCustomTheme/listThemes) y en el
 * mecanismo de tema-por-entidad `entity-layout.ts` (setEntityLayout.themeId,
 * que `useEntityThemeScope` ya aplica en páginas/grupos/comunidades). Aplicar
 * un diseño = exactamente lo mismo que hace el catálogo de temas y el editor
 * "Personalizar" de una página; solo cambia el envoltorio.
 *
 * · Al PERFIL/sistema  → saveCustomTheme(pack) + applyTheme(id)  (durable: el
 *   arranque re-aplica el tema guardado en APPLIED_KEY).
 * · A una PÁGINA/grupo → saveCustomTheme(pack) + saveEntityLayout(ref,{themeId})
 *   (lo que `useEntityThemeScope(layout)` lee y aplica al montar la entidad).
 * · A la BIBLIOTECA    → saveItem(ref,{type:"design",content},folder) (mismo
 *   almacén real de la Librería: entity_state, sin DDL, con realtime).
 */

import {
    applyTheme,
    applyThemeTokens,
    listThemes,
    registerTheme,
    saveCustomTheme,
    type ThemePack,
    type ThemeTokens,
} from "./theme-engine";
import { glassVars, radiusToken, roleVars, type GlassSpec, type H, type RoleSet } from "./theme-catalog";
import { saveEntityLayout } from "@/lib/entity-layout";
import { saveItem, type EntityRef, type SaveItemInput } from "@/lib/library/entity-library";

/* ─────────────────────────────── Tipos ─────────────────────────────── */

/** Naturaleza del diseño — determina qué parte de la UI reescribe su payload. */
export type DesignFileType =
    | "tema-completo"
    | "paleta"
    | "tipografia"
    | "fondo"
    | "layout"
    | "skin-widget"
    | "estilo-componente"
    | "estilo-pagina";

/** Ámbito donde el diseño tiene sentido aplicarse. */
export type DesignScope = "perfil" | "pagina" | "grupo" | "comunidad" | "sistema";

export interface DesignFilePreview {
    /** Muestras hex para la tarjeta (2-4). */
    colors: string[];
    /** Glifo emoji opcional (solo decorativo, nunca sustituye a un icono real). */
    emoji?: string;
}

/**
 * Contenido aplicable. `tokens` es el objetivo canónico (variables CSS que el
 * sistema YA consume) — todo lo demás es opcional y solo se usa si el tipo lo
 * necesita. 1:1 con el contrato theme-engine.ts.
 */
export interface DesignFilePayload {
    /** Objetivo canónico: variables CSS (ThemeTokens). Para "auto"/preview rápido. */
    tokens?: ThemeTokens;
    /** Variantes claro/oscuro/auto completas (temas completos). */
    modes?: ThemePack["modes"];
    /** Parche opcional a AppearanceConfig (apariencia global de la cuenta). */
    appearance?: Record<string, unknown>;
    /** Override por elemento del Estudio (estilo-componente / skin-widget). */
    override?: Record<string, unknown>;
    /** Pistas de maquetación (layout / estilo-pagina). */
    layout?: Record<string, unknown>;
    [k: string]: unknown;
}

export interface DesignFile {
    id: string;
    nombre: string;
    tipo: DesignFileType;
    /** Categoría legible para agrupar en carpetas (temas, paletas, fondos…). */
    categoria: string;
    /** Carpeta sugerida dentro de la Biblioteca (id o nombre lógico). */
    carpeta?: string | null;
    payload: DesignFilePayload;
    /** Ámbitos aplicables. */
    scope: DesignScope[];
    preview: DesignFilePreview;
    version: number;
    autor?: string;
    descripcion?: string;
    /** Corriente estética (cristal, cyberpunk, naturaleza, minimal…). */
    estilo?: string;
    createdAt?: string;
    updatedAt?: string;
}

/** Envoltorio de archivo serializado (.ssdesign.json). */
export interface DesignFileEnvelope {
    kind: typeof SSDESIGN_KIND;
    v: number;
    file: DesignFile;
}

export const SSDESIGN_KIND = "starseed-design" as const;
export const SSDESIGN_VERSION = 1;
export const SSDESIGN_MIME = "application/vnd.starseed.design+json";
/** `type` de SavedItem con el que se persisten en la Librería (sin DDL). */
export const DESIGN_ITEM_TYPE = "design";

export const DESIGN_TYPE_LABEL: Record<DesignFileType, string> = {
    "tema-completo": "Tema completo",
    paleta: "Paleta",
    tipografia: "Tipografía",
    fondo: "Fondo",
    layout: "Layout",
    "skin-widget": "Skin de widget",
    "estilo-componente": "Estilo de componente",
    "estilo-pagina": "Estilo de página",
};

/** Categorías canónicas para las carpetas de la pestaña "Diseños". */
export const DESIGN_CATEGORIES: { id: string; label: string; tipos: DesignFileType[] }[] = [
    { id: "temas", label: "Temas", tipos: ["tema-completo"] },
    { id: "paletas", label: "Paletas", tipos: ["paleta"] },
    { id: "tipografias", label: "Tipografías", tipos: ["tipografia"] },
    { id: "fondos", label: "Fondos", tipos: ["fondo"] },
    { id: "layouts", label: "Layouts", tipos: ["layout"] },
    { id: "skins", label: "Skins de widgets", tipos: ["skin-widget"] },
    { id: "estilos", label: "Estilos de página / perfil", tipos: ["estilo-componente", "estilo-pagina"] },
];

export function categoryForType(tipo: DesignFileType): string {
    return DESIGN_CATEGORIES.find((c) => c.tipos.includes(tipo))?.id ?? "temas";
}

/* ─────────────────────────── Identidad / normalización ─────────────────────────── */

export function makeDesignId(): string {
    return `design_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function asStringArray(v: unknown): string[] {
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Normaliza un objeto no fiable a un DesignFile válido (nunca lanza). */
export function normalizeDesignFile(raw: unknown): DesignFile | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const payload = (r.payload && typeof r.payload === "object" ? r.payload : {}) as DesignFilePayload;
    if (!payload.tokens && !payload.modes && !payload.appearance && !payload.override && !payload.layout) {
        // Sin nada aplicable: no es un DesignFile útil.
        if (typeof r.tipo !== "string") return null;
    }
    const preview = (r.preview && typeof r.preview === "object" ? r.preview : {}) as Record<string, unknown>;
    const tipo = (typeof r.tipo === "string" ? r.tipo : "tema-completo") as DesignFileType;
    const scope = asStringArray(r.scope) as DesignScope[];
    return {
        id: typeof r.id === "string" && r.id ? r.id : makeDesignId(),
        nombre: typeof r.nombre === "string" && r.nombre ? r.nombre : "Diseño sin nombre",
        tipo: tipo in DESIGN_TYPE_LABEL ? tipo : "tema-completo",
        categoria: typeof r.categoria === "string" && r.categoria ? r.categoria : categoryForType(tipo),
        carpeta: typeof r.carpeta === "string" ? r.carpeta : null,
        payload,
        scope: scope.length ? scope : ["perfil", "sistema"],
        preview: { colors: asStringArray(preview.colors), emoji: typeof preview.emoji === "string" ? preview.emoji : undefined },
        version: typeof r.version === "number" ? r.version : 1,
        autor: typeof r.autor === "string" ? r.autor : undefined,
        descripcion: typeof r.descripcion === "string" ? r.descripcion : undefined,
        estilo: typeof r.estilo === "string" ? r.estilo : undefined,
        createdAt: typeof r.createdAt === "string" ? r.createdAt : undefined,
        updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : undefined,
    };
}

/* ─────────────────────── Puente con el contrato theme-engine ─────────────────────── */

/** ThemePack ⇄ DesignFile: la ÚNICA vía de aplicación. Reutiliza el contrato. */
export function designFileToThemePack(file: DesignFile): ThemePack {
    const tokens: ThemeTokens = file.payload.tokens ?? { vars: {} };
    const modes = file.payload.modes && Object.keys(file.payload.modes).length ? file.payload.modes : { auto: tokens };
    return {
        id: file.id,
        name: file.nombre,
        description: file.descripcion ?? "Diseño de StarSeed.",
        style: file.estilo ?? file.categoria ?? "personalizado",
        modes,
        preview: file.preview.colors.length ? { colors: file.preview.colors } : undefined,
        author: file.autor,
        version: file.version,
    };
}

export function themePackToDesignFile(pack: ThemePack, extra?: Partial<DesignFile>): DesignFile {
    const tokens = pack.modes.auto ?? pack.modes.dark ?? pack.modes.light ?? { vars: {} };
    return normalizeDesignFile({
        id: pack.id,
        nombre: pack.name,
        tipo: "tema-completo",
        categoria: "temas",
        payload: { tokens, modes: pack.modes },
        scope: ["perfil", "pagina", "grupo", "comunidad", "sistema"],
        preview: { colors: pack.preview?.colors ?? [] },
        version: pack.version ?? 1,
        autor: pack.author,
        descripcion: pack.description,
        estilo: pack.style,
        ...extra,
    })!;
}

/** Tokens efectivos para previsualizar/aplicar en modo puntual. */
export function resolveDesignTokens(file: DesignFile, mode: "light" | "dark" | "auto" = "auto"): ThemeTokens {
    const m = file.payload.modes;
    if (m) return m[mode] ?? m.auto ?? m.dark ?? m.light ?? file.payload.tokens ?? { vars: {} };
    return file.payload.tokens ?? { vars: {} };
}

/* ─────────────────────────── Exportar / importar ─────────────────────────── */

export function toEnvelope(file: DesignFile): DesignFileEnvelope {
    return { kind: SSDESIGN_KIND, v: SSDESIGN_VERSION, file };
}

export function serializeDesignFile(file: DesignFile): string {
    return JSON.stringify(toEnvelope(file), null, 2);
}

export function exportDesignFile(file: DesignFile): Blob {
    return new Blob([serializeDesignFile(file)], { type: SSDESIGN_MIME });
}

export function designFilename(file: DesignFile): string {
    const base = (file.id || file.nombre || "diseno").replace(/[^\w.-]+/g, "-").toLowerCase();
    return `${base}.ssdesign.json`;
}

/** Descarga el diseño como archivo .ssdesign.json en el dispositivo. */
export function downloadDesignFile(file: DesignFile, filename?: string): void {
    if (typeof document === "undefined") return;
    const url = URL.createObjectURL(exportDesignFile(file));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename ?? designFilename(file);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Coacciona cualquier objeto/JSON conocido a un DesignFile. Interopera con los
 *  formatos ya existentes de la app (temas y elementos del Estudio) y con
 *  ThemePack/ThemeTokens crudos. Nunca lanza. */
export function coerceToDesignFile(data: unknown): DesignFile | null {
    if (!data || typeof data !== "object") return null;
    const d = data as Record<string, unknown>;

    // 1) Nuestro envoltorio .ssdesign.json
    if (d.kind === SSDESIGN_KIND && d.file) return normalizeDesignFile(d.file);

    // 2) Tema oficial .starseed-theme.json → tema-completo
    if (d.kind === "starseed-theme" && d.pack && typeof d.pack === "object") {
        return themePackToDesignFile(d.pack as ThemePack);
    }

    // 3) Elemento del Estudio .starseed-element.json → estilo-componente / skin-widget
    if (d.kind === "starseed-estudio-element" && d.override && typeof d.override === "object") {
        const override = d.override as { tokens?: ThemeTokens };
        const family = typeof d.family === "string" ? d.family : "componente";
        return normalizeDesignFile({
            id: makeDesignId(),
            nombre: typeof d.name === "string" ? d.name : `${family} personalizado`,
            tipo: family === "widget" ? "skin-widget" : "estilo-componente",
            categoria: family === "widget" ? "skins" : "estilos",
            payload: { tokens: override.tokens ?? { vars: {} }, override: override as Record<string, unknown> },
            scope: ["perfil", "sistema"],
            preview: { colors: [] },
            version: 1,
        });
    }

    // 4) DesignFile crudo (tiene payload + tipo)
    if (d.payload && typeof d.payload === "object") return normalizeDesignFile(d);

    // 5) ThemePack crudo (id + modes)
    if (d.id && d.modes && typeof d.modes === "object") return themePackToDesignFile(d as unknown as ThemePack);

    // 6) ThemeTokens crudo (vars) → paleta
    if (d.vars && typeof d.vars === "object") {
        return normalizeDesignFile({
            id: makeDesignId(),
            nombre: "Paleta importada",
            tipo: "paleta",
            categoria: "paletas",
            payload: { tokens: d as unknown as ThemeTokens },
            scope: ["perfil", "sistema"],
            preview: { colors: [] },
            version: 1,
        });
    }

    return null;
}

/** Importa un diseño desde un File del dispositivo, un string JSON o un objeto. */
export async function importDesignFile(input: File | string | Record<string, unknown>): Promise<DesignFile | null> {
    try {
        let data: unknown;
        if (typeof input === "string") {
            data = JSON.parse(input);
        } else if (typeof File !== "undefined" && input instanceof File) {
            data = JSON.parse(await input.text());
        } else {
            data = input;
        }
        return coerceToDesignFile(data);
    } catch {
        return null;
    }
}

/* ─────────────────────────── Aplicar (reusa el sistema) ─────────────────────────── */

export interface ApplyProfileOptions {
    mode?: "light" | "dark" | "auto";
    /** Si false, aplica de forma transitoria (no persiste como tema del sistema). */
    persist?: boolean;
    /** Callback opcional para volcar el parche de AppearanceConfig (desde useAppearance). */
    applyAppearance?: (patch: Record<string, unknown>) => void;
}

/**
 * Aplica el diseño al PERFIL/sistema del usuario. Idéntico a lo que hace el
 * catálogo de temas: guarda el pack como tema personalizado (para que el
 * arranque lo re-aplique) y lo aplica ya. Revertible desde Ajustes → Apariencia.
 */
export function applyDesignToProfile(file: DesignFile, opts: ApplyProfileOptions = {}): boolean {
    const pack = designFileToThemePack(file);
    const mode = opts.mode ?? "auto";
    if (file.payload.appearance && opts.applyAppearance) {
        try { opts.applyAppearance(file.payload.appearance); } catch { /* noop */ }
    }
    if (opts.persist === false) {
        applyThemeTokens(resolveDesignTokens(file, mode));
        return true;
    }
    registerTheme(pack);
    saveCustomTheme(pack);
    return applyTheme(pack.id, mode);
}

/**
 * Aplica el diseño a una ENTIDAD que administras (página/grupo/comunidad, o tu
 * propio perfil como entidad `user`). Reutiliza el tema-por-entidad de
 * `entity-layout.ts`: registra el pack (para que `listThemes()`/
 * `useEntityThemeScope` lo resuelvan) y guarda `themeId` en el layout de la
 * entidad — exactamente lo que hace el editor "Personalizar" de una página.
 */
export async function applyDesignToEntity(file: DesignFile, ref: EntityRef): Promise<void> {
    const pack = designFileToThemePack(file);
    registerTheme(pack);
    saveCustomTheme(pack);
    await saveEntityLayout(ref, { themeId: pack.id, themeMix: null });
}

/** Alias explícito para páginas (requisito literal). */
export async function applyDesignToPage(file: DesignFile, ref: EntityRef): Promise<void> {
    return applyDesignToEntity(file, ref);
}

/* ─────────────────────────── Persistencia en Biblioteca ─────────────────────────── */

/** Construye el SaveItemInput (type:"design") para el almacén real de la Librería. */
export function designToSaveInput(file: DesignFile, folderId?: string | null): SaveItemInput {
    const stamped: DesignFile = { ...file, updatedAt: new Date().toISOString(), createdAt: file.createdAt ?? new Date().toISOString() };
    return {
        type: DESIGN_ITEM_TYPE as SaveItemInput["type"],
        title: file.nombre,
        mime: SSDESIGN_MIME,
        content: serializeDesignFile(stamped),
        tags: ["diseño", file.tipo, file.categoria].filter(Boolean) as string[],
        description: file.descripcion,
        language: "json",
        folderId: folderId ?? undefined,
    };
}

/** Guarda un diseño como ítem de la Biblioteca (localStorage + Supabase + realtime). */
export async function saveDesignToLibrary(
    ref: EntityRef,
    file: DesignFile,
    folderId?: string | null,
): Promise<{ ok: boolean; id: string }> {
    return saveItem(ref, designToSaveInput(file, folderId), folderId ?? file.carpeta ?? null);
}

/** Reconstruye un DesignFile desde un SavedItem (su `content` JSON). */
export function designFromSavedItem(item: { content?: string | null }): DesignFile | null {
    if (!item.content) return null;
    return coerceToDesignFile(safeParse(item.content));
}

function safeParse(s: string): unknown {
    try { return JSON.parse(s); } catch { return null; }
}

/* ─────────────────────────── Set curado (Crystal Liquid Glass / Trinity) ─────────────────────────── */

interface FullSpec {
    id: string;
    nombre: string;
    estilo: string;
    descripcion: string;
    tipo?: DesignFileType;
    categoria?: string;
    light: RoleSet;
    dark: RoleSet;
    radius: number;
    glass?: GlassSpec;
    glassDark?: GlassSpec;
    material?: string;
    background?: string;
    fontFamily?: string;
    motion?: number;
    colors: string[];
    emoji?: string;
    scope?: DesignScope[];
}

function tokensFor(role: RoleSet, radius: number, glass?: GlassSpec, common?: Partial<ThemeTokens>): ThemeTokens {
    return { vars: { ...roleVars(role), radius: radiusToken(radius), ...glassVars(glass) }, ...common };
}

function fullDesign(s: FullSpec): DesignFile {
    const common: Partial<ThemeTokens> = {};
    if (s.material) common.materialClass = s.material;
    if (s.background) common.background = s.background;
    if (s.fontFamily) common.fontFamily = s.fontFamily;
    if (s.motion !== undefined) common.motion = s.motion;
    const light = tokensFor(s.light, s.radius, s.glass, common);
    const dark = tokensFor(s.dark, s.radius, s.glassDark ?? s.glass, common);
    const tipo = s.tipo ?? "tema-completo";
    return {
        id: s.id,
        nombre: s.nombre,
        tipo,
        categoria: s.categoria ?? categoryForType(tipo),
        carpeta: null,
        payload: { tokens: dark, modes: { light, dark } },
        scope: s.scope ?? ["perfil", "pagina", "grupo", "comunidad", "sistema"],
        preview: { colors: s.colors, emoji: s.emoji },
        version: 1,
        autor: "StarSeed Core",
        descripcion: s.descripcion,
        estilo: s.estilo,
    };
}

const V = (h: number, s: number, l: number): H => [h, s, l];

const CURATED_SPECS: FullSpec[] = [
    {
        id: "cristal-aurora", nombre: "Cristal Aurora", estilo: "cristal",
        descripcion: "Vidrio líquido violeta y cian con refracción alta — la identidad Crystal Liquid Glass de StarSeed en su forma más pura.",
        light: { bg: V(260, 40, 97), fg: V(262, 30, 14), primary: V(266, 85, 55), secondary: V(189, 90, 45), accent: V(190, 80, 50), border: V(262, 22, 86) },
        dark: { bg: V(258, 45, 6), fg: V(220, 30, 96), primary: V(272, 90, 72), secondary: V(189, 92, 55), accent: V(190, 80, 55), border: V(265, 30, 22) },
        radius: 1.5, material: "ss-crystal", motion: 1.2,
        glass: { blur: 26, opacity: 0.6, refraction: 0.6, saturation: 155, frost: 0.5, aberration: 1.5, neon: 0.5 },
        colors: ["#8B5CF6", "#06B6D4", "#C084FC"], emoji: "🔮",
    },
    {
        id: "trinity-nexus", nombre: "Trinity Nexus", estilo: "equilibrado",
        descripcion: "Los cuatro ejes Trinity en armonía: Zenith azur, Horizon lima, Logic ámbar y Anchor carmesí sobre base violeta.",
        light: { bg: V(255, 30, 97), fg: V(258, 28, 13), primary: V(210, 100, 50), secondary: V(111, 90, 45), accent: V(45, 100, 50), border: V(258, 20, 86) },
        dark: { bg: V(255, 40, 6), fg: V(220, 28, 96), primary: V(210, 100, 60), secondary: V(111, 85, 52), accent: V(45, 100, 55), border: V(258, 28, 22) },
        radius: 1.25, material: "ss-crystal", motion: 1.1,
        glass: { blur: 22, opacity: 0.62, refraction: 0.5, saturation: 150, neon: 0.6 },
        colors: ["#007FFF", "#39FF14", "#FFBF00"], emoji: "✴️",
    },
    {
        id: "zenith-azure", nombre: "Zenith Azure", estilo: "zenith", tipo: "paleta", categoria: "paletas",
        descripcion: "Paleta del eje Zenith (Norte) — azur eléctrico #007FFF: sabiduría e iluminación de la guía contextual.",
        light: { bg: V(210, 40, 97), fg: V(214, 40, 14), primary: V(210, 100, 50), secondary: V(200, 80, 45), accent: V(190, 85, 48), border: V(210, 30, 85) },
        dark: { bg: V(214, 45, 6), fg: V(205, 30, 96), primary: V(210, 100, 62), secondary: V(200, 85, 55), accent: V(190, 85, 52), border: V(212, 32, 22) },
        radius: 1.25, motion: 1,
        glass: { blur: 20, opacity: 0.62, refraction: 0.45, saturation: 145 },
        colors: ["#007FFF", "#38BDF8", "#0EA5E9"], emoji: "🜂",
    },
    {
        id: "horizon-lime", nombre: "Horizon Lime", estilo: "horizon", tipo: "paleta", categoria: "paletas",
        descripcion: "Paleta del eje Horizon (Oeste) — lima neón #39FF14 y esmeralda: vitalidad y génesis del lienzo de creación.",
        light: { bg: V(120, 35, 97), fg: V(150, 40, 12), primary: V(111, 80, 40), secondary: V(160, 84, 36), accent: V(150, 60, 38), border: V(120, 28, 84) },
        dark: { bg: V(150, 42, 6), fg: V(110, 32, 95), primary: V(111, 85, 52), secondary: V(160, 84, 45), accent: V(150, 60, 46), border: V(150, 30, 20) },
        radius: 1.25, material: "ss-nature", motion: 1.2,
        glass: { blur: 18, opacity: 0.6, refraction: 0.4, saturation: 150, frost: 0.55 },
        colors: ["#39FF14", "#10B981", "#4ADE80"], emoji: "🜁",
    },
    {
        id: "logic-amber", nombre: "Logic Amber", estilo: "logic", tipo: "paleta", categoria: "paletas",
        descripcion: "Paleta del eje Logic (Este) — ámbar solar #FFBF00 y oro bruñido: orden y ejecución del control del sistema.",
        light: { bg: V(45, 45, 96), fg: V(30, 40, 14), primary: V(45, 100, 50), secondary: V(42, 75, 45), accent: V(38, 70, 42), border: V(42, 32, 82) },
        dark: { bg: V(35, 35, 7), fg: V(45, 40, 94), primary: V(45, 100, 58), secondary: V(42, 80, 55), accent: V(38, 75, 50), border: V(38, 30, 22) },
        radius: 1, material: "ss-metal", motion: 0.9,
        glass: { blur: 12, opacity: 0.78, refraction: 0.25, saturation: 130, borderWidth: 1.2 },
        colors: ["#FFBF00", "#D4AF37", "#F59E0B"], emoji: "🜃",
    },
    {
        id: "anchor-crimson", nombre: "Anchor Crimson", estilo: "anchor", tipo: "paleta", categoria: "paletas",
        descripcion: "Paleta del eje Anchor (Sur) — carmesí del sistema #DC143C: estabilidad y acceso raíz del dock Trinity.",
        light: { bg: V(348, 35, 97), fg: V(348, 45, 14), primary: V(348, 83, 47), secondary: V(4, 78, 52), accent: V(340, 70, 45), border: V(348, 28, 85) },
        dark: { bg: V(348, 42, 6), fg: V(350, 30, 96), primary: V(348, 85, 58), secondary: V(4, 82, 58), accent: V(340, 72, 52), border: V(348, 32, 22) },
        radius: 1.25, motion: 1,
        glass: { blur: 18, opacity: 0.64, refraction: 0.4, saturation: 145, neon: 0.4 },
        colors: ["#DC143C", "#F43F5E", "#FB7185"], emoji: "🩸",
    },
    {
        id: "oscuro-profundo", nombre: "Oscuro Profundo", estilo: "oscuro",
        descripcion: "Negro espacial casi absoluto con acentos violeta tenue — mínima fatiga visual, máxima profundidad.",
        light: { bg: V(258, 20, 96), fg: V(258, 25, 12), primary: V(266, 70, 52), secondary: V(250, 40, 45), accent: V(280, 55, 50), border: V(258, 18, 86) },
        dark: { bg: V(260, 45, 3), fg: V(230, 20, 92), primary: V(268, 78, 66), secondary: V(250, 45, 55), accent: V(280, 60, 58), border: V(262, 30, 16) },
        radius: 1.25, material: "ss-crystal", motion: 0.8,
        glass: { blur: 16, opacity: 0.72, refraction: 0.35, saturation: 120 },
        colors: ["#0A0A14", "#7C3AED", "#4C1D95"], emoji: "🌑",
    },
    {
        id: "claro-etereo", nombre: "Claro Etéreo", estilo: "claro",
        descripcion: "Blanco perla iridiscente y vidrio esmerilado suave — ligereza luminosa para trabajar de día.",
        light: { bg: V(220, 40, 99), fg: V(240, 25, 18), card: V(220, 50, 100), primary: V(250, 80, 62), secondary: V(190, 75, 52), accent: V(280, 60, 62), border: V(225, 30, 90) },
        dark: { bg: V(225, 25, 12), fg: V(220, 25, 94), primary: V(250, 82, 70), secondary: V(190, 78, 58), accent: V(280, 62, 66), border: V(225, 22, 26) },
        radius: 1.5, material: "ss-crystal", motion: 1,
        glass: { blur: 24, opacity: 0.5, refraction: 0.55, saturation: 140, frost: 0.6 },
        colors: ["#F5F3FF", "#A78BFA", "#67E8F9"], emoji: "☁️",
    },
    {
        id: "biomimetico", nombre: "Biomimético", estilo: "naturaleza",
        descripcion: "Verdes vivos, savia y luz filtrada por hojas — tecnología que abraza a la biosfera (solarpunk StarSeed).",
        light: { bg: V(110, 35, 97), fg: V(145, 45, 12), primary: V(135, 65, 40), secondary: V(45, 90, 52), accent: V(170, 55, 35), border: V(120, 30, 82) },
        dark: { bg: V(145, 40, 7), fg: V(110, 35, 93), primary: V(135, 62, 52), secondary: V(45, 90, 58), accent: V(170, 58, 46), border: V(145, 30, 20) },
        radius: 1.75, material: "ss-nature", background: "gradiente-aurora", motion: 1.3,
        glass: { blur: 20, opacity: 0.6, refraction: 0.45, saturation: 150, frost: 0.6 },
        colors: ["#22C55E", "#FBBF24", "#0EA5A4"], emoji: "🌿",
    },
    {
        id: "ciberdelico", nombre: "Ciberdélico", estilo: "cyberpunk",
        descripcion: "Neón psicodélico, aberración cromática y aurora en movimiento — expansión de la conciencia hecha interfaz.",
        light: { bg: V(280, 40, 96), fg: V(285, 45, 12), primary: V(300, 90, 55), secondary: V(180, 90, 45), accent: V(45, 95, 52), border: V(285, 30, 85) },
        dark: { bg: V(285, 55, 5), fg: V(300, 30, 96), primary: V(300, 95, 66), secondary: V(180, 92, 55), accent: V(48, 95, 58), border: V(290, 40, 22) },
        radius: 1.25, material: "ss-neon", background: "gradiente-aurora", motion: 1.6,
        glass: { blur: 22, opacity: 0.55, refraction: 0.6, saturation: 175, neon: 1, aberration: 3 },
        colors: ["#E935FF", "#22D3EE", "#FDE047"], emoji: "🌀",
    },
    {
        id: "minimal", nombre: "Minimal", estilo: "minimal",
        descripcion: "Casi sin vidrio ni ruido: superficies planas, tipografía respirada y foco absoluto en el contenido.",
        light: { bg: V(220, 15, 98), fg: V(220, 15, 14), card: V(0, 0, 100), primary: V(222, 20, 24), secondary: V(220, 12, 46), accent: V(210, 60, 48), border: V(220, 14, 88) },
        dark: { bg: V(220, 12, 8), fg: V(220, 12, 94), primary: V(220, 14, 88), secondary: V(220, 10, 60), accent: V(210, 65, 58), border: V(220, 12, 20) },
        radius: 0.6, motion: 0.7,
        glass: { blur: 6, opacity: 0.9, refraction: 0.1, saturation: 105, borderWidth: 1 },
        colors: ["#111827", "#6B7280", "#3B82F6"], emoji: "⬜",
    },
    {
        id: "vidrio-metalico", nombre: "Vidrio Metálico", estilo: "metalico", tipo: "skin-widget", categoria: "skins",
        descripcion: "Skin de widget en metal pulido con barrido especular — bordes definidos y brillo bruñido para los paneles del dashboard.",
        light: { bg: V(215, 15, 94), fg: V(216, 25, 14), primary: V(210, 20, 40), secondary: V(200, 15, 52), accent: V(45, 60, 48), border: V(215, 18, 80) },
        dark: { bg: V(216, 22, 8), fg: V(210, 18, 92), primary: V(205, 18, 72), secondary: V(200, 14, 58), accent: V(45, 65, 55), border: V(215, 20, 24) },
        radius: 0.9, material: "ss-metal", motion: 0.9,
        glass: { blur: 10, opacity: 0.82, refraction: 0.2, saturation: 120, borderWidth: 1.4 },
        colors: ["#C0C7D0", "#8A94A6", "#D4AF37"], emoji: "⚙️",
        scope: ["perfil", "sistema"],
    },
];

/** Tipografía curada (payload solo con fontFamily + escala). */
function typographyDesign(): DesignFile {
    return {
        id: "tipografia-aurora", nombre: "Tipografía Aurora", tipo: "tipografia", categoria: "tipografias", carpeta: null,
        payload: { tokens: { vars: { "font-scale": "1.02" }, fontFamily: "var(--font-outfit, 'Outfit', system-ui, sans-serif)" } },
        scope: ["perfil", "sistema"],
        preview: { colors: ["#8B5CF6", "#F8FAFC"], emoji: "🔤" },
        version: 1, autor: "StarSeed Core", estilo: "editorial",
        descripcion: "Familia Outfit con escala ligeramente ampliada — legibilidad limpia y aire editorial en toda la UI.",
    };
}

/** Fondo curado (payload solo con background id registrado). */
function backgroundDesign(): DesignFile {
    return {
        id: "fondo-nebulosa", nombre: "Fondo Nebulosa", tipo: "fondo", categoria: "fondos", carpeta: null,
        payload: { tokens: { vars: {}, background: "gradiente-aurora", motion: 1.2 } },
        scope: ["perfil", "pagina", "grupo", "comunidad", "sistema"],
        preview: { colors: ["#8B5CF6", "#06B6D4", "#E935FF"], emoji: "🌌" },
        version: 1, autor: "StarSeed Core", estilo: "visionario",
        descripcion: "Aurora iridiscente en deriva perpetua como fondo animado del sistema — puro CSS, ligero.",
    };
}

/** Colección inicial curada (~14 diseños de calidad, coherentes con el design system). */
export const CURATED_DESIGN_FILES: DesignFile[] = [
    ...CURATED_SPECS.map(fullDesign),
    typographyDesign(),
    backgroundDesign(),
];

export function curatedById(id: string): DesignFile | null {
    return CURATED_DESIGN_FILES.find((d) => d.id === id) ?? null;
}

/* ─────────────────────────── Handoff hacia el Estudio ─────────────────────────── */

const STUDIO_HANDOFF_KEY = "starseed.estudio.handoff.v1";

/** Ruta del Estudio para abrir un diseño concreto. */
export function studioHref(id: string): string {
    return `/estudio?design=${encodeURIComponent(id)}`;
}

/** Deja un diseño "en cola" para que el Estudio lo cargue al abrir (cubre los
 *  diseños del usuario, que no están en el catálogo ni en el registro de temas). */
export function stashDesignForStudio(file: DesignFile): void {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(STUDIO_HANDOFF_KEY, serializeDesignFile(file)); } catch { /* lleno */ }
}

/** Lee (y consume) el diseño en cola. Si se pasa `id`, solo devuelve si coincide. */
export function readStashedDesign(id?: string): DesignFile | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = localStorage.getItem(STUDIO_HANDOFF_KEY);
        if (!raw) return null;
        const file = coerceToDesignFile(safeParse(raw));
        if (!file) return null;
        if (id && file.id !== id) return null;
        return file;
    } catch { return null; }
}

export function clearStashedDesign(): void {
    if (typeof window === "undefined") return;
    try { localStorage.removeItem(STUDIO_HANDOFF_KEY); } catch { /* noop */ }
}

/** Resuelve el diseño pedido por el Estudio: id en catálogo/temas, o el handoff. */
export function resolveStudioDesign(id?: string | null): DesignFile | null {
    if (id) {
        const found = findDesignById(id);
        if (found) return found;
    }
    return readStashedDesign(id ?? undefined);
}

/* ─────────────────────────── Capturar estado actual ─────────────────────────── */

const CAPTURE_VAR_KEYS = [
    "background-hsl", "foreground-hsl", "card-hsl", "card-foreground-hsl",
    "popover-hsl", "popover-foreground-hsl", "primary-hsl", "primary-foreground-hsl",
    "primary-rgb", "secondary-hsl", "secondary-foreground-hsl", "accent-hsl",
    "accent-foreground-hsl", "muted-hsl", "muted-foreground-hsl", "destructive-hsl",
    "border-hsl", "input-hsl", "ring-hsl", "radius",
    "glass-blur", "glass-opacity", "glass-refraction", "glass-saturation",
    "glass-frost", "glass-noise", "neon-glow", "glass-aberration", "border-width",
];

/**
 * Captura el estado de personalización ACTUAL como DesignFile exportable. Si hay
 * un tema aplicado (appliedTheme), lo empaqueta tal cual; si no, hace una
 * instantánea de las variables CSS vivas del documento (paleta + cristal).
 */
export function captureCurrentDesign(name = "Mi personalización"): DesignFile {
    if (typeof window !== "undefined") {
        try {
            const applied = JSON.parse(localStorage.getItem("starseed.theme.applied.v1") || "null") as { id?: string } | null;
            if (applied?.id) {
                const pack = listThemes().find((t) => t.id === applied.id);
                if (pack) {
                    const df = themePackToDesignFile(pack, { id: makeDesignId(), nombre: name });
                    return df;
                }
            }
        } catch { /* noop */ }
    }
    const vars: Record<string, string> = {};
    if (typeof document !== "undefined") {
        const root = document.documentElement;
        const cs = getComputedStyle(root);
        for (const k of CAPTURE_VAR_KEYS) {
            const inline = root.style.getPropertyValue(`--${k}`) || cs.getPropertyValue(`--${k}`);
            const v = inline.trim();
            if (v) vars[k] = v;
        }
    }
    const swatch = (k: string) => (vars[k] ? `hsl(${vars[k]})` : undefined);
    return {
        id: makeDesignId(),
        nombre: name,
        tipo: "tema-completo",
        categoria: "temas",
        carpeta: null,
        payload: { tokens: { vars } },
        scope: ["perfil", "pagina", "sistema"],
        preview: { colors: [swatch("primary-hsl"), swatch("secondary-hsl"), swatch("accent-hsl")].filter(Boolean) as string[], emoji: "🎨" },
        version: 1,
        autor: "Yo",
        descripcion: "Instantánea de tu personalización actual, exportada desde Ajustes.",
        estilo: "personalizado",
        createdAt: new Date().toISOString(),
    };
}

/** Diseño resoluble por id: primero el set curado, luego los temas registrados
 *  (builtin + personalizados) — para que /estudio?design=<id> abra cualquiera. */
export function findDesignById(id: string): DesignFile | null {
    const curated = curatedById(id);
    if (curated) return curated;
    try {
        const pack = listThemes().find((t) => t.id === id);
        if (pack) return themePackToDesignFile(pack);
    } catch { /* noop */ }
    return null;
}
