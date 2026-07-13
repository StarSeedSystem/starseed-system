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
// lo que la entidad ha guardado, con su propia estructura de folders.
//
// Adenda 64 §6-7: el cuerpo (folders anidados, vistas iconos/lista/columnas,
// menú contextual, permisos, publicación) vive en `./finder/finder-view.tsx`
// (FinderView) — este archivo resuelve la cabecera + el contexto de permisos
// (¿es el visitante dueño de esta biblioteca?) y delega el resto.
//
// SOP: architecture/libreria-biblioteca-sync.md §3, §6-7 · datos: lib/library/entity-library.ts
// Local-first, tolerante sin sesión, realtime entre dispositivos/miembros.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { AlertTriangle, BookMarked, CloudOff, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { watchLibrary, useLibraryPendingSync, type EntityRef } from "@/lib/library/entity-library";
// Archivos ya subidos a Storage cuya fila `os_files` aún no se ha podido
// registrar (Adenda 66 §2): se avisa y se reintenta, nunca se da por bueno.
import { FILES_PENDING_EVENT, flushPendingFiles, pendingFilesCount } from "@/lib/files/os-files";
import { createClient } from "@/utils/supabase/client";
import { listMyProfiles } from "@/lib/profiles/profiles";
// Permisos de la BIBLIOTECA ENTERA (Adenda 66 §3): nodo raíz del que heredan
// folders y archivos. Mismo diálogo universal que el resto de nodos.
import { ShareAccessDialog, LIBRARY_SCOPES } from "@/components/sharing/share-access-dialog";
import { libraryResourceRef } from "@/lib/sharing/access";
import { FinderView } from "./finder/finder-view";
import type { AclViewerContext } from "./finder/finder-types";
// Captura rápida "Guardar en Marcadores" (Adenda 69 §19): guarda enlaces/notas/
// imágenes en el folder "Marcadores" de ESTA biblioteca (src/lib/library/bookmarks.ts).
import { SaveToBookmarks } from "./save-to-bookmarks";
// "Organizar inteligentemente" (Adenda 63 §14, inspirado en Mouzi): plan por
// tipo/tema/fecha con Astraura o heurística local, aplicado con confirmación.
import { SmartOrganizeButton } from "./smart-organize-button";

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
    const [ctx, setCtx] = useState<AclViewerContext>({ isOwner: false, userId: null, groupSlugs: [], profileIds: [] });

    useEffect(() => {
        if (!ref) {
            setCtx({ isOwner: false, userId: null, groupSlugs: [], profileIds: [] });
            return;
        }
        let alive = true;
        (async () => {
            try {
                const supabase = createClient();
                const { data: userData } = await supabase.auth.getUser();
                const uid = userData?.user?.id ?? null;
                if (!uid) {
                    if (alive) setCtx({ isOwner: false, userId: null, groupSlugs: [], profileIds: [] });
                    return;
                }

                // REGLA CUENTA↔PERFILES (Adenda 66 §3): un acceso concedido a CUALQUIER
                // perfil de mi cuenta me vale a mí (y al revés). Cargamos mis perfiles
                // para que la ACL del cliente diga lo MISMO que la RLS (acl_ids_allow).
                const myProfiles = await listMyProfiles();
                const profileIds = myProfiles.map((p) => p.id);

                if (ref.kind === "user") {
                    if (alive) setCtx({ isOwner: ref.id === uid, userId: uid, groupSlugs: [], profileIds });
                    return;
                }
                if (ref.kind === "profile") {
                    // Biblioteca de una faceta: dueño si esa faceta es de mi cuenta.
                    if (alive) setCtx({ isOwner: profileIds.includes(ref.id), userId: uid, groupSlugs: [], profileIds });
                    return;
                }

                const [membershipsRes, ownedRes] = await Promise.all([
                    supabase.from("os_memberships").select("group_slug").eq("user_id", uid),
                    ref.kind === "group"
                        ? supabase.from("os_groups").select("slug").eq("slug", ref.id).eq("owner_id", uid).maybeSingle()
                        : supabase.from("os_pages").select("slug").eq("slug", ref.id).eq("owner_id", uid).maybeSingle(),
                ]);

                const groupSlugs = (membershipsRes.data ?? []).map((r: { group_slug: string }) => r.group_slug).filter(Boolean);
                const isOwner = !!ownedRes.data;
                if (alive) setCtx({ isOwner, userId: uid, groupSlugs, profileIds });
            } catch {
                if (alive) setCtx({ isOwner: false, userId: null, groupSlugs: [], profileIds: [] });
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
    // Sync en tiempo real (Adenda 63 §4): canal compartido por entidad — los
    // ítems guardados en OTRO dispositivo/perfil aparecen aquí sin recargar.
    // `error` (Adenda 66 §2) trae el MOTIVO real si la nube rechaza la subida:
    // el fallo nunca puede ser mudo.
    const { pending, error: syncError, retryNow } = useLibraryPendingSync(entityRef);
    const [retrying, setRetrying] = useState(false);
    // Archivos que SÍ están en Storage pero cuya fila `os_files` no se registró
    // (la causa real de "el archivo solo existe en el dispositivo que lo subió").
    const [filesPending, setFilesPending] = useState(0);
    // Permisos de la biblioteca entera (Adenda 66 §3).
    const [libraryPermsOpen, setLibraryPermsOpen] = useState(false);

    useEffect(() => {
        if (!entityRef) return;
        return watchLibrary(entityRef);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- kind/id identifican la entidad de forma estable
    }, [entityRef?.kind, entityRef?.id]);

    useEffect(() => {
        const update = () => setFilesPending(pendingFilesCount());
        update();
        window.addEventListener(FILES_PENDING_EVENT, update);
        window.addEventListener("online", update);
        return () => {
            window.removeEventListener(FILES_PENDING_EVENT, update);
            window.removeEventListener("online", update);
        };
    }, []);

    const handleRetry = () => {
        setRetrying(true);
        retryNow();
        void flushPendingFiles();
        // Feedback breve: el estado real lo actualiza el evento de pendientes.
        window.setTimeout(() => setRetrying(false), 1500);
    };

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
                    {(pending || filesPending > 0) && (
                        <button
                            type="button"
                            onClick={handleRetry}
                            title="Hay cambios guardados en este dispositivo que aún no se han subido a tu cuenta. Pulsa para reintentar ahora."
                            className="mt-1.5 inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300 transition-colors hover:bg-amber-500/20"
                        >
                            {retrying ? (
                                <RefreshCw className="h-3 w-3 animate-spin" />
                            ) : (
                                <CloudOff className="h-3 w-3" />
                            )}
                            {filesPending > 0 && !pending
                                ? `${filesPending} archivo(s) sin registrar — reintentar`
                                : "Cambios pendientes de sincronizar"}
                        </button>
                    )}
                    {/* Adenda 66 §2: si la nube RECHAZA el guardado, se dice POR QUÉ.
                        Nunca un fallo silencioso: el usuario tiene que poder verlo. */}
                    {syncError && (
                        <p className="mt-1.5 flex items-start gap-1.5 rounded-xl border border-rose-400/25 bg-rose-500/[0.08] px-2.5 py-1.5 text-[11px] leading-relaxed text-rose-200">
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                            <span>
                                <span className="font-medium">La nube rechazó el último guardado.</span>{" "}
                                {syncError} Tus cambios siguen a salvo en este dispositivo y se reintentan solos.
                            </span>
                        </p>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {aclContext.isOwner && (
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 cursor-pointer gap-1.5 border-white/15 text-xs"
                            onClick={() => setLibraryPermsOpen(true)}
                            title="Permisos de TODA la biblioteca (folders y archivos heredan de aquí)"
                        >
                            <ShieldCheck className="h-3.5 w-3.5" /> Permisos
                        </Button>
                    )}
                    <SmartOrganizeButton libraryRef={entityRef} accent={accent} />
                    <SaveToBookmarks libraryRef={entityRef} label="Guardar enlace…" />
                </div>
            </div>

            <FinderView entityRef={entityRef} accent={accent} aclContext={aclContext} compact={compact} />

            {/* ── Permisos de la BIBLIOTECA ENTERA (Adenda 66 §3): nodo raíz de la herencia ── */}
            {libraryPermsOpen && (
                <ShareAccessDialog
                    open
                    onOpenChange={setLibraryPermsOpen}
                    resource={libraryResourceRef(entityRef, title)}
                    scopes={LIBRARY_SCOPES}
                    profileShowcase={entityRef.kind === "user" || entityRef.kind === "profile"}
                    title={`Permisos · ${title}`}
                    description="Permisos de TODA la biblioteca. Cada folder y cada archivo puede tener los suyos propios (y entonces mandan los suyos)."
                />
            )}
        </GlassCard>
    );
}

export default EntityLibraryPanel;
