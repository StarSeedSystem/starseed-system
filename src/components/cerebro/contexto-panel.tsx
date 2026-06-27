"use client";

/**
 * ContextoPanel — pilar CONTEXTO del Cerebro: configura los SENTIDOS de Aurora.
 *
 * Cada sentido (micrófono, cámara, pantalla, ubicación, portapapeles, archivos,
 * notificaciones + sentidos CUSTOM añadibles) se configura por SEPARADO:
 *   - habilitar/deshabilitar (interruptor maestro, persistido en senses_settings),
 *   - elegir un PROVEEDOR/servicio por sentido (navegador, Sakana-Fugu, Sakana
 *     propio, servidor externo) con su CONTEXTO (endpoint/modelo/pool…),
 *   - activar el modo "emociones" (concepto Sakana): el sentido se auto-ajusta
 *     según tus preferencias/configs/contextos.
 * La config por-sentido vive en `brain_senses`; el maestro enable/aurora en
 * `senses_settings` (reutilizando src/lib/senses/senses.ts).
 */

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  SENSES,
  getSenses,
  saveSenses,
  requestSense,
  defaultConfig,
  type SensesConfig,
} from "@/lib/senses/senses";
import {
  SENSE_PROVIDERS,
  senseProviderById,
  listBrainSenses,
  upsertBrainSense,
  deleteBrainSense,
  type BrainSense,
  type SenseProvider,
} from "@/lib/cerebro/brain-senses";
import { useRealtimeRows } from "@/lib/realtime/realtime";
import {
  Sparkles,
  Plus,
  Loader2,
  Save,
  Trash2,
  HeartPulse,
  Cpu,
  Sliders,
} from "lucide-react";

/** Sentido a renderizar: combina el catálogo base + sentidos custom de DB. */
interface MergedSense {
  id: string;
  label: string;
  blurb: string;
  custom: boolean;
}

