// src/components/social/entity-editor-dialog.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Diálogo para CREAR o EDITAR entidades sociales de StarSeed OS (páginas, grupos
// y eventos) persistiendo en Supabase (tablas os_*). Reutiliza los componentes
// de ui (Dialog, Input, Button, Select, Label, Textarea).
//
// Modos:
//   · Crear:  <EntityEditorDialog open mode="create" defaultType="page" ... />
//   · Editar: <EntityEditorDialog open mode="edit" entity={...} ... />
//
// Al guardar:
//   · Si no hay sesión → muestra aviso con enlace a /login (no navega).
//   · Al éxito en CREAR → cierra y navega al detalle (router.push).
//   · Al éxito en EDITAR → cierra y refresca (onSaved / router.refresh()).
//
// SSR-safe: 'use client' + acceso a Supabase solo en handlers.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useEntityMutations } from "@/hooks/use-os-entities";
import type { OsPage, OsGroup, OsEvent } from "@/lib/os-social";
import { uploadEntityMedia } from "@/lib/os-social";
import { Lock, Loader2, Upload, X, ImageIcon } from "lucide-react";

// ── Tipos del editor ──

export type EntityEditorType = "page" | "group" | "event";

/** Entidad precargada para el modo edición (discriminada por `type`). */
export type EditableEntity =
    | { type: "page"; data: OsPage }
    | { type: "group"; data: OsGroup }
    | { type: "event"; data: OsEvent };

interface EntityEditorDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** "create" para nueva entidad; "edit" para una existente (requiere `entity`). */
    mode: "create" | "edit";
    /** Tipo inicial al crear (por defecto "page"). Ignorado al editar. */
    defaultType?: EntityEditorType;
    /** Entidad a editar (obligatoria en modo "edit"). */
    entity?: EditableEntity;
    /** Callback tras guardar con éxito (p.ej. refetch). Si no, se usa router.refresh(). */
    onSaved?: (slug: string, type: EntityEditorType) => void;
    /** Si false, al crear NO navega al detalle (solo llama onSaved). Por defecto true. */
    navigateOnCreate?: boolean;
}

const DEFAULT_ACCENT = "#E9C46A";

const PAGE_KINDS: Array<{ value: OsPage["kind"]; label: string }> = [
    { value: "perfil", label: "Perfil" },
    { value: "comunidad", label: "Comunidad" },
    { value: "proyecto", label: "Proyecto" },
    { value: "pagina", label: "Página" },
];

const GROUP_KINDS: Array<{ value: OsGroup["kind"]; label: string }> = [
    { value: "asamblea", label: "Asamblea" },
    { value: "circulo", label: "Círculo" },
    { value: "colectivo", label: "Colectivo" },
];

const EVENT_KINDS: Array<{ value: string; label: string }> = [
    { value: "encuentro", label: "Encuentro" },
    { value: "asamblea", label: "Asamblea" },
    { value: "taller", label: "Taller" },
    { value: "celebracion", label: "Celebración" },
    { value: "exposicion", label: "Exposición" },
];

const TYPE_LABEL: Record<EntityEditorType, string> = {
    page: "Página",
    group: "Grupo",
    event: "Evento",
};

const DETAIL_PREFIX: Record<EntityEditorType, string> = {
    page: "/pagina",
    group: "/grupo",
    event: "/evento",
};

