// src/components/social/toolkits/index.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Dispatcher de toolkits funcionales por tipo de página. Dado un `kind` (en
// cualquier vocabulario: pageType de profile, kind de os_*, texto de widget),
// normaliza con entity-kinds y renderiza el toolkit adecuado. Cada toolkit es un
// conjunto de herramientas interconectadas con el resto de la red StarSeed.
// ─────────────────────────────────────────────────────────────────────────────
"use client";

import React from "react";
import { entityKindMeta, type EntityKindMeta } from "@/lib/entity-kinds";
import { PartidoToolkit } from "./PartidoToolkit";
import { EntidadFederativaToolkit } from "./EntidadFederativaToolkit";
import { AsambleaToolkit } from "./AsambleaToolkit";
import { ComunidadToolkit } from "./ComunidadToolkit";
import { GrupoToolkit } from "./GrupoToolkit";
import { EventoToolkit } from "./EventoToolkit";

export interface GovernanceToolkitProps {
    /** Tipo de entidad en cualquier vocabulario (se normaliza). */
    kind: string;
    /** Slug de la entidad para resolver sus datos. */
    slug: string;
    /** Color de acento de la entidad (opcional; si no, usa el del tipo). */
    accent?: string;
    /** Nombre legible de la entidad (opcional). */
    name?: string;
}

/** ¿Este tipo dispone de un toolkit funcional propio? */
export function hasToolkit(kind: string): boolean {
    return entityKindMeta(kind).toolkit !== "none";
}

/** Metadatos del tipo (icono, etiqueta de pestaña, acento por defecto, etc.). */
export function toolkitMeta(kind: string): EntityKindMeta {
    return entityKindMeta(kind);
}

export function GovernanceToolkit({ kind, slug, accent, name }: GovernanceToolkitProps) {
    const meta = entityKindMeta(kind);
    const props = { slug, accent: accent ?? meta.accent, name };

    switch (meta.toolkit) {
        case "partido":
            return <PartidoToolkit {...props} />;
        case "ef":
            return <EntidadFederativaToolkit {...props} />;
        case "asamblea":
            return <AsambleaToolkit {...props} />;
        case "comunidad":
            return <ComunidadToolkit {...props} />;
        case "grupo":
            return <GrupoToolkit {...props} />;
        case "evento":
            return <EventoToolkit {...props} />;
        case "none":
        default:
            return null;
    }
}

export default GovernanceToolkit;
