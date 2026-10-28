"use client";

/* ═══════════════════════════════════════════════════════════════════════════
 * entity-theme-scope — Aplica el TEMA POR ENTIDAD (grupo/página/comunidad) al
 * montarse y restaura EXACTAMENTE el estado anterior al salir.
 * ---------------------------------------------------------------------------
 * Capa de comportamiento sobre `entity-layout.ts` (campos `themeId`/
 * `themeMix`, opcionales) + el contrato `theme-engine.ts` (ThemeTokens) — no
 * modifica ninguno de los dos. Consciente del modo claro/oscuro vía
 * `next-themes` (mismo criterio que ThemeCatalogGallery/ThemeMixerPanel).
 *
 * SCOPED de verdad: antes de tocar nada, guarda el valor INLINE previo de
 * cada variable/atributo que va a escribir (o `null` si no había ninguno) y,
 * al desmontar, lo restaura EXACTAMENTE — nunca "adivina" un valor por
 * defecto. Si la entidad no tiene tema propio (caso de siempre: `themeId` y
 * `themeMix` ambos `null`), este hook no hace NADA — cero coste, cero
 * regresión sobre el resto del OS.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { applyThemeTokens, listThemes, type ThemePack, type ThemeTokens } from "./theme-engine";
import { mixThemes, SLOT_ORDER, type MixSlots } from "./theme-mixer";
import type { RegistroMovimiento } from "./registros-movimiento";

/* ───────────────── Registro de movimiento por entidad ───────────────────── */

/** Carácter del movimiento cuando la entidad no declara uno propio. */
export const MOVIMIENTO_POR_DEFECTO: RegistroMovimiento = "sobrio";

/**
 * Tema propio de una entidad (cuenta, página o grupo). Es un subconjunto
 * estructural de `EntityLayout`: los temas guardados antes de este campo
 * siguen siendo válidos y el movimiento ausente se resuelve a «sobrio».
 */
export interface TemaEntidad {
    themeId?: string | null;
    themeMix?: Record<string, unknown> | null;
    /** Registro de movimiento opcional (retrocompatible: ausente → «sobrio»). */
    movimiento?: RegistroMovimiento;
}

/** Capas de tema de las que se hereda el movimiento: cuenta › página › grupo. */
export interface CapasTemaEntidad {
    cuenta?: TemaEntidad | null;
    pagina?: TemaEntidad | null;
    grupo?: TemaEntidad | null;
}

/** Valida un registro: cualquier valor desconocido vuelve al defecto. */
export function normalizarRegistroMovimiento(valor: unknown): RegistroMovimiento {
    return valor === "sobrio" || valor === "expresivo" || valor === "experimental"
        ? valor
        : MOVIMIENTO_POR_DEFECTO;
}

/**
 * Registro efectivo con la herencia del resto de campos: de lo más general a
 * lo más concreto (cuenta › página › grupo), lo concreto pisa a lo general.
 * Sin ninguna capa con movimiento propio, manda «sobrio».
 */
export function registroMovimientoEfectivo(capas: CapasTemaEntidad): RegistroMovimiento {
    let registro = MOVIMIENTO_POR_DEFECTO;
    const toma = (tema?: TemaEntidad | null): void => {
        if (tema?.movimiento !== undefined) {
            registro = normalizarRegistroMovimiento(tema.movimiento);
        }
    };
    toma(capas.cuenta);
    toma(capas.pagina);
    toma(capas.grupo);
    return registro;
}

/** Solo las claves que ESTA aplicación concreta va a tocar (nunca más que
 *  eso) — así la restauración es exacta y no interfiere con nada que el
 *  usuario tuviera puesto por otra vía (tema del sistema, Estudio…). */
interface ThemeSnapshot {
    vars: Record<string, string | null>;
    material: string | null | undefined;
    background: string | null | undefined;
    motion: string | null | undefined;
    fontBody: string | null | undefined;
    /** Registro previo en <html> (undefined = esta aplicación no lo tocó). */
    movimiento: string | null | undefined;
}

/** Distingue las capas (cuenta/página/grupo) de un único tema de entidad. */
function esCapasTema(valor: TemaEntidad | CapasTemaEntidad): valor is CapasTemaEntidad {
    return "cuenta" in valor || "pagina" in valor || "grupo" in valor;
}

function isPlausibleMixSlots(v: unknown): v is MixSlots {
    if (!v || typeof v !== "object") return false;
    const obj = v as Record<string, unknown>;
    return SLOT_ORDER.every((slot) => {
        const entry = obj[slot];
        return entry && typeof entry === "object" && typeof (entry as Record<string, unknown>).kind === "string";
    });
}

/** Resuelve un ThemePack al ThemeTokens del modo pedido, con el MISMO orden
 *  de respaldo que `applyTheme()` (theme-engine.ts): el modo pedido → el
 *  otro modo → `modes.auto`. Hace falta el respaldo a `auto` explícitamente
 *  aquí porque un tema guardado desde el Estudio (SaveSharePanel → "Guardar
 *  como tema") solo define `modes.auto` (nunca light/dark por separado) — sin
 *  este fallback, un tema así elegido en el editor "Personalizar" no haría
 *  NADA (degradación silenciosa, el peor tipo de bug: parece que funciona en
 *  el catálogo pero nunca se aplica en la entidad). */
function tokensForMode(pack: ThemePack, mode: "light" | "dark"): ThemeTokens | null {
    const primary = mode === "light" ? pack.modes.light : pack.modes.dark;
    const secondary = mode === "light" ? pack.modes.dark : pack.modes.light;
    return primary ?? secondary ?? pack.modes.auto ?? null;
}

