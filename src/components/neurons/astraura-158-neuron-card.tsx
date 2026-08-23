"use client";

/**
 * BACKENDS ASTRAURA 1.58 EN TUS NEURONAS (Ola 3 · Adenda 155).
 * ----------------------------------------------------------------------------
 * Cada neurona puede correr SU backend soberano 1.58 (FastAPI + BitNet). Esta
 * tarjeta, dentro del panel de neuronas, enseña el estado real del backend de
 * ESTA neurona (endpoint, motor honesto, BitNet nativo), permite cambiar el
 * endpoint (local · LAN · túnel) con sonda antes de guardar, activarlo o
 * desactivarlo como fuente local (`NeuronSettings.astraura158`), y muestra qué
 * declaran las DEMÁS neuronas de la cuenta (`NeuronCapabilities.astraura158`).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Binary, CheckCircle2, ExternalLink, Loader2, RefreshCw, Save, XCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  NEURON_EVENT, listNeurons, settingsFor, setNeuronSettings, thisDeviceId, type Neuron,
} from "@/lib/neurons/neurons";
import { describeAstraura158Engine, fetchAstraura158Status, probeAstraura158, type Astraura158Status } from "@/lib/astraura/astraura-158-client";

const BTN = "inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-white/85 transition-colors hover:border-cyan-400/40 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50";
const INPUT = "min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] text-white outline-none transition-colors placeholder:text-white/30 focus:border-cyan-400/50";

export function Astraura158NeuronCard() {
  const [deviceId, setDeviceId] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState<Astraura158Status | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<{ ok: boolean; model?: string; error?: string } | null>(null);
  const [others, setOthers] = useState<Neuron[]>([]);

  const readLocal = useCallback(() => {
    try {
      const id = thisDeviceId();
      setDeviceId(id);
      const s = settingsFor(id).astraura158;
      setEndpoint(s?.endpoint ?? "");
      setEnabled(s?.enabled !== false);
      void listNeurons()
        .then((list) => setOthers(list.filter((n) => n.id !== id && n.capabilities?.astraura158)))
        .catch(() => setOthers([]));
    } catch { /* SSR/defensivo */ }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetchAstraura158Status("local");
    setStatus(r.ok ? r.data : null);
    setError(r.ok ? "" : r.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    readLocal();
    void refresh();
    const h = () => readLocal();
    window.addEventListener(NEURON_EVENT, h);
    return () => window.removeEventListener(NEURON_EVENT, h);
  }, [readLocal, refresh]);

  const engine = describeAstraura158Engine(status);

  async function doProbe() {
    setProbing(true);
    setProbe(null);
    const r = await probeAstraura158(endpoint || "http://127.0.0.1:8000");
    setProbe(r);
    setProbing(false);
  }

  function save() {
    try {
      setNeuronSettings(thisDeviceId(), { astraura158: { endpoint: endpoint.trim() || undefined, enabled } });
      toast.success("Backend 1.58 de esta neurona guardado", { description: endpoint.trim() || "endpoint por defecto (127.0.0.1:8000)" });
      void refresh();
    } catch {
      toast.error("No se pudo guardar el ajuste de la neurona");
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-fuchsia-500/[0.06] to-transparent p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[12px] font-semibold text-white/90">
          <Binary className="h-4 w-4 text-fuchsia-300" aria-hidden="true" /> Backend Astraura 1.58 en tus neuronas
        </p>
        <div className="flex items-center gap-1.5">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-white/50" aria-label="comprobando" /> : status ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" aria-label="en línea" /> : <XCircle className="h-3.5 w-3.5 text-rose-300" aria-label="sin respuesta" />}
          <button type="button" className={BTN} onClick={() => { void refresh(); }} aria-label="Recomprobar backend"><RefreshCw className="h-3 w-3" aria-hidden="true" /></button>
          <Link href="/agent?tab=astraura-158" className={BTN}><ExternalLink className="h-3 w-3" aria-hidden="true" /> Studio</Link>
        </div>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-white/60">
        {status
          ? <>Esta neurona sirve el sistema primario: <span className={engine.real ? "text-emerald-200" : "text-amber-200"}>{engine.label}</span>{engine.bitnet ? " · BitNet nativo" : ""}.</>
          : <>Sin backend en esta neurona ({error || "apagado"}). El sistema primario usará la nube o la cadena de secundarios.</>}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input className={INPUT} value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="http://127.0.0.1:8000 · http://IP-LAN:8000 · https://túnel" aria-label="Endpoint del backend 1.58 de esta neurona" />
        <button type="button" className={BTN} disabled={probing} onClick={() => { void doProbe(); }} aria-label="Probar endpoint">
          {probing ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3 w-3" aria-hidden="true" />} Probar
        </button>
        <label className="flex items-center gap-1.5 text-[10px] text-white/65">
          <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Usar el backend local de esta neurona" /> usar en esta neurona
        </label>
        <button type="button" className={cn(BTN, "border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-100")} onClick={save} aria-label="Guardar endpoint">
          <Save className="h-3 w-3" aria-hidden="true" /> Guardar
        </button>
      </div>
      {probe && (
        <p className={cn("mt-1 text-[10px]", probe.ok ? "text-emerald-200" : "text-rose-200")}>
          {probe.ok ? `responde · ${probe.model ?? "modelo desconocido"}` : `no responde: ${probe.error}`}
        </p>
      )}
      {others.length > 0 && (
        <div className="mt-2 border-t border-white/10 pt-2">
          <p className="text-[10px] uppercase tracking-wide text-white/40">Otras neuronas de tu cuenta</p>
          <ul className="mt-1 space-y-0.5">
            {others.slice(0, 6).map((n) => {
              const a = n.capabilities?.astraura158;
              return (
                <li key={n.id} className="flex items-center gap-2 text-[10px] text-white/65">
                  <span className={cn("h-1.5 w-1.5 rounded-full", a?.online ? "bg-emerald-300" : "bg-white/25")} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{n.name ?? n.id}</span>
                  <span className="truncate font-code text-white/45">{a?.model ?? (a?.online ? "en línea" : "apagado")}{a?.bitnet ? " · BitNet" : ""}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <p className="mt-2 text-[9px] leading-snug text-white/35">
        El endpoint es por-neurona (no viaja con la cuenta). El OS publicado usa su proxy para la nube; esta tarjeta gobierna la vía local/LAN/túnel de ESTA neurona (deviceId {deviceId ? deviceId.slice(0, 8) : "…"}).
      </p>
    </div>
  );
}

export default Astraura158NeuronCard;
