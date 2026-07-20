"use client";

/*
 * CulturalPrefsEditor — editor de «hablo / aprendo / región» (Adenda 77).
 * Persiste en el perfil público (tags) + espejo privado. Reutilizado por el
 * intercambio de idiomas y el puente cultural. Honesto con sesión/errores.
 */

import { useEffect, useState } from "react";
import { Languages, GraduationCap, MapPin, LocateFixed, Loader2, Check, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    LANGUAGES,
    languagesBySystem,
    languageLabel,
    loadCulturalPrefs,
    saveCulturalPrefs,
    type CulturalPrefs,
} from "@/lib/cultural/languages";
import { CULTURAL_SYSTEMS, systemById } from "@/lib/cultural/systems";

interface Props {
    onSaved?: (prefs: CulturalPrefs) => void;
    className?: string;
}

function LangChips({
    title,
    icon,
    color,
    selected,
    onAdd,
    onRemove,
}: {
    title: string;
    icon: React.ReactNode;
    color: string;
    selected: string[];
    onAdd: (code: string) => void;
    onRemove: (code: string) => void;
}) {
    const [picker, setPicker] = useState("");
    return (
        <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-muted-foreground">
                <span style={{ color }}>{icon}</span> {title}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
                {selected.length === 0 && <span className="text-[11px] italic text-muted-foreground">Ninguno todavía</span>}
                {selected.map((code) => {
                    const sys = systemById(LANGUAGES.find((l) => l.code === code)?.systemId);
                    return (
                        <span
                            key={code}
                            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                            style={{ borderColor: `${sys.color}55`, background: `${sys.color}15`, color: sys.color }}
                        >
                            {languageLabel(code)}
                            <button
                                type="button"
                                onClick={() => onRemove(code)}
                                className="cursor-pointer rounded-full p-0.5 hover:bg-white/10"
                                aria-label={`Quitar ${languageLabel(code)}`}
                            >
                                <X className="size-3" />
                            </button>
                        </span>
                    );
                })}
                <div className="inline-flex items-center gap-1">
                    <select
                        value={picker}
                        onChange={(e) => {
                            const code = e.target.value;
                            if (code) {
                                onAdd(code);
                                setPicker("");
                            }
                        }}
                        className="min-h-[36px] cursor-pointer rounded-full border border-white/12 bg-background/50 px-2.5 py-1 text-[11px] font-semibold text-foreground/80 focus:outline-none focus:ring-1 focus:ring-primary/40"
                        aria-label={`Añadir a ${title}`}
                    >
                        <option value="">
                            + Añadir…
                        </option>
                        {languagesBySystem().map(({ system, langs }) => (
                            <optgroup key={system.id} label={system.label}>
                                {langs
                                    .filter((l) => !selected.includes(l.code))
                                    .map((l) => (
                                        <option key={l.code} value={l.code}>
                                            {l.label} · {l.native}
                                        </option>
                                    ))}
                            </optgroup>
                        ))}
                    </select>
                    <Plus className="size-3.5 text-muted-foreground" />
                </div>
            </div>
        </div>
    );
}

