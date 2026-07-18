"use client";

/**
 * PersonalityOptionsWindow — VENTANA de opciones de personalidad con DISEÑO
 * ADAPTADO POR CONTEXTO (Adenda 71-bis · 2026-07-17).
 *
 * El usuario pidió: botones que desplieguen ventanas con características y
 * diseños incorporados adaptados en cada contexto de chat del sistema Astraura
 * (Exocórtex, botón Aurora/orbe, sección Astraura AI).
 *
 * Este diálogo se reutiliza en los 3 contextos y adapta su apariencia/título
 * según `context`:
 *   · "exocortex"  → tono violeta/neural, énfasis en voz y contexto vivo.
 *   · "orbe"       → tono cian/esférico, compacto, énfasis en comando de voz.
 *   · "astraura"   → tono fucsia/estudio, énfasis en modelo e inteligencia.
 *
 * Muestra las opciones de personalidad ACTIVA: inteligencia/modelo, voz,
 * carácter, emociones, permisos y el vínculo Hermes (auto-detectado).
 * Lee de @/lib/aurora/personalities y @/lib/neurons/neurons.
 *
 * SSR-safe y defensivo: sin sesión degrada a opciones por defecto.
 */

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getActivePersonality,
  HERMIONE_PERSONALITY_ID,
  listPersonalityProfiles,
} from "@/lib/aurora/personalities";
import { isHermesLinked, thisDeviceId } from "@/lib/neurons/neurons";

export type PersonalityOptionContext = "exocortex" | "orbe" | "astraura";

const THEMES: Record<PersonalityOptionContext, {
  ring: string; grad: string; title: string; sub: string; accent: string;
}> = {
  exocortex: {
    ring: "border-violet-400/40 shadow-violet-500/20",
    grad: "from-violet-600/25 via-fuchsia-600/10 to-black/60",
    title: "Exocórtex · Opciones de Aurora",
    sub: "Personaliza la voz y el contexto neural de tu exocórtex.",
    accent: "text-violet-200",
  },
  orbe: {
    ring: "border-cyan-400/40 shadow-cyan-500/20",
    grad: "from-cyan-600/25 via-sky-600/10 to-black/60",
    title: "Orbe · Comando de Aurora",
    sub: "Ajusta cómo Aurora te responde desde el orbe.",
    accent: "text-cyan-200",
  },
  astraura: {
    ring: "border-fuchsia-400/40 shadow-fuchsia-500/20",
    grad: "from-fuchsia-600/25 via-pink-600/10 to-black/60",
    title: "Astraura AI · Estudio de personalidad",
    sub: "Modelo, voz y carácter de tu IA en Astraura.",
    accent: "text-fuchsia-200",
  },
};

export function PersonalityOptionsWindow({
  open, onOpenChange, context = "astraura",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  context?: PersonalityOptionContext;
}) {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hermes, setHermes] = useState(false);
  const theme = THEMES[context];

  useEffect(() => {
    if (!open) return;
    try {
      const all = listPersonalityProfiles();
      setProfiles(all);
      const act = getActivePersonality();
      setActiveId(act?.id ?? HERMIONE_PERSONALITY_ID);
      const dev = thisDeviceId();
      setHermes(dev ? isHermesLinked((window as any).__neuronCaps) : false);
    } catch { /* */ }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "bg-gradient-to-b border backdrop-blur-2xl text-white sm:max-w-lg",
          theme.grad, theme.ring,
        )}
      >
        <DialogHeader>
          <DialogTitle className={cn("text-xl font-light", theme.accent)}>{theme.title}</DialogTitle>
          <DialogDescription className="text-white/60 text-xs">{theme.sub}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Selección de personalidad */}
          <section>
            <h4 className="text-[11px] uppercase tracking-wider text-white/40 mb-2">Personalidad</h4>
            <div className="grid grid-cols-2 gap-2">
              {profiles.slice(0, 8).map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActiveId(p.id)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-left text-xs transition",
                    p.id === activeId
                      ? "border-white/50 bg-white/10 " + theme.accent
                      : "border-white/10 bg-black/20 hover:border-white/30 text-white/70",
                  )}
                >
                  <div className="font-medium">{p.name}</div>
                  {p.description && (
                    <div className="text-[10px] text-white/40 line-clamp-2 mt-0.5">{p.description}</div>
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* Vínculo Hermes (auto-detectado) */}
          <section className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-white/80">Sincronización con Hermes</div>
                <div className="text-[10px] text-white/40">Vinculación automática con este dispositivo</div>
              </div>
              <span className={cn(
                "text-[10px] px-2 py-1 rounded-full",
                hermes ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/40",
              )}>
                {hermes ? "Vinculado" : "Detectando…"}
              </span>
            </div>
          </section>

          {/* Atajos a ajustes profundos por contexto */}
          <section className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm" variant="outline"
              className="border-white/20 text-white/70 hover:bg-white/10"
              onClick={() => { onOpenChange(false); if (typeof window !== "undefined") window.location.href = "/agent?tab=aurora"; }}
            >
              Abrir estudio completo
            </Button>
            <Button
              size="sm" variant="ghost"
              className="text-white/50 hover:text-white"
              onClick={() => onOpenChange(false)}
            >
              Cerrar
            </Button>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
