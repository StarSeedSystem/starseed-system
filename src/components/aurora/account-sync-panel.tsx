"use client";

// ════════════════════════════════════════════════════════════════
// AccountSyncPanel — "Servidor de sincronización de tu cuenta".
// Elige POR CUENTA/DISPOSITIVO dónde se sincronizan tus preferencias
// (SYNCED_KEYS): Supabase oficial de StarSeed (DEFAULT, comportamiento
// de siempre) · Supabase propio (tu URL + clave anónima) · Local (sin
// red: exporta/importa un archivo de respaldo). Prueba de conexión +
// estado + subir/descargar. Extensible a más proveedores (WebDAV/Drive)
// vía `sync-providers.ts` sin tocar esta UI.
//
// NO ROMPE NADA: mientras no se toque, el proveedor activo es
// "official" y todo se comporta exactamente como hasta ahora
// (delega en settings-sync.ts / utils/supabase/client.ts).
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  CheckCircle2, CloudCog, Database, HardDrive, Loader2, Plug, ShieldCheck,
  Upload, Download, XCircle, Eye, EyeOff, Waypoints,
} from "lucide-react";
import {
  SYNC_PROVIDERS, activeSyncProviderId, setActiveSyncProvider,
  getProviderConfig, setProviderConfig,
  type SyncProvider, type SyncProviderId,
} from "@/ai/astraura/sync-providers";

const PROVIDER_ICON: Record<string, typeof CloudCog> = {
  official: ShieldCheck,
  "own-supabase": Database,
  local: HardDrive,
  "p2p-syncthing": Waypoints,
};

