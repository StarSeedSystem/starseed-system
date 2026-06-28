"use client";

// src/components/browser/browser-config.tsx
// Panel de configuracion GLOBAL del navegador:
//   - Servidores del navegador (tri-fuente) via <TriSourceConfig domain="browser" />.
//   - VPN / DNS / Cookies / Cache / Historial / VR-AR, persistidos en
//     browser_settings (lib browser-settings.ts), con realtime.
// HONESTIDAD: VPN/DNS reales requieren la app de escritorio / extension StarSeed;
// aqui se ALMACENA la preferencia. Cookies/cache se limpian a nivel de la propia
// app (sessionStorage + caches SW). El historial es real (visitas registradas).

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Shield,
    Network,
    Cookie,
    Database,
    History as HistoryIcon,
    Glasses,
    Save,
    Loader2,
    Trash2,
    Info,
    Lock,
    Server,
    ExternalLink,
} from "lucide-react";
import TriSourceConfig from "@/components/services/tri-source-config";
import {
    BROWSER_DOMAIN,
    PROXY_ENDPOINT_KEY,
} from "@/lib/browser/browser";
import {
    loadSettings,
    saveSettings,
    onSettingsChange,
    clearHistory,
    deleteHistoryEntry,
    clearAppCookiesAndCache,
    defaultSettings,
    type BrowserSettings,
    type CookiesPolicy,
    type CachePolicy,
} from "@/lib/browser/browser-settings";

const COOKIE_LABEL: Record<CookiesPolicy, string> = {
    allow: "Permitir todas",
    "session-only": "Solo de sesion",
    "block-third-party": "Bloquear de terceros",
    block: "Bloquear todas",
};
const CACHE_LABEL: Record<CachePolicy, string> = {
    normal: "Normal",
    aggressive: "Agresiva",
    "no-store": "No almacenar",
};
function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode; }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                active ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100" : "border-white/10 bg-black/20 text-white/55 hover:text-white/85",
            )}
        >
            {children}
        </button>
    );
}
function HonestNote({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-amber-100/85">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
            <span>{children}</span>
        </div>
    );
}

