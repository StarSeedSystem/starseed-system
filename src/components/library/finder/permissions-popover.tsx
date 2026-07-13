"use client";

// ════════════════════════════════════════════════════════════════════════════
// PermissionsPopover — panel "Permisos…" de un ítem/folder de Biblioteca
// ----------------------------------------------------------------------------
// Busca USUARIOS y GRUPOS reales para añadirlos a las listas read/write de la
// ACL, reutilizando el directorio real `os_profiles` (username/display_name)
// y `os_groups`/`os_pages` (nombre/slug) vía `lib/social/os-profiles.ts`
// (searchUsers/searchGroups) — capa ya construida y probada, no se duplica
// aquí ninguna query. `ACLEntry.id` para `kind:"user"` es el `user_id` real
// (uuid de auth.users), que es lo que compara `finder-types.ts` contra
// `ctx.userId` al resolver visibilidad/escritura.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ShieldCheck, Search, User, Users, X, Eye, Pencil, Loader2, Globe2 } from "lucide-react";
import { searchUsers, searchGroups } from "@/lib/social/os-profiles";
import type { ACLEntry, ItemACL } from "@/lib/library/entity-library";

interface SearchResult {
    kind: "user" | "group";
    id: string;
    label: string;
    hint?: string;
}

async function searchEntities(query: string): Promise<SearchResult[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    try {
        const [users, groups] = await Promise.all([searchUsers(q, 8), searchGroups(q, 8)]);
        const out: SearchResult[] = [];
        for (const u of users) {
            out.push({ kind: "user", id: u.userId, label: u.displayName || u.username, hint: `@${u.username}` });
        }
        for (const g of groups) {
            if (g.kind === "pagina") continue; // páginas no son "grupos" a efectos de ACL — solo comunidad/grupo
            out.push({ kind: "group", id: g.slug, label: g.name || g.slug, hint: "Grupo" });
        }
        return out;
    } catch {
        return [];
    }
}

function EntryRow({ entry, onRemove, canEdit }: { entry: ACLEntry; onRemove: () => void; canEdit: boolean }) {
    const Icon = entry.kind === "user" ? User : Users;
    return (
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-xs">{entry.label || entry.id}</span>
            {canEdit && (
                <button
                    type="button"
                    onClick={onRemove}
                    className="cursor-pointer text-muted-foreground hover:text-rose-300"
                    aria-label={`Quitar ${entry.label ?? entry.id}`}
                >
                    <X className="h-3 w-3" />
                </button>
            )}
        </div>
    );
}

function AclListEditor({
    label,
    icon: Icon,
    entries,
    onAdd,
    onRemove,
}: {
    label: string;
    icon: typeof Eye;
    entries: ACLEntry[];
    onAdd: (r: SearchResult) => void;
    onRemove: (id: string, kind: "user" | "group") => void;
}) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        let alive = true;
        if (query.trim().length < 2) {
            setResults([]);
            return;
        }
        setSearching(true);
        const t = setTimeout(() => {
            searchEntities(query).then((r) => {
                if (alive) {
                    setResults(r);
                    setSearching(false);
                }
            });
        }, 250);
        return () => {
            alive = false;
            clearTimeout(t);
        };
    }, [query]);

    return (
        <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <Icon className="h-3 w-3" /> {label}
            </label>

            {entries.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                    {label.toLowerCase().includes("lectura")
                        ? "Todos los que ya acceden a esta biblioteca pueden ver."
                        : "Todos los que ya acceden pueden editar."}
                </p>
            ) : (
                <div className="space-y-1">
                    {entries.map((e) => (
                        <EntryRow key={`${e.kind}:${e.id}`} entry={e} canEdit onRemove={() => onRemove(e.id, e.kind)} />
                    ))}
                </div>
            )}

            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar persona o grupo…"
                    className="h-8 rounded-lg border-white/10 bg-black/20 pl-7 text-[11px]"
                />
            </div>
            {searching && (
                <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Buscando…
                </p>
            )}
            {!searching && query.trim().length >= 2 && results.length === 0 && (
                <p className="text-[10px] text-muted-foreground">
                    Sin resultados para «{query}». Prueba con el nombre exacto de perfil o grupo.
                </p>
            )}
            {results.length > 0 && (
                <div className="space-y-1 rounded-lg border border-white/10 bg-black/20 p-1">
                    {results.map((r) => (
                        <button
                            key={`${r.kind}:${r.id}`}
                            type="button"
                            onClick={() => {
                                onAdd(r);
                                setQuery("");
                                setResults([]);
                            }}
                            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-white/10"
                        >
                            {r.kind === "user" ? <User className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
                            <span className="min-w-0 flex-1 truncate">{r.label}</span>
                            {r.hint && <span className="shrink-0 text-[10px] text-muted-foreground">{r.hint}</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export interface PermissionsPopoverProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    acl: ItemACL | undefined;
    onSave: (acl: ItemACL | null) => Promise<void> | void;
}

/** Panel de permisos: diálogo centrado (sin anchor) — se invoca desde el menú
 * contextual, no desde un botón visible, así que un Dialog centrado encaja
 * mejor que un Popover (que requeriría un elemento ancla en el árbol). */
export function PermissionsPopover({ open, onOpenChange, title, acl, onSave }: PermissionsPopoverProps) {
    const [readList, setReadList] = useState<ACLEntry[]>(acl?.read ?? []);
    const [writeList, setWriteList] = useState<ACLEntry[]>(acl?.write ?? []);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            setReadList(acl?.read ?? []);
            setWriteList(acl?.write ?? []);
        }
    }, [open, acl]);

    const addRead = (r: SearchResult) => {
        if (readList.some((e) => e.kind === r.kind && e.id === r.id)) return;
        setReadList((prev) => [...prev, { kind: r.kind, id: r.id, label: r.label }]);
    };
    const addWrite = (r: SearchResult) => {
        if (writeList.some((e) => e.kind === r.kind && e.id === r.id)) return;
        setWriteList((prev) => [...prev, { kind: r.kind, id: r.id, label: r.label }]);
    };
    const removeRead = (id: string, kind: "user" | "group") =>
        setReadList((prev) => prev.filter((e) => !(e.id === id && e.kind === kind)));
    const removeWrite = (id: string, kind: "user" | "group") =>
        setWriteList((prev) => prev.filter((e) => !(e.id === id && e.kind === kind)));

    const handleSave = async () => {
        setSaving(true);
        try {
            const next = readList.length === 0 && writeList.length === 0 ? null : { read: readList, write: writeList };
            await onSave(next);
            toast.success("Permisos actualizados");
            onOpenChange(false);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm border-white/10 bg-black/90 text-white backdrop-blur-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
                        <ShieldCheck className="h-4 w-4 text-primary" /> Permisos · {title}
                    </DialogTitle>
                </DialogHeader>
                <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                    <Globe2 className="mt-0.5 h-3 w-3 shrink-0" />
                    Sin restricciones (vacío) = visible/editable por todo el que ya accede a esta biblioteca.
                </p>

                <div className="space-y-4">
                    <AclListEditor label="Puede leer" icon={Eye} entries={readList} onAdd={addRead} onRemove={removeRead} />
                    <AclListEditor label="Puede editar" icon={Pencil} entries={writeList} onAdd={addWrite} onRemove={removeWrite} />
                </div>

                <Button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className={cn("mt-2 w-full cursor-pointer gap-2 bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500")}
                >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                    Guardar permisos
                </Button>
            </DialogContent>
        </Dialog>
    );
}

export default PermissionsPopover;
