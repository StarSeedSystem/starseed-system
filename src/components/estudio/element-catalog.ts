"use client";

/*
 * element-catalog — metadatos de las "familias" de elementos editables por
 * el Estudio Universal de Diseño. Cada familia declara qué GRUPOS de
 * propiedades tiene sentido mostrarle (honesto: p.ej. un Widget no expone
 * radio/padding propios porque WidgetShell los gobierna globalmente desde
 * Ajustes → Apariencia; un Fondo no tiene tipografía).
 */

import {
    MousePointerClick, PanelsTopLeft, AppWindow, Shapes, LayoutGrid,
    CreditCard, Image as ImageIcon, Palette, type LucideIcon,
} from "lucide-react";
import type { ElementFamily } from "./types";

export type PropertyGroup =
    | "color" | "gradient" | "radius" | "shadow" | "blur" | "border"
    | "typography" | "padding" | "animation" | "material" | "background";

export interface ElementFamilyMeta {
    id: ElementFamily;
    label: string;
    icon: LucideIcon;
    hint: string;
    groups: PropertyGroup[];
}

export const ELEMENT_FAMILIES: ElementFamilyMeta[] = [
    {
        id: "button", label: "Botón", icon: MousePointerClick,
        hint: "Botones primario / secundario / contorno del sistema (ui/button).",
        groups: ["color", "radius", "shadow", "border", "typography", "padding", "animation"],
    },
    {
        id: "tabs", label: "Pestañas", icon: PanelsTopLeft,
        hint: "Barra de pestañas del sistema (ui/tabs).",
        groups: ["color", "radius", "shadow", "border", "typography", "animation"],
    },
    {
        id: "window", label: "Ventana", icon: AppWindow,
        hint: "Chrome de ventana (misma clase .crystal-window del escritorio).",
        groups: ["color", "radius", "shadow", "blur", "border", "material", "animation"],
    },
    {
        id: "icon", label: "Icono", icon: Shapes,
        hint: "Iconografía del sistema (Lucide) en tarjeta 3D.",
        groups: ["color", "gradient", "radius", "shadow", "animation"],
    },
    {
        id: "widget", label: "Widget", icon: LayoutGrid,
        hint: "Tarjeta de widget real del Dashboard (WidgetShell) — acento + material propio.",
        groups: ["color", "material", "animation"],
    },
    {
        id: "card", label: "Tarjeta", icon: CreditCard,
        hint: "Tarjeta / panel de cristal genérico (ui/card).",
        groups: ["color", "radius", "shadow", "blur", "border", "typography", "padding", "animation"],
    },
    {
        id: "background", label: "Fondo", icon: ImageIcon,
        hint: "Degradado propio o imagen personalizada (editor 2D / foto subida).",
        groups: ["gradient", "blur", "background", "animation"],
    },
    {
        id: "theme", label: "Tema completo", icon: Palette,
        hint: "Paleta y tokens globales del sistema (ThemePack).",
        groups: ["color", "radius", "material", "animation", "background"],
    },
];

export function familyMeta(id: ElementFamily): ElementFamilyMeta {
    return ELEMENT_FAMILIES.find((f) => f.id === id) ?? ELEMENT_FAMILIES[0];
}

export function familyHasGroup(id: ElementFamily, group: PropertyGroup): boolean {
    return familyMeta(id).groups.includes(group);
}
