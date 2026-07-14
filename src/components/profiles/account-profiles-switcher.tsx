"use client";

/*
 * AccountProfilesSwitcher — selector compacto de PERFILES MÚLTIPLES por
 * cuenta (personal/cívico/artístico/profesional/custom). Distinto de
 * src/components/profile/profile-switcher.tsx (identidad de la Cuenta/
 * StarSeed ID) — esto son las FACETAS públicas vinculadas a esa cuenta única
 * (os_account_profiles, SOP §10).
 *
 * Montado en:
 *   · Ajustes → Cuenta y Sincronización (encima del panel realtime)
 *   · /cuenta (si hay superficie natural)
 *
 * Avatar+nombre del perfil activo + menú desplegable para cambiar/crear/
 * editar. El editor de perfil (nombre, handle, tipo, bio) permite fijar
 * avatar/cover pegando una URL o subiendo/eligiendo un archivo con el
 * picker universal (`AttachFilePickerButton`), con vista previa en vivo.
 */

import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GlassCard } from "@/components/ui/glass-card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    ChevronsUpDown,
    Star,
    Pencil,
    Plus,
    Users2,
    Check,
    Loader2,
    Trash2,
    ImagePlus,
    ImageOff,
    Crop,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    useActiveProfile,
    createProfile,
    updateProfile,
    deleteProfile,
    setDefaultProfile,
    profileKindLabel,
    type AccountProfile,
    type ProfileKind,
} from "@/lib/profiles/profiles";
import { AttachFilePickerButton } from "@/components/files/universal-file-picker";
import { uploadFile } from "@/lib/files/os-files";
import { ImageCropperDialog } from "@/components/ui/image-cropper-dialog";
import { toast } from "sonner";
import { useSearchParams, useRouter } from "next/navigation";
import { useAccount } from "@/context/account-context";

const KIND_OPTIONS: ProfileKind[] = ["personal", "civic", "artistic", "professional", "custom"];