/** Resuelve la entidad a un ThemeTokens concreto (claro u oscuro), o `null`
 *  si no hay tema propio válido — nunca lanza. */
function resolveEntityTokens(layout: TemaEntidad, mode: "light" | "dark"): ThemeTokens | null {
    if (layout.themeMix && isPlausibleMixSlots(layout.themeMix)) {
        try {
            const { pack } = mixThemes(layout.themeMix);
            return tokensForMode(pack, mode);
        } catch { /* mezcla corrupta: degradamos a themeId o a nada */ }
    }
    if (layout.themeId) {
        const pack = listThemes().find((t) => t.id === layout.themeId);
        if (pack) return tokensForMode(pack, mode);
    }
    return null;
}

function snapshotFor(tokens: ThemeTokens | null): ThemeSnapshot {
    const root = document.documentElement;
    const vars: Record<string, string | null> = {};
    for (const k of Object.keys(tokens?.vars || {})) {
        const current = root.style.getPropertyValue(`--${k}`);
        vars[k] = current || null;
    }
    return {
        vars,
        material: tokens?.materialClass !== undefined ? (root.dataset.ssMaterial ?? null) : undefined,
        background: tokens?.background !== undefined ? (root.dataset.ssBackground ?? null) : undefined,
        motion: tokens?.motion !== undefined ? (root.style.getPropertyValue("--ss-motion") || null) : undefined,
        fontBody: tokens?.fontFamily ? (root.style.getPropertyValue("--font-body") || null) : undefined,
        movimiento: undefined,
    };
}

function restoreSnapshot(snap: ThemeSnapshot): void {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(snap.vars)) {
        if (v === null) root.style.removeProperty(`--${k}`);
        else root.style.setProperty(`--${k}`, v);
    }
    if (snap.material !== undefined) {
        if (snap.material === null) delete root.dataset.ssMaterial;
        else root.dataset.ssMaterial = snap.material;
    }
    if (snap.background !== undefined) {
        if (snap.background === null) delete root.dataset.ssBackground;
        else root.dataset.ssBackground = snap.background;
    }
    if (snap.motion !== undefined) {
        if (snap.motion === null) root.style.removeProperty("--ss-motion");
        else root.style.setProperty("--ss-motion", snap.motion);
    }
    if (snap.fontBody !== undefined) {
        if (snap.fontBody === null) root.style.removeProperty("--font-body");
        else root.style.setProperty("--font-body", snap.fontBody);
    }
    if (snap.movimiento !== undefined) {
        if (snap.movimiento === null) delete root.dataset.ssMovimiento;
        else root.dataset.ssMovimiento = snap.movimiento;
    }
    try { window.dispatchEvent(new CustomEvent("starseed:theme-applied")); } catch { /* noop */ }
}

/**
 * Aplica el tema propio de una entidad (grupo/página/comunidad) SOLO mientras
 * el componente que llama a este hook está montado — lo restaura al salir.
 * Úsalo en la página de la entidad, pasándole directamente su `EntityLayout`
 * (o `null`/`undefined` mientras aún no ha cargado — no hace nada hasta que
 * haya datos reales). También acepta las capas `CapasTemaEntidad` para
 * resolver el movimiento con la herencia cuenta › página › grupo: el tema
 * visual sale de la capa más concreta y el registro de `movimiento` viaja al
 * documento como `data-ss-movimiento`, listo para que cada sección lo use.
 */
export function useEntityThemeScope(
    layout: TemaEntidad | CapasTemaEntidad | null | undefined,
): void {
    const { resolvedTheme } = useTheme();
    const mode: "light" | "dark" = resolvedTheme === "light" ? "light" : "dark";
    const snapRef = useRef<ThemeSnapshot | null>(null);

    // Un `EntityLayout` suelto (como lo pasan página y grupo) es una única
    // capa; las capas explícitas conservan su orden de herencia.
    const capas: CapasTemaEntidad | null = layout
        ? esCapasTema(layout)
            ? layout
            : { cuenta: layout }
        : null;
    const tema = capas?.grupo ?? capas?.pagina ?? capas?.cuenta ?? null;
    const themeId = tema?.themeId ?? null;
    const themeMixKey = tema?.themeMix ? JSON.stringify(tema.themeMix) : "";
    const movimiento = capas ? registroMovimientoEfectivo(capas) : MOVIMIENTO_POR_DEFECTO;
    const movimientoPropio = Boolean(
        capas &&
            (capas.cuenta?.movimiento !== undefined ||
                capas.pagina?.movimiento !== undefined ||
                capas.grupo?.movimiento !== undefined),
    );
    const aplica = Boolean(themeId || themeMixKey || movimientoPropio);

    useEffect(() => {
        if (typeof document === "undefined") return;
        if (!aplica) return; // sin tema ni movimiento propio: cero efecto, cero regresión

        const tokens =
            themeId || themeMixKey
                ? resolveEntityTokens({ themeId, themeMix: themeMixKey ? JSON.parse(themeMixKey) : null }, mode)
                : null;
        if (!tokens && !movimientoPropio) return;

        const snap = snapshotFor(tokens);
        snap.movimiento = document.documentElement.dataset.ssMovimiento ?? null;
        snapRef.current = snap;

        if (tokens) applyThemeTokens(tokens);
        // El registro efectivo queda en <html>; las secciones lo leen y
        // `movimientoDe(registro, sección)` traduce a los tokens del OS.
        document.documentElement.dataset.ssMovimiento = movimiento;

        return () => {
            if (snapRef.current) restoreSnapshot(snapRef.current);
            snapRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [themeId, themeMixKey, mode, movimiento, aplica, movimientoPropio]);
}