export function AccountSyncPanel() {
  const [activeId, setActiveId] = useState<SyncProviderId>("official");
  const [ready, setReady] = useState(false);
  const [configDraft, setConfigDraft] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState<"push" | "pull" | null>(null);
  const [lastResult, setLastResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Carga inicial (cliente): proveedor activo + su config guardada.
  useEffect(() => {
    const id = activeSyncProviderId();
    setActiveId(id);
    setConfigDraft(getProviderConfig(id));
    setReady(true);
  }, []);

  const active = useMemo<SyncProvider>(
    () => SYNC_PROVIDERS.find((p) => p.id === activeId) ?? SYNC_PROVIDERS[0],
    [activeId],
  );

  const selectProvider = useCallback((p: SyncProvider) => {
    setActiveId(p.id);
    setConfigDraft(getProviderConfig(p.id));
    setTestResult(null);
    setLastResult(null);
  }, []);

  const saveAndActivate = useCallback(() => {
    setProviderConfig(active.id, configDraft);
    setActiveSyncProvider(active.id);
    toast.success(`Servidor de sincronización cambiado a «${active.label}».`);
  }, [active, configDraft]);

  const test = useCallback(async () => {
    // Persistimos la config antes de probar (para que testConnection la vea).
    setProviderConfig(active.id, configDraft);
    setTesting(true);
    setTestResult(null);
    try {
      const res = await active.testConnection();
      setTestResult(res);
      toast[res.ok ? "success" : "message"](res.message);
    } catch (e: any) {
      const msg = `Error inesperado: ${e?.message ?? e}`;
      setTestResult({ ok: false, message: msg });
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  }, [active, configDraft]);

  const doPush = useCallback(async () => {
    setProviderConfig(active.id, configDraft);
    setBusy("push");
    setLastResult(null);
    try {
      const res = await active.push();
      setLastResult(res);
      toast[res.ok ? "success" : "message"](res.message);
    } catch (e: any) {
      const msg = `Error inesperado: ${e?.message ?? e}`;
      setLastResult({ ok: false, message: msg });
      toast.error(msg);
    } finally {
      setBusy(null);
    }
  }, [active, configDraft]);

  const doPull = useCallback(async () => {
    setProviderConfig(active.id, configDraft);
    setBusy("pull");
    setLastResult(null);
    try {
      const res = await active.pull();
      setLastResult(res);
      toast[res.ok ? "success" : "message"](res.message);
    } catch (e: any) {
      const msg = `Error inesperado: ${e?.message ?? e}`;
      setLastResult({ ok: false, message: msg });
      toast.error(msg);
    } finally {
      setBusy(null);
    }
  }, [active, configDraft]);

  if (!ready) return null;

  return (
    <div className="space-y-4">
      <Card className="border-cyan-500/20 bg-cyan-950/10">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-cyan-50">
            <CloudCog className="h-4 w-4 text-cyan-300" /> Servidor de sincronización de tu cuenta
          </CardTitle>
          <CardDescription className="text-cyan-300/60">
            Elige DÓNDE se sincronizan tus preferencias (apariencia, dock, Inteligencia de Aurora, memorias, Biblioteca…)
            entre tus dispositivos. Por defecto, el de siempre: tu cuenta soberana StarSeed. Puedes cambiar a tu propio
            Supabase o a un respaldo local — sin perder lo que ya tienes sincronizado hoy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Selector de proveedor */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {SYNC_PROVIDERS.map((p) => {
              const Icon = PROVIDER_ICON[p.id] ?? CloudCog;
              const isActive = p.id === active.id;
              const isCurrentDefault = p.id === "official";
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectProvider(p)}
                  title={p.description}
                  className={cn(
                    "flex cursor-pointer flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors duration-200",
                    isActive
                      ? "border-cyan-400/50 bg-cyan-500/10"
                      : "border-white/10 bg-white/[0.03] hover:border-white/20",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={cn("h-4 w-4", isActive ? "text-cyan-300" : "text-white/50")} />
                    <span className="text-sm font-medium text-white/90">{p.label}</span>
                    {isCurrentDefault && (
                      <Badge variant="outline" className="border-emerald-400/30 text-[9px] text-emerald-200">
                        por defecto
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed text-white/45">{p.description}</p>
                </button>
              );
            })}
          </div>

          {/* Config del proveedor seleccionado (si hace falta) */}
          {active.needsConfig && (
            <div className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-widest text-white/40">Configuración · {active.label}</span>
                <button
                  type="button"
                  onClick={() => setShowSecrets((v) => !v)}
                  className="inline-flex cursor-pointer items-center gap-1 text-[10px] text-white/40 hover:text-white/70"
                  title={showSecrets ? "Ocultar valores sensibles" : "Mostrar valores sensibles"}
                >
                  {showSecrets ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {showSecrets ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              {active.configFields.map((f) => (
                <label key={f.key} className="flex flex-col gap-1">
                  <span className="text-xs text-white/50">{f.label}</span>
                  <Input
                    value={configDraft[f.key] ?? ""}
                    onChange={(e) => setConfigDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    type={f.secret && !showSecrets ? "password" : "text"}
                    className="h-9 border-white/15 bg-black/30 text-white placeholder:text-white/30"
                    spellCheck={false}
                  />
                </label>
              ))}
              <p className="text-[10px] text-white/35">
                Guardado solo en este dispositivo (localStorage). Nunca viaja con el sync oficial.
              </p>
            </div>
          )}

          {/* Acciones */}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5 border-cyan-500/30 text-cyan-100" onClick={test} disabled={testing}>
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
              Probar conexión
            </Button>
            <Button size="sm" className="gap-1.5 bg-cyan-600 text-white hover:bg-cyan-500" onClick={doPush} disabled={busy !== null}>
              {busy === "push" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Subir mis preferencias
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 border-white/15 text-white/80" onClick={doPull} disabled={busy !== null}>
              {busy === "pull" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Descargar mis preferencias
            </Button>
            {active.id !== activeSyncProviderId() && (
              <Button size="sm" variant="ghost" className="ml-auto gap-1.5 text-emerald-300" onClick={saveAndActivate}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Usar este servidor
              </Button>
            )}
            {active.id === activeSyncProviderId() && (
              <Badge variant="outline" className="ml-auto gap-1 border-emerald-400/30 text-[10px] text-emerald-200">
                <CheckCircle2 className="h-3 w-3" /> Activo ahora
              </Badge>
            )}
          </div>

          {/* Resultado de la prueba de conexión */}
          {testResult && (
            <div
              className={cn(
                "flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] leading-relaxed",
                testResult.ok ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-100" : "border-amber-500/30 bg-amber-950/20 text-amber-100",
              )}
            >
              {testResult.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Resultado de subir/descargar */}
          {lastResult && (
            <div
              className={cn(
                "flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] leading-relaxed",
                lastResult.ok ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-100" : "border-amber-500/30 bg-amber-950/20 text-amber-100",
              )}
            >
              {lastResult.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              <span>{lastResult.message}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default AccountSyncPanel;
