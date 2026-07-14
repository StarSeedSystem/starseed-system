"use client";

/*
 * ProfilesSyncPanel — Ajustes → Cuenta y Sincronización → "Sincronización por
 * perfiles" (SOP §10). Modo TODOS/SELECCIONADOS con checkboxes de perfiles +
 * overrides inteligentes por tipo de dispositivo (web/pwa/standalone/móvil).
 *
 * Config: src/lib/sync/sync-profiles-config.ts (user_settings.prefs
 * 'starseed.sync.profiles.v1'). El motor realtime-sync.ts ya consulta
 * shouldSyncKey() antes de push/aplicar claves de ámbito perfil.
 */

import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Users2, Monitor, Smartphone, AppWindow, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMyProfiles, profileKindLabel } from "@/lib/profiles/profiles";
import {
    useSyncProfilesConfig,
    PROFILE_SCOPE_SECTIONS,
    type DeviceKindSync,
    type ProfileScopeSection,
} from "@/lib/sync/sync-profiles-config";

const DEVICE_LABELS: Record<DeviceKindSync, { label: string; icon: typeof Monitor; hint: string }> = {
    web: { label: "Navegador", icon: Globe, hint: "pestaña normal, sin instalar" },
    pwa: { label: "App instalada", icon: AppWindow, hint: "PWA en ventana propia" },
    standalone: { label: "Escritorio", icon: Monitor, hint: "modo standalone en escritorio" },
    mobile: { label: "Móvil", icon: Smartphone, hint: "teléfono o tablet" },
};

const SECTION_LABELS: Record<ProfileScopeSection, string> = {
    desktops: "Escritorios",
    "library-brains": "Cerebros de biblioteca",
    // Aurora/Astraura es de ÁMBITO CUENTA (misma Aurora en toda la cuenta): por
    // defecto sincroniza siempre. Este interruptor es el ÚNICO override: apagarlo
    // deja fuera a este TIPO de dispositivo (p. ej. un móvil compartido).
    aurora: "Aurora y Astraura (personalidades, sentidos, voz)",
};

export function ProfilesSyncPanel() {
    const { profiles, loading } = useMyProfiles();
    const { config, update, updateDevice, deviceKind } = useSyncProfilesConfig();

    const selectedSet = useMemo(() => new Set(config.profiles), [config.profiles]);

    const toggleProfile = (id: string) => {
        const next = new Set(selectedSet);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        update({ profiles: Array.from(next) });
    };

    const toggleDeviceSection = (kind: DeviceKindSync, section: ProfileScopeSection) => {
        const current = config.perDevice[kind];
        const sections = current?.sections ?? [...PROFILE_SCOPE_SECTIONS];
        const has = sections.includes(section);
        const nextSections = has ? sections.filter((s) => s !== section) : [...sections, section];
        updateDevice(kind, { sections: nextSections });
    };

    return (
        <Card className="bg-background/40 backdrop-blur-sm border-0 shadow-none">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Users2 className="w-5 h-5 text-primary" />
                    Sincronización por perfiles
                </CardTitle>
                <CardDescription>
                    Elige qué perfiles de tu cuenta participan en la sincronización de secciones ancladas a
                    perfil (como los escritorios). Por defecto sincronizan TODOS tus perfiles.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* ── Modo: todos / seleccionados ── */}
                <div className="flex gap-1.5">
                    <button
                        type="button"
                        onClick={() => update({ mode: "all" })}
                        className={cn(
                            "flex-1 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer",
                            config.mode === "all"
                                ? "border-primary/50 bg-primary/15 text-primary"
                                : "border-white/10 text-muted-foreground hover:bg-white/5",
                        )}
                    >
                        Todos los perfiles
                    </button>
                    <button
                        type="button"
                        onClick={() => update({ mode: "selected" })}
                        className={cn(
                            "flex-1 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer",
                            config.mode === "selected"
                                ? "border-primary/50 bg-primary/15 text-primary"
                                : "border-white/10 text-muted-foreground hover:bg-white/5",
                        )}
                    >
                        Perfiles seleccionados
                    </button>
                </div>

                {/* ── Checkboxes de perfiles (solo visibles/editables en modo seleccionados) ── */}
                {config.mode === "selected" && (
                    <div className="space-y-1.5 rounded-xl border border-white/5 bg-black/20 p-3">
                        {loading ? (
                            <p className="text-xs text-muted-foreground">Cargando tus perfiles…</p>
                        ) : profiles.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Sin perfiles todavía.</p>
                        ) : (
                            profiles.map((p) => (
                                <label
                                    key={p.id}
                                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/5 transition-colors cursor-pointer"
                                >
                                    <Checkbox
                                        checked={selectedSet.has(p.id)}
                                        onCheckedChange={() => toggleProfile(p.id)}
                                    />
                                    <span className="flex-1 text-xs font-medium">{p.name}</span>
                                    <Badge variant="outline" className="text-[9px] border-white/10 text-muted-foreground">
                                        {profileKindLabel(p.kind)}
                                    </Badge>
                                </label>
                            ))
                        )}
                    </div>
                )}

                {/* ── Overrides por tipo de dispositivo ── */}
                <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-1">
                        Secciones por tipo de dispositivo
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {(Object.keys(DEVICE_LABELS) as DeviceKindSync[]).map((kind) => {
                            const meta = DEVICE_LABELS[kind];
                            const Icon = meta.icon;
                            const isThis = kind === deviceKind;
                            const override = config.perDevice[kind];
                            const activeSections = override?.sections ?? [...PROFILE_SCOPE_SECTIONS];
                            return (
                                <div
                                    key={kind}
                                    className={cn(
                                        "rounded-xl border p-3 space-y-2",
                                        isThis ? "border-primary/30 bg-primary/5" : "border-white/5 bg-black/20",
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="text-xs font-semibold">{meta.label}</span>
                                        {isThis && (
                                            <Badge className="ml-auto bg-primary/15 text-primary border-primary/30 text-[9px]">
                                                Este dispositivo
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">{meta.hint}</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {PROFILE_SCOPE_SECTIONS.map((section) => {
                                            const active = activeSections.includes(section);
                                            return (
                                                <button
                                                    key={section}
                                                    type="button"
                                                    onClick={() => toggleDeviceSection(kind, section)}
                                                    className={cn(
                                                        "rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer",
                                                        active
                                                            ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                                                            : "border-white/10 text-muted-foreground hover:bg-white/5",
                                                    )}
                                                >
                                                    {SECTION_LABELS[section]}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