export function CulturalPrefsEditor({ onSaved, className }: Props) {
    const [prefs, setPrefs] = useState<CulturalPrefs>({ speaks: [], learns: [], region: null });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savedOk, setSavedOk] = useState(false);
    const [locating, setLocating] = useState(false);

    useEffect(() => {
        let alive = true;
        loadCulturalPrefs()
            .then((p) => {
                if (alive) setPrefs(p);
            })
            .finally(() => {
                if (alive) setLoading(false);
            });
        return () => {
            alive = false;
        };
    }, []);

    const regionLabel = prefs.region?.label ?? "";
    const regionSystem = prefs.region?.systemId ?? "";
    const hasCoords = typeof prefs.region?.lat === "number" && typeof prefs.region?.lng === "number";

    const updateRegion = (patch: Partial<NonNullable<CulturalPrefs["region"]>>) => {
        setSavedOk(false);
        setPrefs((p) => ({
            ...p,
            region: {
                label: p.region?.label ?? "",
                systemId: p.region?.systemId ?? "global",
                lat: p.region?.lat ?? null,
                lng: p.region?.lng ?? null,
                ...patch,
            },
        }));
    };

    const useMyLocation = () => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
            toast.error("Tu navegador no permite geolocalización.");
            return;
        }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setLocating(false);
                updateRegion({ lat: Number(pos.coords.latitude.toFixed(4)), lng: Number(pos.coords.longitude.toFixed(4)) });
                toast.success("Ubicación fijada para el mapa de conexiones.");
            },
            () => {
                setLocating(false);
                toast.error("No se pudo obtener tu ubicación.");
            },
            { enableHighAccuracy: true, timeout: 6000 },
        );
    };

    const save = async () => {
        setSaving(true);
        setSavedOk(false);
        try {
            const res = await saveCulturalPrefs(prefs);
            if (!res.ok) {
                toast.error(res.needsAuth ? "Inicia sesión para guardar tus idiomas." : res.error || "No se pudo guardar.");
                return;
            }
            setSavedOk(true);
            toast.success("Preferencias culturales guardadas. Ya apareces en el matching y el mapa.");
            onSaved?.(prefs);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className={cn("flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-muted-foreground", className)}>
                <Loader2 className="size-4 animate-spin" /> Cargando tus preferencias…
            </div>
        );
    }

    return (
        <div className={cn("space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur", className)}>
            <LangChips
                title="Hablo"
                icon={<Languages className="size-3.5" />}
                color="#22d3ee"
                selected={prefs.speaks}
                onAdd={(c) => {
                    setSavedOk(false);
                    setPrefs((p) => ({ ...p, speaks: [...p.speaks, c] }));
                }}
                onRemove={(c) => setPrefs((p) => ({ ...p, speaks: p.speaks.filter((x) => x !== c) }))}
            />
            <LangChips
                title="Aprendo"
                icon={<GraduationCap className="size-3.5" />}
                color="#a78bfa"
                selected={prefs.learns}
                onAdd={(c) => {
                    setSavedOk(false);
                    setPrefs((p) => ({ ...p, learns: [...p.learns, c] }));
                }}
                onRemove={(c) => setPrefs((p) => ({ ...p, learns: p.learns.filter((x) => x !== c) }))}
            />

            <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-muted-foreground">
                    <MapPin className="size-3.5 text-emerald-400" /> Mi región
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                        value={regionLabel}
                        onChange={(e) => updateRegion({ label: e.target.value })}
                        placeholder="Ciudad o comunidad (p. ej. Valparaíso)"
                        className="min-h-[40px] flex-1 rounded-xl border border-white/12 bg-background/50 px-3 py-2 text-sm text-foreground/90 placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40"
                    />
                    <select
                        value={regionSystem}
                        onChange={(e) => updateRegion({ systemId: e.target.value })}
                        className="min-h-[40px] cursor-pointer rounded-xl border border-white/12 bg-background/50 px-3 py-2 text-sm font-semibold text-foreground/80 focus:outline-none focus:ring-1 focus:ring-primary/40"
                    >
                        <option value="">Sistema cultural…</option>
                        {CULTURAL_SYSTEMS.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.label}
                            </option>
                        ))}
                    </select>
                </div>
                <button
                    type="button"
                    onClick={useMyLocation}
                    disabled={locating}
                    className="inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-bold text-emerald-300 transition-colors hover:bg-emerald-400/20 disabled:opacity-60"
                >
                    {locating ? <Loader2 className="size-3.5 animate-spin" /> : <LocateFixed className="size-3.5" />}
                    {hasCoords ? `Ubicación fijada (${prefs.region?.lat}, ${prefs.region?.lng})` : "Usar mi ubicación para el mapa"}
                </button>
            </div>

            <div className="flex items-center gap-2 pt-1">
                <Button
                    onClick={save}
                    disabled={saving}
                    className="btn-pill min-h-[44px] bg-primary/90 font-bold text-primary-foreground hover:bg-primary"
                >
                    {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : savedOk ? <Check className="mr-1.5 size-4" /> : null}
                    {saving ? "Guardando…" : savedOk ? "Guardado" : "Guardar preferencias"}
                </Button>
                <span className="text-[11px] text-muted-foreground">
                    Se reflejan en tu perfil público para el emparejamiento REAL y el mapa de conexiones.
                </span>
            </div>
        </div>
    );
}

export default CulturalPrefsEditor;
