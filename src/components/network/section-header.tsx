// src/components/network/section-header.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Cabecera CONSISTENTE de las secciones de La Red (Política · Educación ·
// Cultura) — Adenda 63 §8: icono + título + descripción + fila de ACCIONES
// RÁPIDAS con los tipos especializados de cada sección (creation-config), que
// navegan a la Zona de Publicación del Centro de Creación:
//   /crear?area=publicar&dest=<sección>
// Estética Crystal Liquid Glass, scroll-x limpio en móvil (.scrollbar-hide).
// ─────────────────────────────────────────────────────────────────────────────
"use client";

import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Plus, type LucideIcon } from "lucide-react";
import {
    CREATION_DEST_BY_ID,
    TIPOS_POR_DEST,
    type CreationDest,
} from "@/components/creation/creation-config";

/** Chips de creación rápida: un chip por tipo especializado de la sección. */
export function SectionQuickActions({
    dest,
    children,
    className,
}: {
    /** Sección destino (politica · educacion · cultura · biblioteca). */
    dest: CreationDest;
    /** Acciones extra propias de la sección (se anteponen a los chips). */
    children?: React.ReactNode;
    className?: string;
}) {
    const tipos = TIPOS_POR_DEST[dest] ?? [];
    const href = `/crear?area=publicar&dest=${dest}`;
    return (
        <div
            className={cn(
                "flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1 sm:flex-wrap sm:overflow-visible",
                className,
            )}
        >
            {children}
            {tipos.map((t) => {
                const Icon = t.icon;
                return (
                    <Link
                        key={t.id}
                        href={href}
                        title={`${t.label}: ${t.desc}`}
                        className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur transition-colors duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-foreground"
                    >
                        <Plus className="h-3 w-3 opacity-60" />
                        <Icon className="h-3.5 w-3.5 text-primary" />
                        {t.label}
                    </Link>
                );
            })}
        </div>
    );
}

/**
 * Cabecera de sección: icono en burbuja glass + título + descripción, con la
 * fila de acciones rápidas debajo (children = acciones extra de la sección).
 */
export function SectionHeader({
    dest,
    icon: Icon,
    title,
    description,
    actions,
    className,
}: {
    dest: CreationDest;
    icon: LucideIcon;
    title: string;
    description: string;
    /** Acciones extra (botones propios) antepuestas a los chips de tipos. */
    actions?: React.ReactNode;
    className?: string;
}) {
    const accent = CREATION_DEST_BY_ID[dest]?.accent ?? "border-primary/50 text-primary";
    return (
        <header className={cn("flex flex-col gap-3", className)}>
            <div className="flex items-start gap-3">
                <span
                    className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border bg-white/[0.04] backdrop-blur shadow-lg",
                        accent,
                    )}
                >
                    <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                    <h1 className="font-headline text-2xl font-bold leading-tight sm:text-3xl">{title}</h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
                </div>
            </div>
            <SectionQuickActions dest={dest}>{actions}</SectionQuickActions>
        </header>
    );
}
