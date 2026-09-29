"use client";
/**
 * «Fundar / crear» desde un widget (Ola 0929 · D): abre el diálogo REAL de creación de entidades
 * (`EntityEditorDialog`, el mismo del Hub) dentro del tablero. El enlace `?createEntity=` que
 * usaban los widgets no abría nada en /dashboard: quien lo escucha (`GlobalEntityCreator`) solo
 * vive en `app-providers.tsx`, que no se monta. El diálogo pesa: se carga al pulsar.
 */
import * as React from "react";
import dynamic from "next/dynamic";
import type { EntityEditorType } from "@/components/social/entity-editor-dialog";

const EntityEditorDialog = dynamic(
    () => import("@/components/social/entity-editor-dialog").then((m) => m.EntityEditorDialog),
    { ssr: false },
);

export function useCrearEntidad(alGuardar?: () => void) {
    const [tipo, setTipo] = React.useState<EntityEditorType | null>(null);
    const abrir = React.useCallback((t: EntityEditorType) => setTipo(t), []);
    const dialogo = tipo ? (
        <EntityEditorDialog
            open
            mode="create"
            defaultType={tipo}
            onOpenChange={(abierto) => { if (!abierto) setTipo(null); }}
            onSaved={() => { setTipo(null); alGuardar?.(); }}
        />
    ) : null;
    return { abrir, dialogo };
}