/** Convierte un ISO (con zona) al formato de <input type="datetime-local">. */
function isoToLocalInput(iso: string | null | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
        d.getHours(),
    )}:${pad(d.getMinutes())}`;
}

/** Convierte el valor de datetime-local a ISO; "" → null. */
function localInputToIso(local: string): string | null {
    if (!local) return null;
    const d = new Date(local);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
}

function parseTags(raw: string): string[] {
    return raw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
}

/** Límite de tamaño para subidas de imagen (~5 MB). */
const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

/**
 * Control reutilizable de subida de imagen (avatar o portada).
 *
 * Permite: (1) elegir un archivo (image/*) que se sube a Storage vía
 * uploadEntityMedia mostrando spinner / error / éxito y una vista previa, o
 * (2) pegar una URL manual como alternativa. La URL resultante se eleva al
 * formulario padre vía onChange (se persiste luego en create/update).
 */
function MediaUploadField({
    kind,
    value,
    onChange,
    accent,
    onNeedsAuth,
}: {
    kind: "avatar" | "cover";
    value: string;
    onChange: (url: string) => void;
    accent: string;
    onNeedsAuth: () => void;
}) {
    const inputId = `entity-${kind}-file`;
    const fileRef = React.useRef<HTMLInputElement | null>(null);
    const [uploading, setUploading] = React.useState(false);
    const [uploadError, setUploadError] = React.useState<string | null>(null);
    const [justUploaded, setJustUploaded] = React.useState(false);

    const isCover = kind === "cover";
    const label = isCover ? "Portada" : "Avatar";

    const handleFile = async (file: File | undefined | null) => {
        setUploadError(null);
        setJustUploaded(false);
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            setUploadError("El archivo debe ser una imagen.");
            return;
        }
        if (file.size > MAX_MEDIA_BYTES) {
            setUploadError("La imagen supera el límite de 5 MB.");
            return;
        }

        setUploading(true);
        try {
            const res = await uploadEntityMedia(file, kind);
            if (res.needsAuth) {
                onNeedsAuth();
                setUploadError("Inicia sesión para subir imágenes.");
                return;
            }
            if (!res.ok || !res.url) {
                setUploadError(res.error || "No se pudo subir la imagen.");
                return;
            }
            onChange(res.url);
            setJustUploaded(true);
        } catch (e: any) {
            setUploadError(e?.message || "Error al subir la imagen.");
        } finally {
            setUploading(false);
            // Permite re-elegir el mismo archivo si fuese necesario.
            if (fileRef.current) fileRef.current.value = "";
        }
    };

    return (
        <div className="flex flex-col gap-1.5">
            <Label htmlFor={inputId}>{label}</Label>

            {/* Vista previa */}
            {value ? (
                isCover ? (
                    <div className="relative overflow-hidden rounded-lg border border-input">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={value}
                            alt="Vista previa de portada"
                            className="h-28 w-full object-cover"
                        />
                        <button
                            type="button"
                            onClick={() => {
                                onChange("");
                                setJustUploaded(false);
                            }}
                            className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white cursor-pointer hover:bg-black/80 transition-colors"
                            aria-label="Quitar portada"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={value}
                            alt="Vista previa de avatar"
                            className="h-14 w-14 rounded-full border border-input object-cover"
                            style={{ boxShadow: `0 0 0 2px ${accent}33` }}
                        />
                        <button
                            type="button"
                            onClick={() => {
                                onChange("");
                                setJustUploaded(false);
                            }}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                        >
                            <X className="h-3.5 w-3.5" />
                            Quitar
                        </button>
                    </div>
                )
            ) : (
                <div
                    className={
                        isCover
                            ? "flex h-28 w-full items-center justify-center rounded-lg border border-dashed border-input text-muted-foreground"
                            : "flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-input text-muted-foreground"
                    }
                    aria-hidden
                >
                    <ImageIcon className={isCover ? "h-6 w-6" : "h-5 w-5"} />
                </div>
            )}

            {/* Botón de subida + input file oculto */}
            <div className="flex items-center gap-2">
                <input
                    ref={fileRef}
                    id={inputId}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0])}
                    disabled={uploading}
                />
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="gap-2 cursor-pointer"
                >
                    {uploading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <Upload className="h-3.5 w-3.5" />
                    )}
                    {uploading ? "Subiendo…" : value ? "Cambiar imagen" : "Subir imagen"}
                </Button>
                {justUploaded && !uploading && (
                    <span className="text-xs text-emerald-400">Imagen subida ✓</span>
                )}
            </div>

            {/* Alternativa: URL manual */}
            <Input
                value={value}
                onChange={(e) => {
                    onChange(e.target.value);
                    setJustUploaded(false);
                    setUploadError(null);
                }}
                placeholder="…o pega una URL de imagen"
                autoComplete="off"
                className="text-xs"
            />

            {uploadError && (
                <p className="text-xs text-red-400" role="alert">
                    {uploadError}
                </p>
            )}
        </div>
    );
}

export function EntityEditorDialog({
    open,
    onOpenChange,
    mode,
    defaultType = "page",
    entity,
    onSaved,
    navigateOnCreate = true,
}: EntityEditorDialogProps) {
    const router = useRouter();
    const mutations = useEntityMutations();

    const isEdit = mode === "edit" && !!entity;
    const editType: EntityEditorType | undefined = entity?.type;

    // En edición el tipo es fijo (no se cambia el tipo de una entidad existente).
    const [type, setType] = React.useState<EntityEditorType>(
        isEdit && editType ? editType : defaultType,
    );

    // Campos del formulario.
    const [name, setName] = React.useState("");
    const [kind, setKind] = React.useState<string>("");
    const [description, setDescription] = React.useState("");
    const [tags, setTags] = React.useState("");
    const [accent, setAccent] = React.useState(DEFAULT_ACCENT);
    // Medios (subidos a Storage o URL manual):
    const [avatarUrl, setAvatarUrl] = React.useState("");
    const [coverUrl, setCoverUrl] = React.useState("");
    // Solo eventos:
    const [startsAt, setStartsAt] = React.useState("");
    const [location, setLocation] = React.useState("");
    const [organizerSlug, setOrganizerSlug] = React.useState("");

    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [needsAuth, setNeedsAuth] = React.useState(false);

    // (Re)inicializa el formulario cuando se abre o cambian las props relevantes.
    React.useEffect(() => {
        if (!open) return;
        setError(null);
        setNeedsAuth(false);
        setSaving(false);

        if (isEdit && entity) {
            setType(entity.type);
            if (entity.type === "event") {
                const e = entity.data;
                setName(e.title);
                setKind(e.kind || "encuentro");
                setDescription(e.description);
                setTags(e.tags.join(", "));
                setAccent(DEFAULT_ACCENT);
                setAvatarUrl("");
                setCoverUrl(e.coverUrl || "");
                setStartsAt(isoToLocalInput(e.startsAt));
                setLocation(e.location);
                setOrganizerSlug(e.organizerSlug);
            } else {
                const d = entity.data;
                setName(d.name);
                setKind(d.kind);
                setDescription(d.description);
                setTags(d.tags.join(", "));
                setAccent(d.accent || DEFAULT_ACCENT);
                setAvatarUrl(d.avatarUrl || "");
                setCoverUrl(d.coverUrl || "");
                setStartsAt("");
                setLocation("");
                setOrganizerSlug("");
            }
        } else {
            // Modo crear: valores por defecto.
            setType(defaultType);
            setName("");
            setKind(
                defaultType === "page"
                    ? "pagina"
                    : defaultType === "group"
                      ? "colectivo"
                      : "encuentro",
            );
            setDescription("");
            setTags("");
            setAccent(DEFAULT_ACCENT);
            setAvatarUrl("");
            setCoverUrl("");
            setStartsAt("");
            setLocation("");
            setOrganizerSlug("");
        }
    }, [open, isEdit, entity, defaultType]);

    // Al cambiar de tipo en modo crear, ajusta el kind por defecto.
    const handleTypeChange = (next: string) => {
        const t = next as EntityEditorType;
        setType(t);
        setKind(t === "page" ? "pagina" : t === "group" ? "colectivo" : "encuentro");
    };

    const kindOptions =
        type === "page" ? PAGE_KINDS : type === "group" ? GROUP_KINDS : EVENT_KINDS;

    const nameLabel = type === "event" ? "Título" : "Nombre";

    const handleSave = async () => {
        setError(null);
        setNeedsAuth(false);

        const trimmedName = name.trim();
        if (!trimmedName) {
            setError(`El ${type === "event" ? "título" : "nombre"} es obligatorio.`);
            return;
        }

        setSaving(true);
        const tagList = parseTags(tags);
        const avatarVal = avatarUrl.trim() || undefined;
        const coverVal = coverUrl.trim() || undefined;
        let res;

        try {
            if (isEdit && entity) {
                // ── EDITAR ──
                if (entity.type === "page") {
                    res = await mutations.updatePage(entity.data.slug, {
                        name: trimmedName,
                        kind: kind as OsPage["kind"],
                        description: description.trim(),
                        tags: tagList,
                        accent,
                        avatarUrl: avatarUrl.trim(),
                        coverUrl: coverUrl.trim(),
                    });
                } else if (entity.type === "group") {
                    res = await mutations.updateGroup(entity.data.slug, {
                        name: trimmedName,
                        kind: kind as OsGroup["kind"],
                        description: description.trim(),
                        tags: tagList,
                        accent,
                        avatarUrl: avatarUrl.trim(),
                        coverUrl: coverUrl.trim(),
                    });
                } else {
                    res = await mutations.updateEvent(entity.data.slug, {
                        title: trimmedName,
                        kind,
                        description: description.trim(),
                        tags: tagList,
                        startsAt: localInputToIso(startsAt),
                        location: location.trim(),
                        organizerSlug: organizerSlug.trim(),
                        coverUrl: coverUrl.trim(),
                    });
                }
            } else {
                // ── CREAR ──
                if (type === "page") {
                    res = await mutations.createPage({
                        name: trimmedName,
                        kind: kind as OsPage["kind"],
                        description: description.trim(),
                        tags: tagList,
                        accent,
                        avatarUrl: avatarVal,
                        coverUrl: coverVal,
                    });
                } else if (type === "group") {
                    res = await mutations.createGroup({
                        name: trimmedName,
                        kind: kind as OsGroup["kind"],
                        description: description.trim(),
                        tags: tagList,
                        accent,
                        avatarUrl: avatarVal,
                        coverUrl: coverVal,
                    });
                } else {
                    res = await mutations.createEvent({
                        title: trimmedName,
                        kind,
                        description: description.trim(),
                        tags: tagList,
                        startsAt: localInputToIso(startsAt),
                        location: location.trim(),
                        organizerSlug: organizerSlug.trim(),
                        coverUrl: coverVal,
                    });
                }
            }
        } catch (e: any) {
            setSaving(false);
            setError(e?.message || "Error al guardar.");
            return;
        }

        setSaving(false);

        if (res.needsAuth) {
            setNeedsAuth(true);
            return;
        }
        if (!res.ok) {
            setError(res.error || "No se pudo guardar.");
            return;
        }

        const savedSlug = res.slug ?? (isEdit && entity ? entity.data.slug : "");
        onOpenChange(false);

        if (onSaved && savedSlug) {
            onSaved(savedSlug, type);
        }

        if (isEdit) {
            router.refresh();
        } else if (navigateOnCreate && savedSlug) {
            router.push(`${DETAIL_PREFIX[type]}/${savedSlug}`);
        } else {
            router.refresh();
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {isEdit
                            ? `Editar ${TYPE_LABEL[type].toLowerCase()}`
                            : "Crear entidad"}
                    </DialogTitle>
                    <DialogDescription>
                        {isEdit
                            ? "Modifica los datos y guarda los cambios."
                            : "Crea una nueva página, grupo o evento en la red StarSeed."}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4 py-2">
                    {/* Selector de tipo (solo al crear) */}
                    {!isEdit && (
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="entity-type">Tipo</Label>
                            <Select value={type} onValueChange={handleTypeChange}>
                                <SelectTrigger id="entity-type" className="cursor-pointer">
                                    <SelectValue placeholder="Tipo de entidad" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="page" className="cursor-pointer">
                                        Página
                                    </SelectItem>
                                    <SelectItem value="group" className="cursor-pointer">
                                        Grupo
                                    </SelectItem>
                                    <SelectItem value="event" className="cursor-pointer">
                                        Evento
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Nombre / Título */}
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="entity-name">{nameLabel}</Label>
                        <Input
                            id="entity-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={
                                type === "event" ? "Título del evento" : "Nombre de la entidad"
                            }
                            autoComplete="off"
                        />
                    </div>

                    {/* Kind (categoría) */}
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="entity-kind">Categoría</Label>
                        <Select value={kind} onValueChange={setKind}>
                            <SelectTrigger id="entity-kind" className="cursor-pointer">
                                <SelectValue placeholder="Categoría" />
                            </SelectTrigger>
                            <SelectContent>
                                {kindOptions.map((k) => (
                                    <SelectItem
                                        key={k.value}
                                        value={k.value}
                                        className="cursor-pointer"
                                    >
                                        {k.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Descripción */}
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="entity-description">Descripción</Label>
                        <Textarea
                            id="entity-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Describe el propósito de esta entidad…"
                            className="min-h-[88px] resize-none"
                        />
                    </div>

                    {/* Imágenes: avatar (no eventos) + portada (todos) */}
                    {type !== "event" && (
                        <MediaUploadField
                            kind="avatar"
                            value={avatarUrl}
                            onChange={setAvatarUrl}
                            accent={accent}
                            onNeedsAuth={() => setNeedsAuth(true)}
                        />
                    )}
                    <MediaUploadField
                        kind="cover"
                        value={coverUrl}
                        onChange={setCoverUrl}
                        accent={accent}
                        onNeedsAuth={() => setNeedsAuth(true)}
                    />

                    {/* Campos específicos de EVENTO */}
                    {type === "event" && (
                        <>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="entity-startsat">Fecha y hora</Label>
                                <Input
                                    id="entity-startsat"
                                    type="datetime-local"
                                    value={startsAt}
                                    onChange={(e) => setStartsAt(e.target.value)}
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="entity-location">Ubicación</Label>
                                <Input
                                    id="entity-location"
                                    value={location}
                                    onChange={(e) => setLocation(e.target.value)}
                                    placeholder="Lugar físico o «En línea»"
                                    autoComplete="off"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="entity-organizer">
                                    Organizador (slug de página)
                                </Label>
                                <Input
                                    id="entity-organizer"
                                    value={organizerSlug}
                                    onChange={(e) => setOrganizerSlug(e.target.value)}
                                    placeholder="slug-de-la-pagina-organizadora"
                                    autoComplete="off"
                                />
                            </div>
                        </>
                    )}

                    {/* Tags + Accent */}
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="entity-tags">Etiquetas (separadas por comas)</Label>
                        <Input
                            id="entity-tags"
                            value={tags}
                            onChange={(e) => setTags(e.target.value)}
                            placeholder="cultura, arte, comunidad"
                            autoComplete="off"
                        />
                    </div>

                    {type !== "event" && (
                        <div className="flex items-center gap-3">
                            <Label htmlFor="entity-accent" className="shrink-0">
                                Color de acento
                            </Label>
                            <input
                                id="entity-accent"
                                type="color"
                                value={accent}
                                onChange={(e) => setAccent(e.target.value)}
                                className="h-9 w-14 cursor-pointer rounded-md border border-input bg-transparent p-1"
                                aria-label="Color de acento"
                            />
                            <span className="text-xs text-muted-foreground tabular-nums">
                                {accent}
                            </span>
                        </div>
                    )}

                    {/* Avisos */}
                    {needsAuth && (
                        <div className="flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                            <Lock className="h-3.5 w-3.5 shrink-0" />
                            <span>
                                Necesitas iniciar sesión para guardar.{" "}
                                <Link
                                    href="/login"
                                    className="underline cursor-pointer font-semibold"
                                >
                                    Iniciar sesión
                                </Link>
                            </span>
                        </div>
                    )}
                    {error && (
                        <p className="text-xs text-red-400" role="alert">
                            {error}
                        </p>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={saving}
                        className="cursor-pointer"
                    >
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="gap-2 cursor-pointer"
                    >
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        {isEdit ? "Guardar cambios" : "Crear"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default EntityEditorDialog;
