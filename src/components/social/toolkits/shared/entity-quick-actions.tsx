// src/components/social/toolkits/shared/entity-quick-actions.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Fila de ACCIONES POR DEFECTO de toda entidad (Adenda 63 §8): páginas, grupos,
// partidos, E.F., asambleas, comunidades y eventos. Se renderiza al inicio de
// cada toolkit (dispatcher src/components/social/toolkits/index.tsx):
//
//   · Publicar aquí → Zona de Publicación (/crear?area=publicar&dest=propia).
//   · Agenda        → diálogo con el calendario unificado real (realOnly).
//   · Biblioteca    → diálogo con la biblioteca de la entidad (entity_state).
//   · Miembros      → diálogo con el roster (si la entidad declara recuento).
//   · Compartir     → diálogo UNIVERSAL de permisos (ShareAccessDialog sobre la
//                     biblioteca de la entidad) + copiar enlace de la entidad.
//   · Ajustes       → editor real de la entidad (EntityEditorDialog), solo si
//                     la sesión es dueña de una entidad REAL (os_pages/os_groups).
//
// Aditivo: no toca la estructura interna de ningún toolkit; degrada con
// honestidad cuando faltan datos (roster) o permisos (ajustes).
// ─────────────────────────────────────────────────────────────────────────────
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { UnifiedCalendar } from "@/components/calendar/unified-calendar";
import { EntityLibraryPanel } from "@/components/library/entity-library-panel";
import { libraryRef, type LibraryEntityKind } from "@/lib/library/entity-library";
import { ShareAccessDialog } from "@/components/sharing/share-access-dialog";
import {
    EntityEditorDialog,
    type EditableEntity,
} from "@/components/social/entity-editor-dialog";
import { useOsEntity, useEntityOwner } from "@/hooks/use-os-entities";
import type { OsGroup, OsPage } from "@/lib/os-social";
import { RosterStrip, EmptyHint } from "./index";
import {
    PenSquare,
    CalendarDays,
    BookMarked,
    Users,
    Share2,
    Settings2,
    ArrowUpRight,
    type LucideIcon,
} from "lucide-react";

/** Pill de acción reutilizable de la fila (botón o enlace). */
function ActionPill({
    icon: Icon,
    label,
    accent,
    onClick,
    href,
}: {
    icon: LucideIcon;
    label: string;
    accent?: string;
    onClick?: () => void;
    href?: string;
}) {
    const cls =
        "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur transition-colors duration-200 hover:border-white/25 hover:text-foreground";
    const inner = (
        <>
            <Icon className="h-3.5 w-3.5" style={accent ? { color: accent } : undefined} />
            {label}
        </>
    );
    if (href) {
        return (
            <Link href={href} className={cls}>
                {inner}
            </Link>
        );
    }
    return (
        <button type="button" onClick={onClick} className={cls}>
            {inner}
        </button>
    );
}

export interface EntityQuickActionsProps {
    /** Slug de la entidad (mismo que usa el toolkit). */
    slug: string;
    /** Nombre legible (títulos de los diálogos). */
    name?: string;
    /** Color de acento de la entidad. */
    accent?: string;
    /** Tabla real que respalda el slug: os_groups ("group") u os_pages ("page"). */
    entityKind?: "group" | "page";
    /** Ámbito de entity_state de su biblioteca (party, ef, community, event…). */
    libraryKind?: LibraryEntityKind;
    /** Ruta pública de la entidad (para compartir enlace); se deriva si falta. */
    entityHref?: string;
    /** Recuento de miembros/militantes/asistentes si el toolkit lo conoce. */
    memberCount?: number;
    /** Etiqueta del recuento ("miembros", "militantes", "asistentes"…). */
    membersLabel?: string;
}