export default function ContextoPanel() {
  // Maestro enable/aurora/astraura (senses_settings).
  const [master, setMaster] = useState<SensesConfig>(defaultConfig());
  const [loadingMaster, setLoadingMaster] = useState(true);
  const [savingMaster, setSavingMaster] = useState(false);

  // Config por-sentido (brain_senses) con realtime.
  const { rows: senseConfigs, reload } = useRealtimeRows<BrainSense>(
    "brain_senses",
    () => listBrainSenses(),
    { idKey: "id" },
  );

  const [newSenseName, setNewSenseName] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const cfg = await getSenses();
      if (!alive) return;
      setMaster(cfg);
      setLoadingMaster(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Mezcla catálogo base + custom (sentidos en DB que no están en SENSES).
  const merged: MergedSense[] = useMemo(() => {
    const base: MergedSense[] = SENSES.map((s) => ({
      id: s.id,
      label: s.label,
      blurb: s.blurb,
      custom: false,
    }));
    const known = new Set(SENSES.map((s) => s.id));
    const customs: MergedSense[] = senseConfigs
      .filter((c) => !known.has(c.sense))
      .map((c) => ({
        id: c.sense,
        label: c.label || c.sense,
        blurb: "Sentido personalizado.",
        custom: true,
      }));
    return [...base, ...customs];
  }, [senseConfigs]);

  const configFor = (senseId: string): BrainSense | undefined =>
    senseConfigs.find((c) => c.sense === senseId);

  const setMasterFlag = (
    bucket: "enabled" | "aurora",
    id: string,
    value: boolean,
  ) => {
    setMaster((prev) => {
      const next: SensesConfig = {
        enabled: { ...prev.enabled },
        aurora: { ...prev.aurora },
        astraura: { ...prev.astraura },
      };
      next[bucket][id] = value;
      if (bucket === "enabled" && !value) {
        next.aurora[id] = false;
        next.astraura[id] = false;
      }
      if (bucket === "enabled" && value && !(id in next.aurora)) {
        next.aurora[id] = true;
      }
      return next;
    });
  };

  const saveMaster = async () => {
    setSavingMaster(true);
    const saved = await saveSenses(master);
    setSavingMaster(false);
    if (saved) {
      setMaster(saved);
      toast.success("Sentidos guardados. Aurora honrará tu elección.");
    } else {
      toast.error("No se pudieron guardar los sentidos.");
    }
  };

  const onAddSense = async () => {
    const name = newSenseName.trim().toLowerCase().replace(/\s+/g, "-");
    if (!name) return;
    setAdding(true);
    const created = await upsertBrainSense({
      sense: name,
      label: newSenseName.trim(),
      enabled: false,
      provider: "external",
      context: {},
      emotions_mode: false,
    });
    setAdding(false);
    setNewSenseName("");
    if (created) {
      await reload();
      toast.success(`Sentido «${created.label}» añadido.`);
    } else {
      toast.error("No se pudo añadir el sentido.");
    }
  };

  const activeCount = merged.filter((s) => master.enabled[s.id]).length;

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles className="w-5 h-5 text-amber-300" />
          <h3 className="text-base font-semibold text-amber-50">Sentidos de Aurora</h3>
          <Badge variant="outline" className="ml-auto border-amber-500/40 text-amber-300">
            {activeCount} activos
          </Badge>
        </div>
        <p className="mt-2 text-sm text-white/60">
          Configura cada sentido por separado: actívalo, elige su proveedor/servicio y su contexto. Integra motores
          de sentidos externos (gratuitos) o el motor avanzado «Sakana Fugu». Activa «emociones» para que el sentido
          se auto-ajuste según tus preferencias y contexto.
        </p>
        <p className="mt-2 text-xs text-white/45">
          Honestidad: los sentidos del navegador sólo capturan tras tu permiso explícito (botón «Probar»). Las claves
          se referencian por nombre de la bóveda — nunca el valor en claro.
        </p>
      </div>

      {loadingMaster ? (
        <div className="flex items-center gap-2 text-sm text-white/50 px-1 py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando sentidos…
        </div>
      ) : (
        <div className="space-y-3">
          {merged.map((s) => (
            <SenseCard
              key={s.id}
              sense={s}
              masterOn={!!master.enabled[s.id]}
              auroraOn={!!master.aurora[s.id]}
              config={configFor(s.id)}
              onMaster={(b, v) => setMasterFlag(b, s.id, v)}
              onConfigChanged={reload}
              onRemoveCustom={async () => {
                if (!confirm(`¿Quitar el sentido «${s.label}»?`)) return;
                await deleteBrainSense(s.id);
                await reload();
                toast.success("Sentido quitado.");
              }}
            />
          ))}
        </div>
      )}

      {/* Añadir sentido + Guardar maestro */}
      <div className="rounded-xl border border-white/10 bg-black/20 p-3 flex flex-col sm:flex-row gap-2 sm:items-center">
        <Input
          value={newSenseName}
          onChange={(e) => setNewSenseName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAddSense()}
          placeholder="Añadir sentido nuevo (p.ej. biometría)"
          className="h-8 text-sm bg-black/30"
        />
        <Button size="sm" variant="outline" className="gap-1.5 shrink-0" disabled={adding || !newSenseName.trim()} onClick={onAddSense}>
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Añadir sentido
        </Button>
        <Button size="sm" className="gap-1.5 shrink-0 sm:ml-auto" disabled={savingMaster} onClick={saveMaster}>
          {savingMaster ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar sentidos
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tarjeta de un sentido                                               */
/* ------------------------------------------------------------------ */

function SenseCard({
  sense,
  masterOn,
  auroraOn,
  config,
  onMaster,
  onConfigChanged,
  onRemoveCustom,
}: {
  sense: MergedSense;
  masterOn: boolean;
  auroraOn: boolean;
  config?: BrainSense;
  onMaster: (bucket: "enabled" | "aurora", value: boolean) => void;
  onConfigChanged: () => void;
  onRemoveCustom: () => void;
}) {
  const [provider, setProvider] = useState<SenseProvider>(config?.provider || (sense.custom ? "external" : "browser"));
  const [ctx, setCtx] = useState<Record<string, string>>(() => {
    const c: Record<string, string> = {};
    for (const [k, v] of Object.entries(config?.context || {})) c[k] = String(v ?? "");
    return c;
  });
  const [emotions, setEmotions] = useState<boolean>(!!config?.emotions_mode);
  const [savingCfg, setSavingCfg] = useState(false);
  const [testing, setTesting] = useState(false);
  const [open, setOpen] = useState(false);

  // Re-sincroniza cuando llega una versión nueva por realtime.
  useEffect(() => {
    if (!config) return;
    setProvider(config.provider);
    setEmotions(!!config.emotions_mode);
    const c: Record<string, string> = {};
    for (const [k, v] of Object.entries(config.context || {})) c[k] = String(v ?? "");
    setCtx(c);
  }, [config?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const def = senseProviderById(provider);

  const saveConfig = async () => {
    setSavingCfg(true);
    const saved = await upsertBrainSense({
      sense: sense.id,
      label: sense.label,
      enabled: masterOn,
      provider,
      context: ctx,
      emotions_mode: emotions,
    });
    setSavingCfg(false);
    if (saved) {
      toast.success(`Proveedor de «${sense.label}» guardado: ${def?.label}.`);
      onConfigChanged();
    } else {
      toast.error("No se pudo guardar la configuración del sentido.");
    }
  };

  const onTest = async () => {
    if (sense.custom) {
      toast.message("Sentido personalizado: la prueba depende de tu servidor.");
      return;
    }
    setTesting(true);
    const res = await requestSense(sense.id);
    setTesting(false);
    if (res.ok) toast.success(`${sense.label}: permiso concedido.`);
    else if (res.state === "denied") toast.error(`${sense.label}: permiso denegado.`);
    else if (res.state === "unsupported") toast.message(`${sense.label}: no disponible aquí.`);
    else toast.error(`${sense.label}: ${res.error || "no se pudo comprobar"}.`);
  };

  return (
    <div
      className={cn(
        "rounded-xl border bg-black/20 p-4 transition-colors",
        masterOn ? "border-amber-500/30" : "border-white/10",
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 rounded-lg p-2", masterOn ? "bg-amber-500/15" : "bg-white/5")}>
          <Cpu className={cn("w-5 h-5", masterOn ? "text-amber-300" : "text-white/40")} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-amber-50">{sense.label}</span>
            {sense.custom && (
              <Badge variant="outline" className="border-cyan-500/40 text-cyan-300 text-[10px] py-0">
                personalizado
              </Badge>
            )}
            {config && (
              <Badge variant="outline" className="border-violet-500/40 text-violet-300 text-[10px] py-0 gap-1">
                {senseProviderById(config.provider)?.icon} {senseProviderById(config.provider)?.label?.split(" ")[0]}
              </Badge>
            )}
            {config?.emotions_mode && (
              <Badge variant="outline" className="border-pink-500/40 text-pink-300 text-[10px] py-0 gap-1">
                <HeartPulse className="w-3 h-3" /> emociones
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-white/55">{sense.blurb}</p>

          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
            <label className={cn("flex items-center gap-2 text-xs", masterOn ? "text-white/70" : "text-white/30")}>
              <Switch checked={auroraOn && masterOn} disabled={!masterOn} onCheckedChange={(v) => onMaster("aurora", v)} />
              Aurora puede usarlo
            </label>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setOpen((o) => !o)}>
              <Sliders className="w-3.5 h-3.5" />
              {open ? "Ocultar" : "Configurar proveedor"}
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={testing} onClick={onTest}>
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Probar
            </Button>
            {sense.custom && (
              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs text-red-300 hover:text-red-200" onClick={onRemoveCustom}>
                <Trash2 className="w-3.5 h-3.5" /> Quitar
              </Button>
            )}
          </div>
        </div>

        {/* Maestro */}
        <div className="flex flex-col items-end gap-1 pl-2">
          <Switch checked={masterOn} onCheckedChange={(v) => onMaster("enabled", v)} />
          <span className="text-[10px] text-white/40">Habilitar</span>
        </div>
      </div>

      {/* Panel de proveedor / contexto */}
      {open && (
        <div className="mt-4 border-t border-white/10 pt-3 space-y-3">
          <span className="text-xs font-semibold text-white/70">Proveedor / motor del sentido</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {SENSE_PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => setProvider(p.id)}
                className={cn(
                  "flex items-start gap-2 rounded-lg border p-2.5 text-left transition-colors",
                  provider === p.id ? "border-violet-500/50 bg-violet-500/10" : "border-white/10 hover:bg-white/5",
                )}
              >
                <span className="text-base leading-none mt-0.5">{p.icon}</span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm text-white/85">{p.label}</span>
                    {p.oss && (
                      <Badge variant="outline" className="border-emerald-500/30 text-emerald-300/80 text-[9px] py-0">
                        open-source
                      </Badge>
                    )}
                  </span>
                  <span className="block text-[11px] text-white/45 mt-0.5">{p.blurb}</span>
                </span>
              </button>
            ))}
          </div>

          {def && def.fields.length > 0 && (
            <div className="space-y-2">
              {def.fields.map((f) => (
                <div key={f.key}>
                  <label className="text-[11px] text-white/55">{f.label}</label>
                  <Input
                    value={ctx[f.key] ?? ""}
                    onChange={(e) => setCtx((p) => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="h-8 text-sm bg-black/30 mt-0.5"
                  />
                </div>
              ))}
            </div>
          )}

          <label className="flex items-start gap-2 text-xs text-white/70 rounded-lg border border-pink-500/20 bg-pink-500/5 p-2.5">
            <Switch checked={emotions} onCheckedChange={setEmotions} className="mt-0.5" />
            <span>
              <span className="flex items-center gap-1.5 font-medium text-pink-200">
                <HeartPulse className="w-3.5 h-3.5" /> Modo emociones (Sakana)
              </span>
              <span className="block text-[11px] text-white/50 mt-0.5">
                El sentido se auto-ajusta según tus preferencias, configuraciones y contextos específicos.
              </span>
            </span>
          </label>

          <div className="flex justify-end">
            <Button size="sm" className="gap-1.5" disabled={savingCfg} onClick={saveConfig}>
              {savingCfg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar proveedor
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
