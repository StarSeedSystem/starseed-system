"use client";

// ═══════════════════════════════════════════════════════════════════════════
// FreeSectionsBlock — bloques "Sección libre" de contenido markdown
// -----------------------------------------------------------------------------
// Compartido entre grupo/[slug], pagina/[slug] (pestaña "Secciones") y el
// perfil propio (bloque "Secciones"). El estado vive en `entity-layout.ts`
// (entity_state key 'layout'), pasado aquí ya resuelto por el llamador —
// este componente es puramente de presentación + edición (add/editar/quitar).
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import { MessageRenderer } from "@/components/aurora/message-renderer";
import { Plus, Pencil, Trash2, Save, X, FileText } from "lucide-react";
import type { FreeSection } from "@/lib/entity-layout";

export interface FreeSectionsBlockProps {
    sections: FreeSection[];
    isOwner: boolean;
    accent?: string;
    onAdd: (title: string, body: string) => Promise<void> | void;
    onUpdate: (id: string, patch: { title?: string; body?: string }) => Promise<void> | void;
    onRemove: (id: string) => Promise<void> | void;
    emptyHint?: string;
}

export function FreeSectionsBlock({
    sections, isOwner, accent = "#E9C46A", onAdd, onUpdate, onRemove, emptyHint,
}: FreeSectionsBlockProps) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draftTitle, setDraftTitle] = useState("");
    const [draftBody, setDraftBody] = useState("");
    const [creating, setCreating] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newBody, setNewBody] = useState("");
    const [saving, setSaving] = useState(false);

    const startEdit = (s: FreeSection) => {
        setEditingId(s.id);
        setDraftTitle(s.title);
        setDraftBody(s.body);
    };

    const saveEdit = async () => {
        if (!editingId) return;
        setSaving(true);
        try {
            await onUpdate(editingId, { title: draftTitle.trim() || "Sección libre", body: draftBody });
        } finally {
            setSaving(false);
            setEditingId(null);
        }
    };

    const submitNew = async () => {
        if (!newBody.trim()) return;
        setSaving(true);
        try {
            await onAdd(newTitle, newBody);
        } finally {
            setSaving(false);
            setNewTitle("");
            setNewBody("");
            setCreating(false);
        }
    };

    return (
        <div className="space-y-4">
            {sections.length === 0 && !creating && (
                <div className="rounded-xl border border-dashed border-white/12 p-8 text-center text-sm text-muted-foreground">
                    <FileText className="mx-auto mb-2 h-6 w-6 opacity-30" />
                    {emptyHint || "Aún no hay secciones libres."}
                </div>
            )}

            {sections.map((s) => (
                <GlassCard key={s.id} className="p-4">
                    {editingId === s.id ? (
                        <div className="space-y-2">
                            <Input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="Título de la sección" />
                            <textarea
                                value={draftBody}
                                onChange={(e) => setDraftBody(e.target.value)}
                                rows={6}
                                className="w-full resize-none rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm focus:border-primary/40 focus:outline-none"
                                placeholder="Contenido en markdown…"
                            />
                            <div className="flex items-center gap-2">
                                <Button size="sm" className="cursor-pointer gap-1.5" onClick={() => void saveEdit()} disabled={saving}>
                                    <Save className="h-3.5 w-3.5" /> Guardar
                                </Button>
                                <Button size="sm" variant="outline" className="cursor-pointer gap-1.5" onClick={() => setEditingId(null)}>
                                    <X className="h-3.5 w-3.5" /> Cancelar
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="mb-2 flex items-start justify-between gap-2">
                                <h3 className="font-headline text-base font-semibold" style={{ color: accent }}>{s.title}</h3>
                                {isOwner && (
                                    <div className="flex shrink-0 items-center gap-1">
                                        <Button variant="ghost" size="icon" className="h-7 w-7 cursor-pointer" onClick={() => startEdit(s)} aria-label={`Editar ${s.title}`}>
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 cursor-pointer text-muted-foreground hover:text-destructive"
                                            onClick={() => void onRemove(s.id)}
                                            aria-label={`Eliminar ${s.title}`}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                )}
                            </div>
                            <MessageRenderer text={s.body} media={false} />
                        </>
                    )}
                </GlassCard>
            ))}

            {isOwner && (
                creating ? (
                    <GlassCard className="space-y-2 border-dashed p-4">
                        <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Título de la nueva sección" autoFocus />
                        <textarea
                            value={newBody}
                            onChange={(e) => setNewBody(e.target.value)}
                            rows={5}
                            className="w-full resize-none rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm focus:border-primary/40 focus:outline-none"
                            placeholder="Contenido en markdown…"
                        />
                        <div className="flex items-center gap-2">
                            <Button size="sm" className="cursor-pointer gap-1.5" onClick={() => void submitNew()} disabled={saving || !newBody.trim()}>
                                <Plus className="h-3.5 w-3.5" /> Añadir
                            </Button>
                            <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => setCreating(false)}>Cancelar</Button>
                        </div>
                    </GlassCard>
                ) : (
                    <Button variant="outline" className="cursor-pointer gap-1.5" onClick={() => setCreating(true)}>
                        <Plus className="h-4 w-4" /> Añadir sección libre
                    </Button>
                )
            )}
        </div>
    );
}

export default FreeSectionsBlock;
