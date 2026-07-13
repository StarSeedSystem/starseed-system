"use client";

// ════════════════════════════════════════════════════════════════════════════
// CreateRepoDialog — crear un repositorio nuevo o convertir un folder
// existente en repositorio (Adenda 65, §16). Formulario puro: el llamador
// decide qué hacer con el valor (`createRepo` o `convertFolderToRepo`).
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GitBranch, Loader2 } from "lucide-react";
import { PUBLIC_CATEGORIES } from "@/lib/library/public-catalog";
import { CATEGORY_LABEL } from "@/components/library/finder/publish-dialog";

const LICENSE_PRESETS = [
    "MIT",
    "Apache-2.0",
    "GPL-3.0-or-later",
    "AGPL-3.0-or-later",
    "CC-BY-4.0",
    "CC0-1.0",
    "Ninguna (todos los derechos reservados)",
];

export interface CreateRepoFormInitial {
    name?: string;
    description?: string;
    visibility?: "privado" | "publico";
    category?: string;
    license?: string;
    topics?: string;
    readme?: string;
}

export interface CreateRepoSubmitValue {
    name: string;
    description?: string;
    visibility: "privado" | "publico";
    category?: string;
    license?: string;
    topics: string[];
    readme: string;
}

export interface CreateRepoDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Si se pasa, es modo "convertir folder existente": el nombre queda fijo. */
    fixedName?: string;
    initial?: CreateRepoFormInitial;
    title?: string;
    submitLabel?: string;
    busy?: boolean;
    onSubmit: (value: CreateRepoSubmitValue) => void;
}

export function CreateRepoDialog({ open, onOpenChange, fixedName, initial, title, submitLabel, busy, onSubmit }: CreateRepoDialogProps) {
    const [name, setName] = useState(fixedName ?? initial?.name ?? "");
    const [description, setDescription] = useState(initial?.description ?? "");
    const [visibility, setVisibility] = useState<"privado" | "publico">(initial?.visibility ?? "privado");
    const [category, setCategory] = useState<string>(initial?.category ?? "otro");
    const [license, setLicense] = useState(initial?.license ?? "MIT");
    const [topics, setTopics] = useState(initial?.topics ?? "");
    const [readme, setReadme] = useState(initial?.readme ?? "");

    useEffect(() => {
        if (open) {
            setName(fixedName ?? initial?.name ?? "");
            setDescription(initial?.description ?? "");
            setVisibility(initial?.visibility ?? "privado");
            setCategory(initial?.category ?? "otro");
            setLicense(initial?.license ?? "MIT");
            setTopics(initial?.topics ?? "");
            setReadme(initial?.readme ?? "");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- solo re-sembrar al abrir
    }, [open]);

    const handleSubmit = () => {
        if (!name.trim()) return;
        onSubmit({
            name: name.trim(),
            description: description.trim() || undefined,
            visibility,
            category,
            license: license.trim() || undefined,
            topics: topics.split(",").map((t) => t.trim()).filter(Boolean),
            readme,
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto border-white/10 bg-black/90 text-white backdrop-blur-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
                        <GitBranch className="h-4 w-4 text-lime-300" /> {title ?? "Nuevo repositorio"}
                    </DialogTitle>
                    <DialogDescription>Estructura estilo GitHub: folder raíz + README + releases, dentro de tu Biblioteca.</DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Nombre</label>
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={!!fixedName}
                            placeholder="mi-repositorio"
                            className="h-9 border-white/15 bg-black/30 text-xs disabled:opacity-60"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Descripción</label>
                        <Input
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="De qué trata este repositorio…"
                            className="h-9 border-white/15 bg-black/30 text-xs"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Visibilidad</label>
                            <Select value={visibility} onValueChange={(v) => setVisibility(v as "privado" | "publico")}>
                                <SelectTrigger className="h-9 border-white/15 bg-black/30 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="border-white/10 bg-black/90 backdrop-blur-xl">
                                    <SelectItem value="privado" className="text-xs">Privado</SelectItem>
                                    <SelectItem value="publico" className="text-xs">Público (Librería)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Categoría</label>
                            <Select value={category} onValueChange={setCategory}>
                                <SelectTrigger className="h-9 border-white/15 bg-black/30 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="border-white/10 bg-black/90 backdrop-blur-xl">
                                    {PUBLIC_CATEGORIES.map((c) => (
                                        <SelectItem key={c} value={c} className="text-xs">
                                            {CATEGORY_LABEL[c]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Licencia</label>
                            <Input value={license} onChange={(e) => setLicense(e.target.value)} list="repo-license-presets" className="h-9 border-white/15 bg-black/30 text-xs" />
                            <datalist id="repo-license-presets">
                                {LICENSE_PRESETS.map((l) => (
                                    <option key={l} value={l} />
                                ))}
                            </datalist>
                        </div>
                        <div>
                            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Temas / tags</label>
                            <Input value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="cyberdelic, ui, tema" className="h-9 border-white/15 bg-black/30 text-xs" />
                        </div>
                    </div>
                    <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">README.md</label>
                        <Textarea
                            value={readme}
                            onChange={(e) => setReadme(e.target.value)}
                            rows={6}
                            placeholder={`# ${name || "Mi repositorio"}\n\nDescripción…`}
                            className="border-white/15 bg-black/30 font-mono text-xs"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        onClick={handleSubmit}
                        disabled={busy || !name.trim()}
                        className="cursor-pointer gap-2 bg-lime-600 text-white hover:bg-lime-500"
                    >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />}
                        {submitLabel ?? "Crear repositorio"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default CreateRepoDialog;