export default function BrowserConfig() {
    const [s, setS] = useState<BrowserSettings>(() => defaultSettings());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const dirtyRef = useRef(false);
    dirtyRef.current = dirty;

    useEffect(() => {
        let alive = true;
        setLoading(true);
        loadSettings().then((next) => {
            if (!alive) return;
            setS(next);
            setLoading(false);
        });
        return () => {
            alive = false;
        };
    }, []);

    useEffect(() => {
        const unsub = onSettingsChange((next) => {
            if (dirtyRef.current) return;
            setS(next);
        });
        return unsub;
    }, []);

    const patch = useCallback((p: Partial<BrowserSettings>) => {
        setS((prev) => ({ ...prev, ...p }));
        setDirty(true);
    }, []);

    async function persist() {
        setSaving(true);
        try {
            const r = await saveSettings(s);
            if (r.needsAuth) {
                toast.error("Inicia sesion para guardar la configuracion del navegador.");
            } else if (!r.ok) {
                toast.error(r.error || "No se pudo guardar la configuracion.");
            } else {
                if (r.settings) setS(r.settings);
                setDirty(false);
                toast.success("Configuracion del navegador guardada");
            }
        } finally {
            setSaving(false);
        }
    }

    async function onClearHistory() {
        const r = await clearHistory();
        if (r.needsAuth) return toast.error("Inicia sesion para gestionar el historial.");
        if (!r.ok) return toast.error(r.error || "No se pudo borrar el historial.");
        setS((prev) => ({ ...prev, history: { ...prev.history, entries: [] } }));
        toast.success("Historial borrado");
    }

    async function onDeleteEntry(id: string) {
        const r = await deleteHistoryEntry(id);
        if (!r.ok) return toast.error(r.error || "No se pudo eliminar la entrada.");
        setS((prev) => ({
            ...prev,
            history: { ...prev.history, entries: prev.history.entries.filter((e) => e.id !== id) },
        }));
    }

    async function onClearAppData(cookies: boolean, cache: boolean) {
        const r = await clearAppCookiesAndCache({ cookies, cache });
        if (r.ok) {
            toast.success(
                r.cleared.length ? `Limpiado: ${r.cleared.join(", ")}` : "Nada que limpiar en la app",
            );
        } else {
            toast.error("No se pudo limpiar los datos de la app");
        }
    }

    return (
        <div className="space-y-5">
            {/* Servidores del navegador (tri-fuente) */}
            <section className="space-y-2">
                <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-cyan-200" />
                    <h3 className="text-sm font-medium text-amber-50">Servidores del navegador</h3>
                </div>
                <p className="text-xs text-white/50">
                    Habilita una o varias fuentes para navegar/renderizar páginas: tu Servidor
                    personal, el Servidor StarSeed y/o un Servidor externo. Si una fuente tiene un{" "}
                    <span className="text-white/75">endpoint de proxy/render</span> configurado (campo
                    «{PROXY_ENDPOINT_KEY}»), las páginas que bloquean el iframe se cargarán a través de
                    él. Sin proxy, el navegador cae a «abrir en ventana externa».
                </p>
                <TriSourceConfig
                    domain={BROWSER_DOMAIN}
                    title="Servidores de navegación / render"
                    description="Proxy/render para cualquier sitio http o formato de página. Las tres fuentes pueden convivir."
                    endpointPlaceholder="https://mi-proxy.ejemplo/render"
                    paramHints={[
                        { key: "proxy_endpoint", label: "Endpoint de proxy/render", placeholder: "https://mi-proxy.ejemplo/render" },
                        { key: "proxy_mode", label: "Modo de URL (query | path)", placeholder: "query" },
                        { key: "proxy_param", label: "Parámetro de URL (def. url)", placeholder: "url" },
                    ]}
                />
                <HonestNote>
                    El proxying/embebido real de sitios que bloquean iframes (X-Frame-Options / CSP)
                    requiere un servidor de render configurado arriba, o la extensión / app de
                    escritorio StarSeed. Sin ellos, el navegador abre esos sitios en una ventana
                    externa real (window.open).
                </HonestNote>
            </section>

            {loading ? (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 p-8 text-sm text-white/50">
                    <Loader2 className="h-4 w-4 animate-spin" /> Cargando configuracion…
                </div>
            ) : (
                <>
                    <div className="grid gap-3 lg:grid-cols-2">
                        {/* VPN */}
                        <Card className="border-white/10 bg-white/[0.03]">
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2 text-sm">
                                    <Shield className="h-4 w-4 text-emerald-300" /> VPN
                                    <Switch
                                        className="ml-auto"
                                        checked={s.vpn.enabled}
                                        onCheckedChange={(v) => patch({ vpn: { ...s.vpn, enabled: v } })}
                                    />
                                </CardTitle>
                                <CardDescription>Preferencia de túnel VPN para la navegación.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <Input
                                    value={s.vpn.provider}
                                    onChange={(e) => patch({ vpn: { ...s.vpn, provider: e.target.value } })}
                                    placeholder="Proveedor / perfil VPN"
                                    disabled={!s.vpn.enabled}
                                    className="h-8 text-xs"
                                />
                                <Input
                                    value={s.vpn.region}
                                    onChange={(e) => patch({ vpn: { ...s.vpn, region: e.target.value } })}
                                    placeholder="Región / salida (p. ej. eu-west)"
                                    disabled={!s.vpn.enabled}
                                    className="h-8 text-xs"
                                />
                                <HonestNote>
                                    <Lock className="mr-1 inline h-3 w-3" />
                                    Una web no puede crear un túnel VPN. Esta preferencia se guarda para
                                    que la app de escritorio / extensión StarSeed la aplique.
                                </HonestNote>
                            </CardContent>
                        </Card>

                        {/* DNS */}
                        <Card className="border-white/10 bg-white/[0.03]">
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2 text-sm">
                                    <Network className="h-4 w-4 text-cyan-300" /> DNS
                                </CardTitle>
                                <CardDescription>Resolución de nombres preferida.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <div className="flex flex-wrap gap-1.5">
                                    <Pill active={s.dns.mode === "automatic"} onClick={() => patch({ dns: { ...s.dns, mode: "automatic" } })}>Automático</Pill>
                                    <Pill active={s.dns.mode === "custom"} onClick={() => patch({ dns: { ...s.dns, mode: "custom" } })}>Servidores</Pill>
                                    <Pill active={s.dns.mode === "doh"} onClick={() => patch({ dns: { ...s.dns, mode: "doh" } })}>DNS-over-HTTPS</Pill>
                                </div>
                                {s.dns.mode === "custom" && (
                                    <Input
                                        value={s.dns.servers.join(", ")}
                                        onChange={(e) => patch({ dns: { ...s.dns, servers: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) } })}
                                        placeholder="1.1.1.1, 9.9.9.9"
                                        className="h-8 font-mono text-xs"
                                    />
                                )}
                                {s.dns.mode === "doh" && (
                                    <Input
                                        value={s.dns.doh}
                                        onChange={(e) => patch({ dns: { ...s.dns, doh: e.target.value } })}
                                        placeholder="https://dns.ejemplo/dns-query"
                                        className="h-8 font-mono text-xs"
                                    />
                                )}
                                <HonestNote>
                                    El navegador no puede cambiar el resolutor DNS del sistema. Se guarda
                                    como preferencia para la app/extensión StarSeed.
                                </HonestNote>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                        {/* Cookies */}
                        <Card className="border-white/10 bg-white/[0.03]">
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2 text-sm">
                                    <Cookie className="h-4 w-4 text-amber-300" /> Cookies
                                </CardTitle>
                                <CardDescription>Política de cookies del navegador.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <div className="flex flex-wrap gap-1.5">
                                    {(Object.keys(COOKIE_LABEL) as CookiesPolicy[]).map((k) => (
                                        <Pill key={k} active={s.cookiesPolicy === k} onClick={() => patch({ cookiesPolicy: k })}>
                                            {COOKIE_LABEL[k]}
                                        </Pill>
                                    ))}
                                </div>
                                <Button size="sm" variant="outline" onClick={() => onClearAppData(true, false)}>
                                    <Trash2 className="h-4 w-4" /> Borrar cookies de la app
                                </Button>
                                <HonestNote>
                                    Borra cookies legibles por JS y sessionStorage de StarSeed. Las
                                    cookies httpOnly y las de sitios incrustados las controla el navegador.
                                </HonestNote>
                            </CardContent>
                        </Card>

                        {/* Cache */}
                        <Card className="border-white/10 bg-white/[0.03]">
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2 text-sm">
                                    <Database className="h-4 w-4 text-violet-300" /> Caché
                                </CardTitle>
                                <CardDescription>Política de caché del navegador.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <div className="flex flex-wrap gap-1.5">
                                    {(Object.keys(CACHE_LABEL) as CachePolicy[]).map((k) => (
                                        <Pill key={k} active={s.cachePolicy === k} onClick={() => patch({ cachePolicy: k })}>
                                            {CACHE_LABEL[k]}
                                        </Pill>
                                    ))}
                                </div>
                                <Button size="sm" variant="outline" onClick={() => onClearAppData(false, true)}>
                                    <Trash2 className="h-4 w-4" /> Vaciar caché de la app
                                </Button>
                                <HonestNote>
                                    Vacía las cachés del Service Worker que controla StarSeed. El caché
                                    HTTP del navegador del sistema no es accesible desde una web.
                                </HonestNote>
                            </CardContent>
                        </Card>
                    </div>

                    {/* VR / AR */}
                    <Card className="border-indigo-400/20 bg-indigo-500/[0.05]">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-sm">
                                <Glasses className="h-4 w-4 text-indigo-300" /> VR / AR
                                <Switch
                                    className="ml-auto"
                                    checked={s.vrAr.enabled}
                                    onCheckedChange={(v) => patch({ vrAr: { ...s.vrAr, enabled: v } })}
                                />
                            </CardTitle>
                            <CardDescription>
                                Habilita la opción de abrir páginas en un marco inmersivo 3D/WebXR.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <label className="flex items-center gap-2 text-xs text-white/70">
                                <Switch
                                    checked={s.vrAr.default_immersive}
                                    onCheckedChange={(v) => patch({ vrAr: { ...s.vrAr, default_immersive: v } })}
                                    disabled={!s.vrAr.enabled}
                                />
                                Abrir ventanas nuevas en modo inmersivo por defecto
                            </label>
                            <HonestNote>
                                Si tu dispositivo no soporta WebXR, el marco inmersivo degrada a una
                                vista 2D con el contenido. La proyección 3D real requiere un casco XR.
                            </HonestNote>
                        </CardContent>
                    </Card>

                    {/* Historial */}
                    <Card className="border-white/10 bg-white/[0.03]">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-sm">
                                <HistoryIcon className="h-4 w-4 text-sky-300" /> Historial
                                <Badge variant="outline" className="ml-1 border-white/15 text-white/50">
                                    {s.history.entries.length}
                                </Badge>
                                <label className="ml-auto flex items-center gap-2 text-[11px] text-white/55">
                                    Registrar visitas
                                    <Switch
                                        checked={s.history.enabled}
                                        onCheckedChange={(v) => patch({ history: { ...s.history, enabled: v } })}
                                    />
                                </label>
                            </CardTitle>
                            <CardDescription>
                                Visitas reales registradas al abrir/navegar ventanas. Consultable y borrable.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {s.history.entries.length === 0 ? (
                                <p className="rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-white/40">
                                    Sin visitas registradas todavía.
                                </p>
                            ) : (
                                <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                                    {s.history.entries.map((h) => (
                                        <div key={h.id} className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/20 px-2 py-1.5">
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-xs text-amber-50">{h.title}</p>
                                                <p className="truncate text-[10px] text-white/40">{h.url}</p>
                                            </div>
                                            <span className="shrink-0 text-[10px] text-white/30">
                                                {new Date(h.ts).toLocaleString()}
                                            </span>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 w-7 shrink-0 p-0"
                                                onClick={() => window.open(h.url, "_blank", "noopener,noreferrer")}
                                                title="Abrir en pestaña"
                                            >
                                                <ExternalLink className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 w-7 shrink-0 p-0 text-rose-300/80"
                                                onClick={() => onDeleteEntry(h.id)}
                                                title="Eliminar entrada"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {s.history.entries.length > 0 && (
                                <Button size="sm" variant="outline" onClick={onClearHistory} className="text-rose-300/80">
                                    <Trash2 className="h-4 w-4" /> Borrar todo el historial
                                </Button>
                            )}
                        </CardContent>
                    </Card>

                    {/* Barra de acciones */}
                    <div className="flex flex-wrap items-center gap-2">
                        <Button onClick={persist} disabled={saving || !dirty} className="gap-2">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Guardar configuracion
                        </Button>
                        {dirty && <span className="text-[11px] text-amber-300/80">Cambios sin guardar</span>}
                        {s.updatedAt && !dirty && (
                            <span className="text-[11px] text-white/45">
                                Sincronizado · {new Date(s.updatedAt).toLocaleString()}
                            </span>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
