"use client";

/*
 * create-entity-dialog — CREACIÓN REAL de entidades de la red desde el Hub.
 * Página (os_pages) · Grupo/Comunidad/Grupo de estudio (os_groups con kind)
 * · Evento (os_events). Inserta con owner_id = auth.uid(), slug autogenerado,
 * membresía inicial del creador (os_memberships) y navega a la página creada.
 * Tolerante: sin sesión muestra aviso claro; errores RLS/red visibles (toast).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, Loader2, Globe, Users, GraduationCap, CalendarDays, Landmark } from "lucide-react";
import { toast } from "sonner";

type EntityKindId = "page" | "group" | "community" | "study" | "event";

const KINDS: { id: EntityKindId; label: string; desc: string; icon: typeof Globe }[] = [
    { id: "page", label: "Página", desc: "Presencia pública: proyecto, tema o iniciativa", icon: Globe },
    { id: "group", label: "Grupo", desc: "Círculo con miembros y herramientas", icon: Users },
    { id: "community", label: "Comunidad", desc: "Comunidad amplia (Sangha) con áreas", icon: Landmark },
    { id: "study", label: "Grupo de estudio", desc: "Educativo: temario, exámenes y pizarras", icon: GraduationCap },
    { id: "event", label: "Evento", desc: "Encuentro con fecha, lugar y asistencia", icon: CalendarDays },
];

function slugify(name: string): string {
    return (
        name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
            .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48)
        || `entidad-${Date.now().toString(36)}`
    );
}

export function CreateEntityDialog({ triggerClassName }: { triggerClassName?: string }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [kind, setKind] = useState<EntityKindId>("group");
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [busy, setBusy] = useState(false);

    async function crear() {
        const nombre = name.trim();
        if (!nombre) { toast.error("Ponle un nombre"); return; }
        setBusy(true);
        try {
            const supabase = createClient();
            const { data: auth } = await supabase.auth.getUser();
            const uid = auth.user?.id;
            if (!uid) {
                toast.error("Inicia sesión para crear en la red", {
                    description: "Tu cuenta StarSeed es el ancla soberana de lo que creas.",
                });
                setBusy(false);
                return;
            }
            const slug = `${slugify(nombre)}-${Math.random().toString(36).slice(2, 6)}`;
            const desc = description.trim() || null;

            if (kind === "event") {
                const { error } = await supabase.from("os_events").insert({
                    slug, name: nombre, description: desc, owner_id: uid,
                } as never);
                if (error) throw error;
                try { await supabase.from("os_event_attendance").insert({ event_slug: slug, user_id: uid } as never); } catch { /* opcional */ }
                toast.success("Evento creado");
                setOpen(false);
                router.push(`/evento/${slug}`);
                return;
            }

            if (kind === "page") {
                const { error } = await supabase.from("os_pages").insert({
                    slug, name: nombre, kind: "page", description: desc, owner_id: uid, member_count: 1,
                } as never);
                if (error) throw error;
            } else {
                const groupKind = kind === "study" ? "study" : kind; // group | community | study
                const { error } = await supabase.from("os_groups").insert({
                    slug, name: nombre, kind: groupKind, description: desc, owner_id: uid, member_count: 1,
                } as never);
                if (error) throw error;
            }
            // Membresía inicial del creador (dueño) — habilita bibliotecas/estado del grupo por RLS.
            try {
                await supabase.from("os_memberships").insert({ user_id: uid, group_slug: slug, role: "owner" } as never);
            } catch { /* si ya existe o la policy lo cubre por owner, seguimos */ }

            toast.success(kind === "page" ? "Página creada" : "Creado con éxito");
            setOpen(false);
            setName(""); setDescription("");
            router.push(kind === "page" ? `/pagina/${slug}` : `/grupo/${slug}`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            toast.error("No se pudo crear", { description: msg });
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className={triggerClassName}>
                    <Plus className="mr-1.5 h-4 w-4" /> Crear
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Crear en la red</DialogTitle>
                    <DialogDescription>
                        Páginas, grupos, comunidades, grupos de estudio y eventos — con su
                        biblioteca, miembros y herramientas desde el primer momento.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {KINDS.map((k) => {
                        const Icon = k.icon;
                        const active = kind === k.id;
                        return (
                            <button
                                key={k.id}
                                type="button"
                                onClick={() => setKind(k.id)}
                                className={`cursor-pointer rounded-xl border p-3 text-left transition-colors duration-200 ${
                                    active ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
                                }`}
                            >
                                <Icon className="mb-1.5 h-4 w-4 text-primary" />
                                <div className="text-sm font-medium leading-tight">{k.label}</div>
                                <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{k.desc}</div>
                            </button>
                        );
                    })}
                </div>
                <div className="space-y-3 pt-1">
                    <div className="space-y-1.5">
                        <Label htmlFor="ce-nombre">Nombre</Label>
                        <Input id="ce-nombre" value={name} onChange={(e) => setName(e.target.value)}
                            placeholder="Nombre visible en la red" maxLength={80} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="ce-desc">Descripción (opcional)</Label>
                        <Textarea id="ce-desc" value={description} onChange={(e) => setDescription(e.target.value)}
                            placeholder="Propósito, temas, a quién invita…" rows={3} maxLength={400} />
                    </div>
                    <Button onClick={crear} disabled={busy} className="w-full">
                        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                        Crear {KINDS.find((k) => k.id === kind)?.label.toLowerCase()}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default CreateEntityDialog;
