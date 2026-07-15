"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ProfileIdentityPanel · Configuración → Perfil (REAL, sobre Supabase)
// ----------------------------------------------------------------------------
// Edita la identidad soberana del usuario directamente contra la tabla
// `profiles`: @handle, nombre visible y avatar (+ bio/portada cuando la columna
// existe). Sin datos de ejemplo: los campos vacíos se muestran vacíos.
//   · Lee la sesión y el perfil reales vía useAccount() (fuente compartida).
//   · Guarda con ámbito de propietario (RLS: solo tu fila).
//   · Tolerante a esquema: localiza la fila por user_id o por id, y si una
//     columna opcional (bio/cover_url/updated_at) no existe, reintenta sin ella.
//   · Realtime: refleja al instante cambios externos en tu perfil.
//   · Insignias verificables reales desde profiles.badges (si las hay).
// Alcance: este componente vive en Configuración; enlaza a /cuenta y /correos
// para la gestión avanzada (dirección @star.seed y correos adjuntos).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { useAccount, isProfileComplete } from "@/context/account-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
    User,
    AtSign,
    ImageIcon,
    BadgeCheck,
    Save,
    Loader2,
    ExternalLink,
    Mail,
    ShieldCheck,
    Info,
    Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
// Subida universal de archivos (Adenda 64 §9): cambiar avatar/portada con una
// foto real (dispositivo o biblioteca) en vez de solo pegar una URL externa.
import { AttachFilePickerButton } from "@/components/files/universal-file-picker";
import type { UniversalAttachment } from "@/lib/files/os-files";

type Row = Record<string, any>;

interface ProfileForm {
    handle: string;
    display_name: string;
    bio: string;
    avatar_url: string;
    cover_url: string;
    visibility: "public" | "private" | "contacts";
}

const EMPTY_FORM: ProfileForm = { handle: "", display_name: "", bio: "", avatar_url: "", cover_url: "", visibility: "public" };

// ── De-mock local: valores demo históricos que NO deben poblar el formulario ──
// como si fueran datos reales del usuario. Si la fila trae alguno, lo tratamos
// como vacío para que el usuario introduzca sus datos REALES.
const FAKE_HANDLES = new Set(["starseeduser", "starseed_user", "usuario", "user", "demo", "guest", "invitado", "anon", "anonymous"]);
const FAKE_NAMES = new Set(["starseed user", "usuario starseed", "usuario", "user", "demo user", "guest", "invitado", "nuevo usuario"]);
function cleanHandle(v: unknown): string {
    const s = typeof v === "string" ? v.trim() : "";
    return s && !FAKE_HANDLES.has(s.toLowerCase()) ? s : "";
}
function cleanName(v: unknown): string {
    const s = typeof v === "string" ? v.trim() : "";
    return s && !FAKE_NAMES.has(s.toLowerCase()) ? s : "";
}