function initialsOf(label: string): string {
    const parts = (label || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "SS";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

interface EditorState {
    open: boolean;
    mode: "create" | "edit";
    id?: string;
    name: string;
    handle: string;
    kind: ProfileKind;
    bio: string;
    avatarUrl: string;
    coverUrl: string;
    visibility: "public" | "private" | "contacts";
}

function emptyEditor(mode: "create" | "edit"): EditorState {
    return { open: true, mode, name: "", handle: "", kind: "custom", bio: "", avatarUrl: "", coverUrl: "", visibility: "public" };
}

function editorFromProfile(p: AccountProfile): EditorState {
    return {
        open: true,
        mode: "edit",
        id: p.id,
        name: p.name,
        handle: p.handle ?? "",
        kind: p.kind,
        bio: p.bio ?? "",
        avatarUrl: p.avatarUrl ?? "",
        coverUrl: p.coverUrl ?? "",
        visibility: p.visibility ?? "public",
    };
}

export function AccountProfilesSwitcher({ compact = false }: { compact?: boolean }) {
    const { profile: mainProfile } = useAccount();
    const { profile, profiles, loading, setActive } = useActiveProfile();
    const [editor, setEditor] = useState<EditorState | null>(null);
    const [saving, setSaving] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const searchParams = useSearchParams();
    const justSavedRef = useRef(false);
    const router = useRouter();

    useEffect(() => {
        if (justSavedRef.current) return;
        if (!loading && !editor) {
            if (searchParams.get("createProfile") === "true") {
                setEditor(emptyEditor("create"));
                // Remove param without redirecting to a different page
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.delete("createProfile");
                router.replace(newUrl.pathname + newUrl.search, { scroll: false });
            } else if (profiles.length === 0) {
                setEditor(emptyEditor("create"));
            }
        }
    }, [searchParams, loading, editor, router, profiles.length, mainProfile]);

    const sorted = useMemo(
        () => [...profiles].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name, "es")),
        [profiles],
    );

    const closeEditor = useCallback(() => setEditor(null), []);

    const saveEditor = useCallback(async () => {
        if (!editor) return;
        if (!editor.handle?.trim()) {
            toast.error("Debes ingresar un Handle (@) para crear tu perfil.");
            return;
        }
        
        setSaving(true);
        try {
            const name = editor.name.trim() || "Sin nombre";
            if (editor.mode === "create") {
                const input = {
                    name,
                    handle: editor.handle.trim(),
                    kind: editor.kind,
                    bio: editor.bio || null,
                    avatarUrl: editor.avatarUrl || null,
                    coverUrl: editor.coverUrl || null,
                    visibility: editor.visibility,
                };
                console.log("Creando perfil con:", input);
                let created = null;
                try {
                    created = await createProfile(input);
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e ?? "");
                    toast.error(msg || "Error al crear el perfil.");
                    return;
                }
                if (!created) {
                    toast.error("Error al crear el perfil. Revisa la consola.");
                    return;
                }
                
                if (created) {
                    setActive(created.id);
                    
                    // Sync to Main Identity (os_profiles) if this is their very first facet,
                    // so the Sovereign Identity form also gets populated automatically.
                    if (profiles.length === 0 || !mainProfile || (!mainProfile.handle && !mainProfile.username)) {
                        const { updateMyProfile } = await import("@/lib/social/os-profiles");
                        const res = await updateMyProfile({
                            displayName: name,
                            username: editor.handle.trim(),
                            avatarUrl: editor.avatarUrl || undefined,
                            bio: editor.bio || undefined,
                            searchable: true,
                        });
                        if (!res.ok && res.error) {
                            console.error("No se pudo sincronizar la identidad soberana:", res.error);
                            toast.error(res.error.includes("duplicate") ? "Ese handle ya está en uso." : "Error sincronizando identidad principal.");
                        }
                    }
                    
                    setEditor(null);
                    
                    justSavedRef.current = true;
                    setTimeout(() => { justSavedRef.current = false; }, 2000);

                    // Always redirect to the new profile so they can see it immediately
                    router.push(`/profile/${editor.handle.trim()}`);
                }
            } else if (editor.id) {
                await updateProfile(editor.id, {
                    name,
                    handle: editor.handle.trim(),
                    kind: editor.kind,
                    bio: editor.bio || null,
                    avatarUrl: editor.avatarUrl || null,
                    coverUrl: editor.coverUrl || null,
                    visibility: editor.visibility,
                });
                setEditor(null);
            }
        } finally {
            setSaving(false);
        }
    }, [editor, setActive, profiles.length, router, mainProfile]);

    const removeProfile = useCallback(async (id: string) => {
        if (typeof window !== "undefined" && !window.confirm("¿Eliminar este perfil? No se puede deshacer.")) return;
        const ok = await deleteProfile(id);
        if (ok && profile?.id === id) {
            const next = profiles.find((p) => p.id !== id);
            if (next) setActive(next.id);
        }
    }, [profile, profiles, setActive]);

    if (loading) {
        return (
            <GlassCard intensity="low" className="flex items-center gap-2 p-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Cargando tus perfiles…</span>
            </GlassCard>
        );
    }

    if (profiles.length === 0) {
        return (
            <GlassCard intensity="low" className="flex items-center justify-between gap-2 p-3">
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Users2 className="h-4 w-4" /> Sin perfiles todavía
                </span>
                <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-white/15 text-xs cursor-pointer"
                    onClick={() => setEditor(emptyEditor("create"))}
                >
                    <Plus className="h-3.5 w-3.5" /> Crear perfil
                </Button>
                {editor && (
                    <ProfileEditorDialog
                        editor={editor}
                        saving={saving}
                        onChange={setEditor}
                        onClose={closeEditor}
                        onSave={saveEditor}
                    />
                )}
            </GlassCard>
        );
    }

    return (
        <>
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        className={cn(
                            "flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left transition-colors hover:bg-white/[0.06] cursor-pointer",
                            compact && "w-auto",
                        )}
                    >
                        <Avatar className="h-8 w-8 shrink-0 border border-white/10">
                            {profile?.avatarUrl ? <AvatarImage src={profile.avatarUrl} alt={profile.name} /> : null}
                            <AvatarFallback className="bg-gradient-to-br from-primary/50 to-accent/50 text-[11px] font-bold">
                                {initialsOf(profile?.name ?? "")}
                            </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold leading-tight">{profile?.name ?? "Perfil"}</p>
                            <p className="truncate text-[10px] text-muted-foreground leading-tight">
                                {profileKindLabel(profile?.kind ?? "personal")}
                                {profile?.handle ? ` · @${profile.handle}` : ""}
                            </p>
                        </div>
                        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72 border-white/10 bg-black/85 backdrop-blur-xl">
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        Tus perfiles
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-white/5" />
                    {sorted.map((p) => {
                        const active = p.id === profile?.id;
                        return (
                            <DropdownMenuItem
                                key={p.id}
                                className={cn("flex items-center gap-2.5 cursor-pointer py-2", active && "bg-primary/10")}
                                onSelect={(e) => {
                                    e.preventDefault();
                                    setActive(p.id);
                                }}
                            >
                                <Avatar className="h-7 w-7 shrink-0 border border-white/10">
                                    {p.avatarUrl ? <AvatarImage src={p.avatarUrl} alt={p.name} /> : null}
                                    <AvatarFallback className="bg-gradient-to-br from-primary/40 to-accent/40 text-[10px] font-bold">
                                        {initialsOf(p.name)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-semibold">{p.name}</p>
                                    <p className="truncate text-[10px] text-muted-foreground">
                                        {profileKindLabel(p.kind)}{p.handle ? ` · @${p.handle}` : ""}
                                    </p>
                                </div>
                                {p.isDefault && <Star className="h-3 w-3 shrink-0 text-amber-300 fill-amber-300" />}
                                {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                                <button
                                    type="button"
                                    title="Editar perfil"
                                    aria-label="Editar perfil"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setMenuOpen(false);
                                        setEditor(editorFromProfile(p));
                                    }}
                                    className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground/70 transition-colors hover:bg-white/10 hover:text-foreground cursor-pointer"
                                >
                                    <Pencil className="h-3 w-3" />
                                </button>
                                {profiles.length > 1 && (
                                    <button
                                        type="button"
                                        title="Eliminar perfil"
                                        aria-label="Eliminar perfil"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            void removeProfile(p.id);
                                        }}
                                        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground/70 transition-colors hover:bg-red-500/15 hover:text-red-300 cursor-pointer"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                )}
                            </DropdownMenuItem>
                        );
                    })}
                    <DropdownMenuSeparator className="bg-white/5" />
                    <DropdownMenuItem
                        className="flex items-center gap-2 cursor-pointer text-primary"
                        onSelect={(e) => {
                            e.preventDefault();
                            setMenuOpen(false);
                            setEditor(emptyEditor("create"));
                        }}
                    >
                        <Plus className="h-3.5 w-3.5" /> Crear nuevo perfil
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {editor && (
                <ProfileEditorDialog
                    editor={editor}
                    saving={saving}
                    onChange={setEditor}
                    onClose={closeEditor}
                    onSave={saveEditor}
                    onMakeDefault={
                        editor.mode === "edit" && editor.id
                            ? () => void setDefaultProfile(editor.id!)
                            : undefined
                    }
                />
            )}
        </>
    );
}

