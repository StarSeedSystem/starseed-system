"use client";

/**
 * StarSeed OS — DIRECTORIO DE OFERTA PÚBLICA (Adenda 117).
 * ============================================================================
 * Surface las neuronas que ANUNCIAN ofrecer internet público del OS con sus
 * recursos (faro con `offersPublic` + puerto). Hace ACCIONABLE esa oferta: de
 * cada una se puede crear un servidor propio para usarla (el navegador no puede
 * exponer un puerto por sí mismo — honestidad radical —, así que se pide el host
 * al que la neurona es alcanzable y se arma el endpoint `http://host:puerto`).
 *
 * Lee la caché del radar (getNearbyBeacons) — la misma fuente que el radar de
 * Señales — y se refresca en vivo. Best-effort: sin red no muestra nada.
 */

import { useEffect, useMemo, useState } from "react";
import { Globe, Plus, RadioTower, RefreshCw, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getNearbyBeacons,
  subscribeNearby,
  refreshNearbyNow,
  addMeshServer,
  type RelayBeacon,
} from "@/ai/astraura/mesh";

function ago(at: number): string {
  const d = Date.now() - at;
  if (!at || d < 0) return "";
  if (d < 60_000) return `hace ${Math.max(1, Math.round(d / 1000))} s`;
  return `hace ${Math.round(d / 60_000)} min`;
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 6)}…${id.slice(-3)}` : id;
}

function OfferRow({ beacon, onAdded }: { beacon: RelayBeacon; onAdded: (name: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState(String(beacon.port ?? 8787));

  const add = () => {
    const h = host.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
    if (!h) return;
    const p = Number(port) > 0 ? Number(port) : 8787;
    const name = `Neurona ${shortId(beacon.deviceId)}`;
    addMeshServer({
      name,
      endpoint: `http://${h}:${p}`,
      visibility: "public",
      notes: `Oferta pública descubierta por el radar${beacon.region ? ` · ${beacon.region}` : ""}.`,
    });
    setAdding(false);
    setHost("");
    onAdded(name);
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
      <div className="flex items-center gap-2">
        <Globe className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[11px] font-medium text-white/85">
              {beacon.label || `Neurona ${shortId(beacon.deviceId)}`}
            </span>
            {beacon.own && (
              <span className="rounded bg-cyan-500/15 px-1 text-[8px] font-medium text-cyan-200">tu cuenta</span>
            )}
          </span>
          <span className="block truncate text-[9px] text-white/40">
            puerto {beacon.port ?? "?"}
            {beacon.region ? ` · ${beacon.region}` : ""}
            {beacon.at ? ` · ${ago(beacon.at)}` : ""}
          </span>
        </span>
        {!adding && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-3 w-3" /> Añadir
          </Button>
        )}
      </div>
      {adding && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <Input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="host o IP alcanzable"
            className="h-7 flex-1 text-[11px]"
          />
          <Input
            value={port}
            onChange={(e) => setPort(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="puerto"
            className="h-7 w-16 text-[11px]"
          />
          <Button size="sm" className="h-7 px-2 text-[10px]" onClick={add} disabled={!host.trim()}>
            <Check className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-1.5 text-[10px]" onClick={() => setAdding(false)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function PublicOffersDirectory() {
  const [beacons, setBeacons] = useState<RelayBeacon[]>([]);
  const [added, setAdded] = useState<string | null>(null);

  useEffect(() => {
    setBeacons(getNearbyBeacons());
    refreshNearbyNow();
    const unsub = subscribeNearby((b) => setBeacons(b));
    return () => unsub();
  }, []);

  const offers = useMemo(() => beacons.filter((b) => b.offersPublic), [beacons]);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <p className="mb-2 flex items-center gap-2 text-[12px] font-medium text-white/90">
        <RadioTower className="h-4 w-4 text-emerald-300" /> Oferta pública de la red
        <button
          type="button"
          title="Actualizar"
          onClick={() => refreshNearbyNow()}
          className="ml-auto cursor-pointer rounded-md p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </p>

      {offers.length === 0 ? (
        <p className="text-[10px] leading-snug text-white/45">
          Ninguna neurona ofrece internet público ahora mismo. Cuando una lo active (en su configuración de neurona),
          aparecerá aquí para conectarte.
        </p>
      ) : (
        <div className="space-y-1.5">
          {offers.map((b) => (
            <OfferRow key={b.deviceId} beacon={b} onAdded={(n) => setAdded(n)} />
          ))}
        </div>
      )}

      {added && (
        <p className="mt-2 text-[10px] text-emerald-300/90">Añadido &laquo;{added}&raquo; como servidor propio.</p>
      )}
      <p className="mt-2 text-[9px] leading-snug text-white/30">
        El navegador no puede abrir un puerto por sí mismo: para levantar de verdad el servicio, la neurona que ofrece
        ejecuta el servidor de referencia (docs/examples/starseed-mesh-server) en ese puerto.
      </p>
    </div>
  );
}

export default PublicOffersDirectory;
