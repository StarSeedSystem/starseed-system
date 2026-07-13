"use client";

/**
 * SmartOrganizeButton — "Organizar inteligentemente" (Adenda 63 §14).
 * -------------------------------------------------------------------
 * Botón + diálogo para la Biblioteca de una entidad: genera un PLAN de
 * organización (Astraura si está disponible; si no, heurística determinista
 * — src/lib/files/smart-organizer.ts), lo muestra como lista de movimientos
 * con checkbox y lo aplica CON CONFIRMACIÓN usando la API real de
 * entity-library (createFolder + moveItem). Inspirado en Mouzi (hsr88/mouzi).
 *
 * Seguridad al vuelo (Adenda 63 §13): cada ítem del plan se escanea con el
 * escáner de secretos; si alguno contiene posibles secretos se avisa (nunca
 * se bloquea). Defensivo y SSR-safe: nada corre fuera del click del usuario.
 */

import { useCallback, useMemo, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    ArrowRight,
    FolderPlus,
    Loader2,
    ShieldAlert,
    Sparkles,
    Wand2,
} from "lucide-react";
import {
    createFolder,
    moveItem,
    readLibrarySnapshot,
    scanItemInput,
    type EntityRef,
    type LibraryFolder,
    type SavedItem,
} from "@/lib/library/entity-library";
import { summarize } from "@/lib/security/scanner";
import { buildOrganizePlan, type OrganizePlan } from "@/lib/files/smart-organizer";

/* ── Helpers de folders (id ↔ ruta "A/B") ── */

function folderPathOf(folderId: string | null | undefined, folders: LibraryFolder[]): string {
    if (!folderId) return "";
    const byId = new Map(folders.map((f) => [f.id, f] as const));
    const segs: string[] = [];
    let cursor: string | null | undefined = folderId;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
        seen.add(cursor);
        const f = byId.get(cursor);
        if (!f) break;
        segs.unshift(f.name);
        cursor = f.parentId;
    }
    return segs.join("/");
}

/** Crea (o reutiliza) la jerarquía "A/B/C" y devuelve el id del folder hoja. */
async function ensureFolderPath(ref: EntityRef, path: string): Promise<string | null> {
    const segs = path.split("/").map((s) => s.trim()).filter(Boolean);
    let parent: string | null = null;
    for (const seg of segs) {
        // createFolder deduplica por (nombre + padre): devuelve el id existente si ya está.
        const id = await createFolder(ref, seg, parent);
        if (!id) return parent;
        parent = id;
    }
    return parent;
}

export interface SmartOrganizeButtonProps {
    libraryRef: EntityRef;
    accent?: string;
}

