"use client";

/**
 * MeshPrivacyPanel — PRIVACIDAD Y PERMISOS de la malla (Adenda 98).
 * ============================================================================
 * Controla qué comparte esta neurona con la federación de la cuenta y quién
 * puede USAR su malla como relé — privacidad primero (la posición jamás viaja
 * sin opt-in explícito), transparencia total sobre cada opción.
 */

import { useEffect, useState } from "react";
import { Eye, EyeOff, MapPin, Share2, ShieldCheck, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_MESH_PRIVACY,
  getMeshPrivacy,
  MESH_PRIVACY_EVENT,
  setMeshPrivacy,
  type MeshPrivacySettings,
} from "@/ai/astraura/mesh";

export function MeshPrivacyPanel() {
  // Init con el DEFECTO estable (SSR y primer render del cliente coinciden);
  // el valor real de localStorage se sincroniza tras la hidratación en el
  // useEffect, evitando el mismatch de hidratación de React en /red-mesh.
  const [p, setP] = useState<MeshPrivacySettings>(DEFAULT_MESH_PRIVACY);

  useEffect(() => {
    setP(getMeshPrivacy());
    if (typeof window === "undefined") return;
    const on = () => setP(getMeshPrivacy());
    window.addEventListener(MESH_PRIVACY_EVENT, on);
    return () => window.removeEventListener(MESH_PRIVACY_EVENT, on);
  }, []);

  const update = (patch: Partial<MeshPrivacySettings>) => setP(setMeshPrivacy(patch));

  return (
    <Card className="border-white/10 bg-black/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldCheck className="h-4 w-4 text-emerald-300" /> Privacidad y permisos de la malla
        </CardTitle>
        <CardDescription>
          Identidad soberana: TÚ decides qué viaja. La malla LoRa local siempre funciona; esto
          gobierna la federación entre tus neuronas y el uso de esta neurona como relé.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 transition-colors duration-200 hover:border-emerald-400/25">
          <span className="flex min-w-0 items-center gap-2.5">
            {p.visibility === "account" ? (
              <Eye className="h-4 w-4 shrink-0 text-emerald-300" />
            ) : (
              <EyeOff className="h-4 w-4 shrink-0 text-white/40" />
            )}
            <span className="min-w-0">
              <span className="block text-[12px] font-medium text-white/90">Visible para mis otras neuronas</span>
              <span className="block text-[10px] text-white/45">
                publica la topología que ves SOLO a los dispositivos de tu cuenta (federación cifrada por sesión)
              </span>
            </span>
          </span>
          <Switch
            checked={p.visibility === "account"}
            onCheckedChange={(v) => update({ visibility: v ? "account" : "private" })}
          />
        </label>

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 transition-colors duration-200 hover:border-emerald-400/25">
          <span className="flex min-w-0 items-center gap-2.5">
            <MapPin className={cn("h-4 w-4 shrink-0", p.sharePosition ? "text-amber-300" : "text-white/40")} />
            <span className="min-w-0">
              <span className="block text-[12px] font-medium text-white/90">Compartir mi posición GPS</span>
              <span className="block text-[10px] text-white/45">
                OFF por defecto (la ubicación es sensible). ON = tus otras neuronas te ubican en el mapa 3D con GPS real
              </span>
            </span>
          </span>
          <Switch checked={p.sharePosition} onCheckedChange={(v) => update({ sharePosition: v })} />
        </label>

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 transition-colors duration-200 hover:border-emerald-400/25">
          <span className="flex min-w-0 items-center gap-2.5">
            <Tag className={cn("h-4 w-4 shrink-0", p.shareName ? "text-emerald-300" : "text-white/40")} />
            <span className="min-w-0">
              <span className="block text-[12px] font-medium text-white/90">Compartir nombres de nodos</span>
              <span className="block text-[10px] text-white/45">OFF = solo números de nodo en la federación</span>
            </span>
          </span>
          <Switch checked={p.shareName} onCheckedChange={(v) => update({ shareName: v })} />
        </label>

        {/* Relé SIEMPRE activo · no configurable (procomún de la red) */}
        <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/[0.06] px-3 py-2.5">
          <p className="flex items-center gap-2 text-[12px] font-medium text-white/90">
            <Share2 className="h-4 w-4 text-emerald-300" /> Relé de red · siempre activo
            <span className="ml-auto rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-200">
              on · no configurable
            </span>
          </p>
          <p className="mt-1.5 text-[10px] leading-snug text-white/55">
            Cada neurona da y recibe de forma justa y eficiente para TODA la red: el relé reemite el
            tráfico que oye para que la información llegue a todos. Es el procomún de la malla — no se
            puede apagar. (El reenvío de RADIO puro lo decide además el rol Meshtastic del nodo en su firmware.)
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default MeshPrivacyPanel;