export function EntityQuickActions({
    slug,
    name,
    accent,
    entityKind = "group",
    libraryKind,
    entityHref,
    memberCount,
    membersLabel = "miembros",
}: EntityQuickActionsProps) {
    const displayName = name || slug;
    const libKind: LibraryEntityKind = libraryKind ?? entityKind;
    const href = entityHref ?? (entityKind === "page" ? `/pagina/${slug}` : `/grupo/${slug}`);

    const [openDialog, setOpenDialog] = useState<null | "agenda" | "biblioteca" | "miembros" | "compartir" | "ajustes">(null);

    // Entidad real (para Ajustes): solo cuando existe en os_pages/os_groups y
    // la sesión es dueña. Cast al shape común: los overloads de useOsEntity
    // exigen un literal y aquí el tipo llega como variable.
    const entityState = (useOsEntity as (
        s: string,
        t: "page" | "group",
    ) => {
        data: OsPage | OsGroup | null;
        loading: boolean;
        usingFallback: boolean;
        error: string | null;
        refetch: () => void;
    })(slug, entityKind);
    const { isOwner } = useEntityOwner(entityKind, slug);
    const canEdit = isOwner && !!entityState.data && !entityState.usingFallback;

    const editable: EditableEntity | undefined = entityState.data
        ? entityKind === "page"
            ? { type: "page", data: entityState.data as OsPage }
            : { type: "group", data: entityState.data as OsGroup }
        : undefined;

    return (
        <>
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 mb-4 px-1 pb-1 sm:flex-wrap sm:overflow-visible">
                <ActionPill
                    icon={PenSquare}
                    label="Publicar aquí"
                    accent={accent}
                    href="/crear?area=publicar&dest=propia"
                />
                <ActionPill icon={CalendarDays} label="Agenda" accent={accent} onClick={() => setOpenDialog("agenda")} />
                <ActionPill icon={BookMarked} label="Biblioteca" accent={accent} onClick={() => setOpenDialog("biblioteca")} />
                <ActionPill icon={Users} label="Miembros" accent={accent} onClick={() => setOpenDialog("miembros")} />
                <ActionPill icon={Share2} label="Compartir" accent={accent} onClick={() => setOpenDialog("compartir")} />
                {canEdit && (
                    <ActionPill icon={Settings2} label="Ajustes" accent={accent} onClick={() => setOpenDialog("ajustes")} />
                )}
            </div>

            {/* ── Agenda de la entidad (calendario unificado, solo entradas reales) ── */}
            <Dialog open={openDialog === "agenda"} onOpenChange={(o) => !o && setOpenDialog(null)}>
                <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Agenda de {displayName}</DialogTitle>
                        <DialogDescription>
                            Eventos y actividades reales vinculadas a esta entidad.
                        </DialogDescription>
                    </DialogHeader>
                    <UnifiedCalendar
                        realOnly
                        title={`Agenda de ${displayName}`}
                        subtitle="Entradas reales del calendario unificado de la red."
                    />
                </DialogContent>
            </Dialog>

            {/* ── Biblioteca de la entidad (entity_state, sync en vivo) ── */}
            <Dialog open={openDialog === "biblioteca"} onOpenChange={(o) => !o && setOpenDialog(null)}>
                <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Biblioteca de {displayName}</DialogTitle>
                        <DialogDescription>
                            Documentos, propuestas y archivos guardados por esta entidad.
                        </DialogDescription>
                    </DialogHeader>
                    <EntityLibraryPanel
                        ref={libraryRef(libKind, slug)}
                        accent={accent}
                        title={`Biblioteca de ${displayName}`}
                        subtitle="Sincronizada en tiempo real entre dispositivos."
                    />
                </DialogContent>
            </Dialog>

            {/* ── Miembros (roster honesto: recuento real o estado vacío) ── */}
            <Dialog open={openDialog === "miembros"} onOpenChange={(o) => !o && setOpenDialog(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Miembros de {displayName}</DialogTitle>
                        <DialogDescription>Personas soberanas vinculadas a esta entidad.</DialogDescription>
                    </DialogHeader>
                    {typeof memberCount === "number" && memberCount > 0 ? (
                        <RosterStrip count={memberCount} label={membersLabel} accent={accent} max={9} seed={slug} />
                    ) : (
                        <EmptyHint>
                            Aún no hay un directorio de miembros público para esta entidad.
                        </EmptyHint>
                    )}
                    <Link
                        href={href}
                        className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                        Abrir la página de la entidad <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                </DialogContent>
            </Dialog>

            {/* ── Compartir universal (permisos por ámbito/rol + enlace de la entidad) ── */}
            {openDialog === "compartir" && (
                <ShareAccessDialog
                    open
                    onOpenChange={(o) => !o && setOpenDialog(null)}
                    resource={{
                        type: "library",
                        id: `${libKind}:${slug}`,
                        title: displayName,
                        libraryRef: libraryRef(libKind, slug),
                    }}
                    buildLink={() =>
                        typeof window !== "undefined" ? `${window.location.origin}${href}` : href
                    }
                    title={`Compartir ${displayName}`}
                    description="Permisos del espacio de esta entidad y enlace público para invitar."
                />
            )}

            {/* ── Ajustes (editor real de la entidad; solo dueño/a) ── */}
            {canEdit && editable && (
                <EntityEditorDialog
                    open={openDialog === "ajustes"}
                    onOpenChange={(o) => !o && setOpenDialog(null)}
                    mode="edit"
                    entity={editable}
                    onSaved={() => {
                        setOpenDialog(null);
                        entityState.refetch();
                    }}
                />
            )}
        </>
    );
}
