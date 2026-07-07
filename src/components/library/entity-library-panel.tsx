"use client";

// ════════════════════════════════════════════════════════════════════════════
// EntityLibraryPanel — Biblioteca de UNA entidad (compartido)
// ----------------------------------------------------------------------------
// Panel reutilizable que muestra lo GUARDADO por una entidad concreta (usuario,
// perfil, página, grupo, comunidad, evento, E.F., partido…). Se monta en:
//   · /library (área «Biblioteca», selector de entidad)
//   · Pestaña "Biblioteca" de cada página de entidad (grupo/página/evento/perfil)
//
// Distinto de la Librería (catálogo en línea, package-store.tsx): esto es SOLO
// lo que la entidad ha guardado, con su propia estructura de carpetas.
//
// Adenda 64 §6-7: el cuerpo (carpetas anidadas, vistas iconos/lista/columnas,
// menú contextual, permisos, publicación) vive en `./finder/finder-view.tsx`
// (FinderView) — este archivo resuelve la cabecera + el contexto de permisos
// (¿es el visitante dueño de esta biblioteca?) y delega el resto.
//
// SOP: architecture/libreria-biblioteca-sync.md §3, §6-7 · datos: lib/library/entity-library.ts
// Local-first, tolerante sin sesión, realtime entre dispositivos/miembros.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { BookMarked } from "lucide-react";
import type { EntityRef } from "@/lib/library/entity-library";
import { createClient } from "@/utils/supabase/client";
import { FinderView } from "./finder/finder-view";
import type { AclViewerContext } from "./finder/finder-types";
// Captura rápida "Guardar en Marcadores" (Adenda 69 §19): guarda enlaces/notas/
// imágenes en la carpeta "Marcadores" de ESTA biblioteca (src/lib/library/bookmarks.ts).
import { SaveToBookmarks } from "./save-to-bookmarks";

/**
 * Resuelve si el visitante actual es "dueño/gestor" de esta biblioteca
 * (bypass total de ACL) y a qué grupos pertenece (para ACL de tipo "group").
 *   · kind="user": dueño si el uid coincide con `ref.id`.
 *   · kind="page"/"group": dueño si `owner_id` coincide, o ADMIN si es miembro
 *     con rol de gestión (tratamos cualquier membresía como colaborador, pero
 *     solo el owner_id real bypassa ACL — más estricto y seguro por defecto).
 *   · resto (community/event/ef/party/other): mismo criterio por owner_id best-effort.
 * Nunca lanza; sin sesión o sin tablas accesibles, degrada a "no soy dueño,
 * sin grupos" (máxima restricción posible, nunca menos segura).
 */
function useAclContext(ref: EntityRef | null): AclViewerContext {
    const [ctx, setCtx] = useState<AclViewerContext>({ isOwner: false, userId: null, groupSlugs: [] });

    useEffect(() => {
        if (!ref) {
            setCtx({ isOwner: false, userId: null, groupSlugs: [] });
            return;
        }
        let alive = true;
        (async () => {
            try {
                const supabase = createClient();
                const { data: userData } = await supabase.auth.getUser();
                const uid = userData?.user?.id ?? null;
                if (!uid) {
                    if (alive) setCtx({ isOwner: false, userId: null, groupSlugs: [] });
                    return;
                }

                if (ref.kind === "user") {
                    if (alive) setCtx({ isOwner: ref.id === uid, userId: uid, groupSlugs: [] });
                    return;
                }

                const [membershipsRes, ownedRes] = await Promise.all([
                    supabase.from("os_memberships").select("group_slug").eq("user_id", uid),
                    ref.kind === "group"
                        ? supabase.from("os_groups").select("slug").eq("slug", ref.id).eq("owner_id", uid).maybeSingle()
                        : supabase.from("os_pages").select("slug").eq("slug", ref.id).eq("owner_id", uid).maybeSingle(),
                ]);

                const groupSlugs = (membershipsRes.data ?? []).map((r) => (r as { group_slug: string }).group_slug).filter(Boolean);
                const isOwner = !!ownedRes.data;
                if (alive) setCtx({ isOwner, userId: uid, groupSlugs });
            } catch {
                if (alive) setCtx({ isOwner: false, userId: null, groupSlugs: [] });
            }
        })();
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- ref.kind/ref.id identifican `ref` de forma estable
    }, [ref?.kind, ref?.id]);

    return ctx;
}

/* ───────────────────────── Panel principal ───────────────────────── */

export interface EntityLibraryPanelProps {
    /** Referencia de la entidad cuya biblioteca se muestra (null = aún resolviendo). */
    ref: EntityRef | null;
    /** Color de acento de la entidad (opcional, hereda el de la página). */
    accent?: string;
    /** Título del panel (por defecto "Biblioteca"). */
    title?: string;
    /** Subtítulo descriptivo bajo el título. */
    subtitle?: string;
    /** Altura máxima del área de contenido (scroll interno); omite para altura libre. */
    compact?: boolean;
}

export function EntityLibraryPanel({
    ref: entityRef,
    accent = "#7FB8FF",
    title = "Biblioteca",
    subtitle,
    compact = false,
}: EntityLibraryPanelProps) {
    const aclContext = useAclContext(entityRef);

    if (!entityRef) {
        return (
            <GlassCard className="p-[clamp(1rem,2.5vw,1.5rem)]">
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
                    <BookMarked className="h-8 w-8 opacity-25" />
                    <p className="text-sm">Inicia sesión para ver esta biblioteca.</p>
                </div>
            </GlassCard>
        );
    }

    return (
        <GlassCard className="p-[clamp(1rem,2.5vw,1.5rem)]">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="flex items-center gap-2 font-headline text-lg font-semibold" style={{ color: accent }}>
                        <BookMarked className="h-5 w-5" /> {title}
                    </h2>
                    {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
                </div>
                <SaveToBookmarks libraryRef={entityRef} label="Guardar enlace…" />
            </div>

            <FinderView entityRef={entityRef} accent={accent} aclContext={aclContext} compact={compact} />
        </GlassCard>
    );
}

export default EntityLibraryPanel;