export function SmartOrganizeButton({ libraryRef, accent = "#7FB8FF" }: SmartOrganizeButtonProps) {
    const [open, setOpen] = useState(false);
    const [planning, setPlanning] = useState(false);
    const [applying, setApplying] = useState(false);
    const [plan, setPlan] = useState<OrganizePlan | null>(null);
    const [checked, setChecked] = useState<Record<string, boolean>>({});
    const [itemsById, setItemsById] = useState<Map<string, SavedItem>>(new Map());
    const [secWarnings, setSecWarnings] = useState<Record<string, string>>({});
    const [done, setDone] = useState<string | null>(null);

    const generatePlan = useCallback(async () => {
        setPlanning(true);
        setPlan(null);
        setDone(null);
        setSecWarnings({});
        try {
            const doc = readLibrarySnapshot(libraryRef);
            const byId = new Map(doc.items.map((it) => [it.id, it] as const));
            setItemsById(byId);
            const existingFolders = doc.folders.map((f) => folderPathOf(f.id, doc.folders)).filter(Boolean);
            const organizerItems = doc.items
                .filter((it) => it.type !== "alias") // los accesos directos se quedan donde el usuario los puso
                .map((it) => ({
                    id: it.id,
                    name: it.title,
                    kind: it.type,
                    mime: it.mime,
                    updatedAt: it.addedAt,
                    folder: folderPathOf(it.folderId, doc.folders) || null,
                }));
            const result = await buildOrganizePlan(organizerItems, { existingFolders });
            setPlan(result);
            const init: Record<string, boolean> = {};
            const warns: Record<string, string> = {};
            for (const m of result.moves) {
                init[m.id] = true;
                // Seguridad al vuelo (§13): aviso si el ítem contiene posibles secretos.
                const item = byId.get(m.id);
                if (item) {
                    const findings = scanItemInput(item);
                    if (findings.length) warns[m.id] = summarize(findings).message;
                }
            }
            setChecked(init);
            setSecWarnings(warns);
        } catch {
            setPlan({ moves: [], newFolders: [], reasoning: "No se pudo generar el plan.", source: "heuristica" });
        }
        setPlanning(false);
    }, [libraryRef]);

    const handleOpen = useCallback(() => {
        setOpen(true);
        void generatePlan();
    }, [generatePlan]);

    const selectedMoves = useMemo(
        () => (plan?.moves ?? []).filter((m) => checked[m.id]),
        [plan, checked],
    );

    const applyPlan = useCallback(async () => {
        if (!plan || selectedMoves.length === 0) return;
        setApplying(true);
        try {
            const folderIds = new Map<string, string | null>();
            let moved = 0;
            for (const m of selectedMoves) {
                let target = folderIds.get(m.toFolder);
                if (target === undefined) {
                    target = await ensureFolderPath(libraryRef, m.toFolder);
                    folderIds.set(m.toFolder, target ?? null);
                }
                if (target) {
                    await moveItem(libraryRef, m.id, target);
                    moved++;
                }
            }
            setDone(`Organización aplicada: ${moved} ítem${moved === 1 ? "" : "s"} movido${moved === 1 ? "" : "s"}.`);
            setPlan(null);
        } catch {
            setDone("No se pudieron aplicar todos los movimientos. La biblioteca sigue intacta donde falló.");
        }
        setApplying(false);
    }, [plan, selectedMoves, libraryRef]);

    const warnCount = plan ? plan.moves.filter((m) => checked[m.id] && secWarnings[m.id]).length : 0;

    return (
        <>
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpen}
                className="cursor-pointer gap-1.5"
                title="Genera un plan de organización por tipo/tema/fecha y aplícalo con confirmación"
            >
                <Wand2 className="h-3.5 w-3.5" style={{ color: accent }} />
                Organizar inteligentemente
            </Button>

            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setPlan(null); setDone(null); } }}>
                <DialogContent className="max-w-xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Wand2 className="h-4 w-4" style={{ color: accent }} /> Organizar inteligentemente
                        </DialogTitle>
                        <DialogDescription>
                            Propuesta de estructura para esta biblioteca. Nada se mueve hasta que confirmes.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
                        {planning && (
                            <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" /> Generando plan (Astraura o heurística local)…
                            </div>
                        )}

                        {done && !planning && (
                            <p className="rounded-lg border border-emerald-400/25 bg-emerald-500/10 p-3 text-sm text-emerald-300">{done}</p>
                        )}

                        {plan && !planning && (
                            <>
                                <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accent }} />
                                    <div className="min-w-0">
                                        <p className="text-xs text-muted-foreground leading-relaxed">{plan.reasoning}</p>
                                        <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                                            Plan {plan.source === "astraura" ? "generado con Astraura" : "heurístico (local, determinista)"}
                                        </p>
                                    </div>
                                </div>

                                {plan.newFolders.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                        <FolderPlus className="h-3.5 w-3.5" />
                                        Folders nuevos:
                                        {plan.newFolders.map((f) => (
                                            <span key={f} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5">{f}</span>
                                        ))}
                                    </div>
                                )}

                                {warnCount > 0 && (
                                    <p className="flex items-center gap-1.5 rounded-lg border border-amber-400/25 bg-amber-500/10 p-2.5 text-xs text-amber-300">
                                        <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                                        {warnCount} ítem{warnCount === 1 ? "" : "s"} del plan contiene{warnCount === 1 ? "" : "n"} posibles secretos o datos sensibles (marcados abajo). Organizarlos no los comparte; revísalos en Ajustes → Seguridad.
                                    </p>
                                )}

                                {plan.moves.length === 0 ? (
                                    <p className="py-6 text-center text-sm text-muted-foreground">
                                        Nada que mover: todo lo reconocible ya está en su sitio.
                                    </p>
                                ) : (
                                    <ul className="space-y-1">
                                        {plan.moves.map((m) => {
                                            const item = itemsById.get(m.id);
                                            return (
                                                <li key={m.id} className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/20 px-2.5 py-2">
                                                    <Checkbox
                                                        checked={!!checked[m.id]}
                                                        onCheckedChange={(v) => setChecked((prev) => ({ ...prev, [m.id]: v === true }))}
                                                        aria-label={`Incluir «${item?.title ?? m.id}» en la organización`}
                                                    />
                                                    <span className="min-w-0 flex-1 truncate text-xs" title={item?.title}>
                                                        {item?.title ?? m.id}
                                                        {secWarnings[m.id] && (
                                                            <ShieldAlert className="ml-1 inline h-3 w-3 text-amber-400" aria-label={secWarnings[m.id]} />
                                                        )}
                                                    </span>
                                                    <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                                                    <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-muted-foreground">
                                                        {m.toFolder}
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </>
                        )}
                    </div>

                    <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-[10px] text-muted-foreground">Inspirado en Mouzi (hsr88/mouzi) · open-source</p>
                        <div className="flex gap-2">
                            <Button type="button" variant="ghost" size="sm" className="cursor-pointer" onClick={() => setOpen(false)}>
                                Cerrar
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                className="cursor-pointer"
                                disabled={planning || applying || selectedMoves.length === 0}
                                onClick={() => void applyPlan()}
                            >
                                {applying ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                                Aplicar {selectedMoves.length > 0 ? `${selectedMoves.length} movimiento${selectedMoves.length === 1 ? "" : "s"}` : "plan"}
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

export default SmartOrganizeButton;