function initialsOf(label: string): string {
    const parts = (label || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "SS";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Localiza la fila de perfil del usuario tolerando ambos esquemas (user_id | id). */
async function loadOwnProfile(
    supabase: ReturnType<typeof createClient>,
    userId: string,
): Promise<{ row: Row | null; key: "user_id" | "id" }> {
    try {
        const { data, error } = await supabase
            .from("os_profiles")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle();
        if (!error && data) return { row: data as Row, key: "user_id" };
    } catch {
        /* probar siguiente */
    }
    try {
        const { data, error } = await supabase
            .from("os_profiles")
            .select("*")
            .eq("id", userId)
            .maybeSingle();
        if (!error && data) return { row: data as Row, key: "id" };
    } catch {
        /* sin perfil */
    }
    // Por defecto, las tablas de perfil del OS se indexan por user_id.
    return { row: null, key: "user_id" };
}

/** Extrae insignias verificables reales del perfil (jsonb flexible). Nunca inventa. */
function readBadges(row: Row | null): string[] {
    if (!row) return [];
    const raw = row.badges ?? row.claims ?? null;
    if (!raw) return [];
    try {
        const arr = Array.isArray(raw) ? raw : typeof raw === "string" ? JSON.parse(raw) : [];
        return (Array.isArray(arr) ? arr : [])
            .map((b: any) => (typeof b === "string" ? b : b?.label ?? b?.name ?? b?.title ?? null))
            .filter((s: any): s is string => typeof s === "string" && s.trim().length > 0);
    } catch {
        return [];
    }
}

export function ProfileIdentityPanel() {
    const supabase = useMemo(() => createClient(), []);
    const { user, profile: ctxProfile, loading: accountLoading } = useAccount();

    const [profileRow, setProfileRow] = useState<Row | null>(null);
    const [ownerKey, setOwnerKey] = useState<"user_id" | "id">("user_id");
    const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);

    const uid = user?.id ?? null;

    const hydrate = useCallback((row: Row | null) => {
        setProfileRow(row);
        setForm({
            // De-mock: los placeholders demo se muestran vacíos → el usuario pone lo real.
            handle: cleanHandle(row?.handle),
            display_name:
                cleanName(row?.display_name) || cleanName(row?.full_name) || cleanName(row?.name),
            bio: (row?.bio as string) ?? "",
            avatar_url: (row?.avatar_url as string) ?? "",
            cover_url: (row?.cover_url as string) ?? "",
            visibility: (row?.visibility as "public" | "private" | "contacts") ?? "public",
        });
        setDirty(false);
    }, []);

    const load = useCallback(async () => {
        if (!uid) {
            setLoading(false);
            return;
        }
        setLoading(true);
        const { row, key } = await loadOwnProfile(supabase, uid);
        setOwnerKey(key);
        hydrate(row ?? ctxProfile ?? null);
        setLoading(false);
    }, [uid, supabase, hydrate, ctxProfile]);

    useEffect(() => {
        load();
    }, [load]);

    // Realtime: refleja cambios externos en tu perfil sin recargar.
    useEffect(() => {
        if (!uid) return;
        const { syncManager } = require("@/lib/sync/sync-manager");
        const unsub = syncManager.subscribe("os_profiles", ownerKey, uid, () => {
            if (!dirty) void load();
        });
        return () => {
            unsub();
        };
    }, [uid, ownerKey, load, dirty]);

    function setField<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
        setForm((f) => ({ ...f, [key]: value }));
        setDirty(true);
    }

    async function save() {
        if (!uid) {
            toast.error("Inicia sesión para guardar tu perfil.");
            return;
        }

        const handle = String(form.handle || "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_.]/g, "");
            
        const displayName = form.display_name?.trim() ?? "";
        
        if (!handle || !displayName) {
            toast.error("Debes ingresar un Handle (@) único y un Nombre público.");
            return;
        }

        setSaving(true);

        // Patch completo; se irá reduciendo si alguna columna opcional no existe.
        const fullPatch: Row = {
            display_name: displayName,
            avatar_url: form.avatar_url?.trim() ?? "",
            bio: form.bio?.trim() ?? "",
            cover_url: form.cover_url?.trim() ?? "",
            visibility: form.visibility ?? "public",
            updated_at: new Date().toISOString(),
        };
        if (handle && handle !== (profileRow?.handle ?? "")) fullPatch.handle = handle;

        const optionalCols = ["cover_url", "bio", "visibility", "updated_at"];

        const attempt = async (patch: Row): Promise<{ ok: boolean; error?: any }> => {
            if (profileRow) {
                const { error } = await supabase.from("os_profiles").update(patch).eq(ownerKey, uid);
                return { ok: !error, error };
            }
            const insertRow = { ...patch, [ownerKey]: uid };
            // Si no existe, usamos insert (upsert falla si no hay constraint unica en onConflict)
            const { error } = await supabase.from("os_profiles").insert(insertRow);
            return { ok: !error, error };
        };

        let patch: Row = { ...fullPatch };
        let result = await attempt(patch);

        // Reintento tolerante: si la columna no existe (esquema reducido), la quitamos.
        let guard = 0;
        while (!result.ok && guard < optionalCols.length) {
            const msg = String(result.error?.message ?? "").toLowerCase();
            const missing = optionalCols.find(
                (c) =>
                    msg.includes(c) &&
                    (msg.includes("column") || msg.includes("does not exist") || msg.includes("schema cache")),
            );
            if (!missing || !(missing in patch)) break;
            delete patch[missing];
            result = await attempt(patch);
            guard++;
        }

        if (!result.ok) {
            const msg = String(result.error?.message ?? "");
            const dup = /duplicate|unique/i.test(msg);
            toast.error(dup ? "Ese @ ya está en uso, prueba con otro." : "No se pudo guardar: " + msg);
            setSaving(false);
            return;
        }

        // Si el @ cambió y existe la identidad interna, sincroniza la dirección @star.seed.
        if (patch.handle) {
            try {
                const internal = patch.handle + "@star.seed";
                await supabase.from("starseed_identities").update({ address: internal }).eq("owner", uid);
            } catch {
                /* tabla opcional: ignorar sin romper */
            }
        }

        toast.success("Perfil guardado en tu cuenta StarSeed.");
        setSaving(false);
        await load();
        

    }

    // ── Datos derivados para la cabecera de vista previa (reales, con fallback honesto) ──
    const previewName =
        form.display_name?.trim() ||
        (ctxProfile?.display_name as string) ||
        (ctxProfile?.full_name as string) ||
        "";
    const previewHandle = form.handle?.trim() || (ctxProfile?.handle as string) || "";
    const previewAvatar = form.avatar_url?.trim() || (ctxProfile?.avatar_url as string) || "";
    const badges = readBadges(profileRow);
    const verified = Boolean(profileRow?.verified ?? (profileRow?.stats as Row)?.verified);

    // ── Sin sesión: invitación honesta (sin datos falsos) ──
    if (!accountLoading && !uid) {
        return (
            <Card className="bg-background/40 backdrop-blur-sm border-0 shadow-none">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <User className="w-5 h-5 text-primary" /> Identidad soberana
                    </CardTitle>
                    <CardDescription>
                        Inicia sesión con tu cuenta StarSeed para editar tu perfil: nombre, @, avatar y bio.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Link href="/login">
                        <Button className="gap-2 cursor-pointer">
                            <User className="w-4 h-4" /> Entrar / Crear cuenta
                        </Button>
                    </Link>
                </CardContent>
            </Card>
        );
    }

    const isLoading = loading || accountLoading;

    // Perfil incompleto = faltan datos REALES (handle o nombre) o hay placeholders.
    // Se calcula sobre lo que hay en el formulario/perfil (sin inventar nada).
    const incomplete =
        !isLoading &&
        !isProfileComplete({
            handle: form.handle || previewHandle,
            display_name: form.display_name || previewName,
        });

    return (
        <Card className="bg-background/40 backdrop-blur-sm border-0 shadow-none">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <User className="w-5 h-5 text-primary" /> Identidad soberana
                </CardTitle>
                <CardDescription>
                    Tu representación en el Grafo Vivo. Estos datos se guardan en tu cuenta y son solo tuyos (RLS).
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {incomplete && (
                    <div className="flex items-start gap-3 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10">
                        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-amber-100">Completa tu perfil real</p>
                            <p className="text-[11px] text-amber-200/80 leading-relaxed">
                                Aún faltan tus datos reales. Elige un <b>@ único</b> y tu <b>nombre visible</b> para
                                activar tu identidad soberana. No usamos datos genéricos por defecto.
                            </p>
                        </div>
                    </div>
                )}
                <div className="flex flex-col md:flex-row gap-6 items-start">
                    {/* ── Avatar real + vista previa ── */}
                    <div className="flex flex-col items-center gap-3 shrink-0">
                        <div className="relative group">
                            <div className="absolute -inset-1 bg-gradient-to-tr from-primary to-accent rounded-full blur opacity-40 group-hover:opacity-70 transition-opacity" />
                            <Avatar className="h-24 w-24 border-2 border-background relative z-10">
                                {previewAvatar ? <AvatarImage src={previewAvatar} alt={previewName || "avatar"} /> : null}
                                <AvatarFallback className="bg-muted/40 text-sm text-muted-foreground">
                                    {isLoading
                                        ? "…"
                                        : previewName || previewHandle
                                          ? initialsOf(previewName || previewHandle)
                                          : "Sin foto"}
                                </AvatarFallback>
                            </Avatar>
                        </div>
                        <div className="text-center min-w-0 max-w-[10rem]">
                            <p className="text-sm font-semibold truncate">{previewName || "Sin nombre"}</p>
                            <p className="text-[11px] text-muted-foreground truncate">
                                {previewHandle ? "@" + previewHandle : "sin @"}
                            </p>
                        </div>
                    </div>

                    {/* ── Formulario real ── */}
                    <div className="flex-1 space-y-4 w-full">
                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium flex items-center gap-1.5">
                                    <AtSign className="w-3.5 h-3.5 text-muted-foreground" /> Handle (@)
                                </label>
                                <Input
                                    value={form.handle}
                                    onChange={(e) => setField("handle", e.target.value)}
                                    placeholder="tu_perfil"
                                    disabled={isLoading}
                                    className="bg-background/50"
                                />
                                <p className="text-[10px] text-muted-foreground">
                                    Identificador único. Solo letras, números, punto y guion bajo.
                                </p>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium flex items-center gap-1.5">
                                    <User className="w-3.5 h-3.5 text-muted-foreground" /> Nombre
                                </label>
                                <Input
                                    value={form.display_name}
                                    onChange={(e) => setField("display_name", e.target.value)}
                                    placeholder="Tu nombre visible"
                                    disabled={isLoading}
                                    className="bg-background/50"
                                />
                            </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Bio (manifiesto personal)</label>
                                <Textarea
                                    value={form.bio}
                                    onChange={(e) => setField("bio", e.target.value)}
                                    placeholder="Escribe tu manifiesto personal…"
                                    disabled={isLoading}
                                    className="min-h-[80px] bg-background/50"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Visibilidad</label>
                                <div className="flex gap-2 h-[80px] items-start">
                                    {(["public", "private", "contacts"] as const).map((v) => (
                                        <button
                                            key={v}
                                            type="button"
                                            onClick={() => setField("visibility", v)}
                                            disabled={isLoading}
                                            className={cn(
                                                "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer text-center flex-1",
                                                form.visibility === v
                                                    ? "border-primary/50 bg-primary/15 text-primary"
                                                    : "border-white/10 text-muted-foreground hover:bg-white/5"
                                            )}
                                        >
                                            {v === "public" ? "Público" : v === "private" ? "Privado" : "Contactos"}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium flex items-center gap-1.5">
                                    <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" /> Avatar
                                </label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        value={form.avatar_url}
                                        onChange={(e) => setField("avatar_url", e.target.value)}
                                        placeholder="https://…"
                                        disabled={isLoading}
                                        className="bg-background/50 font-mono text-xs"
                                    />
                                    <AttachFilePickerButton
                                        onPick={(picked: UniversalAttachment[]) => {
                                            const url = picked[0]?.url;
                                            if (url) setField("avatar_url", url);
                                        }}
                                        accept="*"
                                        folder="avatares"
                                        title="Cambiar foto de perfil"
                                        hideTabs={["neuronas"]}
                                        cropOptions={{ aspectRatio: 1, circularCrop: true }}
                                        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 text-xs font-medium text-foreground/80 hover:bg-white/10"
                                    >
                                        <Upload className="w-3.5 h-3.5" />
                                    </AttachFilePickerButton>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium flex items-center gap-1.5">
                                    <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" /> Portada
                                </label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        value={form.cover_url}
                                        onChange={(e) => setField("cover_url", e.target.value)}
                                        placeholder="https://…"
                                        disabled={isLoading}
                                        className="bg-background/50 font-mono text-xs"
                                    />
                                    <AttachFilePickerButton
                                        onPick={(picked: UniversalAttachment[]) => {
                                            const url = picked[0]?.url;
                                            if (url) setField("cover_url", url);
                                        }}
                                        accept="*"
                                        folder="portadas"
                                        title="Cambiar foto de portada"
                                        hideTabs={["neuronas"]}
                                        cropOptions={{ aspectRatio: 3 / 1, circularCrop: false }}
                                        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 text-xs font-medium text-foreground/80 hover:bg-white/10"
                                    >
                                        <Upload className="w-3.5 h-3.5" />
                                    </AttachFilePickerButton>
                                </div>
                            </div>
                        </div>

                        {/* ── Credenciales verificables REALES (o estado honesto) ── */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium flex items-center gap-1.5">
                                <BadgeCheck className="w-3.5 h-3.5 text-muted-foreground" /> Credenciales verificables
                            </label>
                            <div className="flex flex-wrap gap-2 p-3 bg-muted/20 rounded-lg border border-dashed min-h-[2.75rem] items-center">
                                {verified && (
                                    <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-xs border border-emerald-500/20 flex items-center gap-1">
                                        <ShieldCheck className="w-3 h-3" /> Humano verificado
                                    </span>
                                )}
                                {badges.map((b) => (
                                    <span
                                        key={b}
                                        className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs border border-primary/20"
                                    >
                                        {b}
                                    </span>
                                ))}
                                {!verified && badges.length === 0 && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                                        <Info className="w-3.5 h-3.5" /> Aún no tienes credenciales verificables.
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* ── Acciones ── */}
                        <div className="flex flex-wrap items-center gap-3 pt-1">
                            <Button onClick={save} disabled={saving || isLoading || !dirty} className="gap-2 cursor-pointer">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                {saving ? "Guardando…" : dirty ? "Guardar cambios" : "Guardado"}
                            </Button>

                            {previewHandle ? (
                                <Link href={`/profile/${previewHandle}`} className="cursor-pointer">
                                    <Button variant="outline" className="gap-2 cursor-pointer">
                                        Ver perfil público <ExternalLink className="w-3.5 h-3.5" />
                                    </Button>
                                </Link>
                            ) : (
                                <span className="text-xs text-muted-foreground">
                                    Elige un @ para activar tu perfil público.
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Enlaces a la gestión avanzada de cuenta ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/40">
                    <Link
                        href="/cuenta"
                        className={cn(
                            "flex items-center gap-3 p-3 rounded-xl border transition-colors cursor-pointer",
                            "border-primary/20 bg-primary/5 hover:bg-primary/10",
                        )}
                    >
                        <span className="grid place-items-center w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 text-primary shrink-0">
                            <ShieldCheck className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold">Cuenta e identidad</p>
                            <p className="text-[11px] text-muted-foreground truncate">
                                Dirección @star.seed, recuperación y verificación.
                            </p>
                        </div>
                        <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0 ml-auto" />
                    </Link>
                    <Link
                        href="/correos"
                        className="flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-card/40 hover:bg-card/70 transition-colors cursor-pointer"
                    >
                        <span className="grid place-items-center w-9 h-9 rounded-lg bg-[#39FF14]/10 border border-[#39FF14]/20 text-[#39FF14] shrink-0">
                            <Mail className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold">Correos adjuntos</p>
                            <p className="text-[11px] text-muted-foreground truncate">
                                Tu @star.seed y correos externos vinculados.
                            </p>
                        </div>
                        <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0 ml-auto" />
                    </Link>
                </div>
            </CardContent>
        </Card>
    );
}
