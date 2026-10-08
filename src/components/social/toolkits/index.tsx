// src/components/social/toolkits/index.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Dispatcher de toolkits funcionales por tipo de página. Dado un `kind` (en
// cualquier vocabulario: pageType de profile, kind de os_*, texto de widget),
// normaliza con entity-kinds y renderiza el toolkit adecuado. Cada toolkit es un
// conjunto de herramientas interconectadas con el resto de la red StarSeed.
// ─────────────────────────────────────────────────────────────────────────────
"use client";

import React from "react";
import { Compass } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import { entityKindMeta, type EntityKindMeta } from "@/lib/entity-kinds";
import type { Visibilidad } from "@/lib/mando/ambito";
import { PartidoToolkit } from "./PartidoToolkit";
import { EntidadFederativaToolkit } from "./EntidadFederativaToolkit";
import { AsambleaToolkit } from "./AsambleaToolkit";
import { ComunidadToolkit } from "./ComunidadToolkit";
import { GrupoToolkit } from "./GrupoToolkit";
import { EventoToolkit } from "./EventoToolkit";
import { EstacionesEntidad } from "./estaciones-entidad";

export interface GovernanceToolkitProps {
    /** Tipo de entidad en cualquier vocabulario (se normaliza). */
    kind: string;
    /** Slug de la entidad para resolver sus datos. */
    slug: string;
    /** Color de acento de la entidad (opcional; si no, usa el del tipo). */
    accent?: string;
    /** Nombre legible de la entidad (opcional). */
    name?: string;
    /**
     * Tabla real que respalda este slug: "group" (os_groups, p.ej. círculo/
     * colectivo) o "page" (os_pages, p.ej. página de tipo proyecto). Sólo lo
     * usa GrupoToolkit (sección Educación) para elegir el ámbito correcto de
     * entity_state; el resto de toolkits lo ignora. Por defecto "group".
     */
    entityKind?: "group" | "page";
}

/** ¿Este tipo dispone de un toolkit funcional propio? */
export function hasToolkit(kind: string): boolean {
    return entityKindMeta(kind).toolkit !== "none";
}

/** Metadatos del tipo (icono, etiqueta de pestaña, acento por defecto, etc.). */
export function toolkitMeta(kind: string): EntityKindMeta {
    return entityKindMeta(kind);
}

/**
 * Herramienta «Genesis» del kit de cada entidad (contrato
 * architecture/puente-mando-para-todos.md §7). Enlaza a Genesis del ámbito de la
 * entidad y enseña la insignia de visibilidad. Solo aparece con la bandera
 * `NEXT_PUBLIC_STARSEED_MANDO_TODOS=1`; la lee al renderizar para que una
 * entidad sin bandera no note ningún cambio.
 */
export function PuenteMandoTool({
    slug,
    visibilidad = "privado",
    accent,
}: {
    slug: string;
    visibilidad?: Visibilidad;
    accent?: string;
}) {
    if (process.env.NEXT_PUBLIC_STARSEED_MANDO_TODOS !== "1") return null;
    const ac = accent ?? "#E9C46A";
    const etiquetas: Record<Visibilidad, string> = {
        privado: "privado",
        miembros: "solo miembros",
        publico: "público",
    };
    return (
        <GlassCard className="p-[clamp(1rem,2.5vw,1.5rem)]">
            <div className="flex items-center gap-3">
                <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
                    style={{ borderColor: `${ac}44`, background: `${ac}14`, color: ac }}
                >
                    <Compass className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">Genesis</p>
                    <p className="truncate text-xs text-muted-foreground">
                        Enjambre de agentes de esta entidad, en vivo y 24/7
                    </p>
                </div>
                <Badge
                    variant="outline"
                    className="shrink-0 text-[10px]"
                    style={{ borderColor: `${ac}55`, color: ac }}
                >
                    {etiquetas[visibilidad]}
                </Badge>
                <a
                    href={`/genesis?ambito=${encodeURIComponent(slug)}`}
                    className="cursor-pointer shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/5"
                    style={{ borderColor: `${ac}55`, color: ac }}
                >
                    Abrir Genesis
                </a>
            </div>
        </GlassCard>
    );
}

/** Envuelve un toolkit y le añade la herramienta «Genesis» (§7). */
function KitConMando({
    toolkit,
    slug,
    accent,
}: {
    toolkit: React.ReactNode;
    slug: string;
    accent?: string;
    name?: string;
    entityKind?: "group" | "page";
}) {
    return (
        <div className="space-y-6">
            {toolkit}
            <PuenteMandoTool slug={slug} accent={accent} />
        </div>
    );
}

export function GovernanceToolkit({ kind, slug, accent, name, entityKind }: GovernanceToolkitProps) {
    const meta = entityKindMeta(kind);
    const props = { slug, accent: accent ?? meta.accent, name, entityKind: entityKind ?? "group" as const };

    switch (meta.toolkit) {
        case "partido":
            return <KitConMando toolkit={<PartidoToolkit {...props} />} {...props} />;
        case "ef":
            return <KitConMando toolkit={<EntidadFederativaToolkit {...props} />} {...props} />;
        case "asamblea":
            return <KitConMando toolkit={<AsambleaToolkit {...props} />} {...props} />;
        case "comunidad":
            return <KitConMando toolkit={<ComunidadToolkit {...props} />} {...props} />;
        case "grupo":
            return <KitConMando toolkit={<GrupoToolkit {...props} />} {...props} />;
        case "evento":
            return <KitConMando toolkit={<EventoToolkit {...props} />} {...props} />;
        case "none":
        default:
            // Sin kit propio (p.ej. una página), Genesis aún aplica.
            return (
                <PuenteMandoTool
                    slug={slug}
                    accent={accent ?? meta.accent}
                />
            );
    }
}

export { EstacionesEntidad } from "./estaciones-entidad";

export default GovernanceToolkit;