function ProfileEditorDialog({
    editor,
    saving,
    onChange,
    onClose,
    onSave,
    onMakeDefault,
}: {
    editor: EditorState;
    saving: boolean;
    onChange: (next: EditorState) => void;
    onClose: () => void;
    onSave: () => void;
    onMakeDefault?: () => void;
}) {
    const [cropper, setCropper] = useState<{ open: boolean; type: "avatar" | "cover"; url: string } | null>(null);

    const handleCropComplete = async (blob: Blob) => {
        if (!cropper) return;
        const file = new File([blob], `cropped-${cropper.type}-${Date.now()}.jpg`, { type: "image/jpeg" });
        const res = await uploadFile(file, { folder: `perfil/${cropper.type}`, isPublic: true });
        if (res.ok && res.file?.url) {
            if (cropper.type === "avatar") {
                onChange({ ...editor, avatarUrl: res.file.url });
            } else {
                onChange({ ...editor, coverUrl: res.file.url });
            }
        } else {
            toast.error(res.error || "Error al subir la imagen recortada.");
        }
        setCropper(null);
    };

    return (
        <Dialog open={editor.open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-md border-white/10 bg-black/90 backdrop-blur-2xl">
                <DialogHeader>
                    <DialogTitle>{editor.mode === "create" ? "Crear perfil" : "Editar perfil"}</DialogTitle>
                    <DialogDescription>
                        Facetas públicas vinculadas a tu Cuenta soberana: personal, cívico, artístico, profesional o personalizado.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-1">
                    <div>
                        <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Nombre</label>
                        <Input
                            value={editor.name}
                            onChange={(e) => onChange({ ...editor, name: e.target.value })}
                            placeholder="Nombre del perfil"
                            className="bg-black/30 border-white/10"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Handle (@)</label>
                        <Input
                            value={editor.handle}
                            onChange={(e) => onChange({ ...editor, handle: e.target.value })}
                            placeholder="tu_perfil"
                            className="bg-black/30 border-white/10"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Tipo</label>
                        <div className="flex flex-wrap gap-1.5">
                            {KIND_OPTIONS.map((k) => (
                                <button
                                    key={k}
                                    type="button"
                                    onClick={() => onChange({ ...editor, kind: k })}
                                    className={cn(
                                        "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer",
                                        editor.kind === k
                                            ? "border-primary/50 bg-primary/15 text-primary"
                                            : "border-white/10 text-muted-foreground hover:bg-white/5",
                                    )}
                                >
                                    {profileKindLabel(k)}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Visibilidad</label>
                        <div className="flex gap-2">
                            {(["public", "private", "contacts"] as const).map((v) => (
                                <button
                                    key={v}
                                    type="button"
                                    onClick={() => onChange({ ...editor, visibility: v })}
                                    className={cn(
                                        "rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors cursor-pointer text-center",
                                        editor.visibility === v
                                            ? "border-primary/50 bg-primary/15 text-primary"
                                            : "border-white/10 text-muted-foreground hover:bg-white/5"
                                    )}
                                >
                                    {v === "public" ? "Público" : v === "private" ? "Privado" : "Solo Contactos"}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Bio</label>
                        <Textarea
                            value={editor.bio}
                            onChange={(e) => onChange({ ...editor, bio: e.target.value })}
                            placeholder="Una línea sobre este perfil…"
                            className="min-h-[64px] bg-black/30 border-white/10"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Avatar</label>
                            <div className="flex items-center gap-2">
                                <Avatar className="h-12 w-12 shrink-0 border border-white/10">
                                    {editor.avatarUrl ? <AvatarImage src={editor.avatarUrl} alt={editor.name} /> : null}
                                    <AvatarFallback className="bg-gradient-to-br from-primary/50 to-accent/50 text-[11px] font-bold">
                                        {initialsOf(editor.name)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1 space-y-1.5">
                                    <Input
                                        value={editor.avatarUrl}
                                        onChange={(e) => onChange({ ...editor, avatarUrl: e.target.value })}
                                        placeholder="https://…"
                                        className="bg-black/30 border-white/10"
                                    />
                                    <AttachFilePickerButton
                                        onPick={(attachments) => {
                                            const picked = attachments[0];
                                            if (picked?.url) setCropper({ open: true, type: "avatar", url: picked.url });
                                        }}
                                        accept="image/*"
                                        folder="perfil/avatar"
                                        title="Elegir avatar"
                                        hideTabs={["neuronas"]}
                                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.03] px-2 py-1 text-[11px] font-medium text-white/75 transition-colors duration-200 hover:bg-white/10"
                                    >
                                        <ImagePlus className="h-3 w-3" /> Subir…
                                    </AttachFilePickerButton>
                                    {editor.avatarUrl && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="w-full gap-1.5 h-7 text-[11px] border-white/15 bg-white/[0.03] cursor-pointer"
                                            onClick={() => setCropper({ open: true, type: "avatar", url: editor.avatarUrl })}
                                        >
                                            <Crop className="size-3" /> Recortar
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Portada</label>
                            <div className="space-y-1.5">
                                <div
                                    className={cn(
                                        "flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border bg-black/30 bg-cover bg-center",
                                        editor.coverUrl ? "border-white/10" : "border-dashed border-white/15",
                                    )}
                                    style={editor.coverUrl ? { backgroundImage: `url(${editor.coverUrl})` } : undefined}
                                >
                                    {!editor.coverUrl && (
                                        <span className="flex flex-col items-center gap-1 text-muted-foreground/60">
                                            <ImageOff className="h-4 w-4" />
                                            <span className="text-[10px]">Sin portada</span>
                                        </span>
                                    )}
                                </div>
                                <Input
                                    value={editor.coverUrl}
                                    onChange={(e) => onChange({ ...editor, coverUrl: e.target.value })}
                                    placeholder="https://…"
                                    className="bg-black/30 border-white/10"
                                />
                                <AttachFilePickerButton
                                    onPick={(attachments) => {
                                        const picked = attachments[0];
                                        if (picked?.url) setCropper({ open: true, type: "cover", url: picked.url });
                                    }}
                                    accept="image/*"
                                    folder="perfil/cover"
                                    title="Elegir portada"
                                    hideTabs={["neuronas"]}
                                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.03] px-2 py-1 text-[11px] font-medium text-white/75 transition-colors duration-200 hover:bg-white/10"
                                >
                                    <ImagePlus className="h-3 w-3" /> Subir…
                                </AttachFilePickerButton>
                                {editor.coverUrl && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="w-full gap-1.5 h-7 text-[11px] border-white/15 bg-white/[0.03] cursor-pointer"
                                        onClick={() => setCropper({ open: true, type: "cover", url: editor.coverUrl })}
                                    >
                                        <Crop className="size-3" /> Recortar
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                    {onMakeDefault && (
                        <button
                            type="button"
                            onClick={onMakeDefault}
                            className="flex w-full items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-white/5 cursor-pointer"
                        >
                            <Star className="h-3.5 w-3.5" /> Marcar como perfil predeterminado
                        </button>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" className="border-white/15 cursor-pointer" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button className="gap-1.5 cursor-pointer" disabled={saving} onClick={onSave}>
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        Guardar
                    </Button>
                </DialogFooter>
            </DialogContent>
            {cropper && (
                <ImageCropperDialog
                    open={cropper.open}
                    onOpenChange={(open) => !open && setCropper(null)}
                    imageSrc={cropper.url}
                    mode={cropper.type}
                    onCropComplete={handleCropComplete}
                />
            )}
        </Dialog>
    );
}

/** Badge compacto de solo-lectura (perfil activo) para cabeceras densas. */
export function ActiveProfileBadge() {
    const { profile } = useActiveProfile();
    if (!profile) return null;
    return (
        <Badge variant="outline" className="gap-1.5 border-primary/30 bg-primary/5 text-primary text-[10px]">
            <Users2 className="h-3 w-3" /> {profile.name}
        </Badge>
    );
}
