"use client";

import { useState } from "react";
import { Palette, MousePointerClick, Image, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { settingsFor, iconoElegido, setNeuronSettings, setNeuronKind, thisDeviceId, NeuronKind } from "@/lib/neurons/neurons";

const TIPOS: { id: NeuronKind; label: string; icon: string }[] = [
  { id: "desktop", label: "Escritorio", icon: "Monitor" },
  { id: "laptop", label: "Portátil", icon: "Laptop" },
  { id: "mobile", label: "Móvil", icon: "Smartphone" },
  { id: "tablet", label: "Tableta", icon: "Tablet" },
  { id: "server", label: "Servidor", icon: "Server" },
  { id: "other", label: "Otro", icon: "Cpu" },
];

function TipoIcon({ tipo }: { tipo: NeuronKind }) {
  const icons: Record<NeuronKind, React.ReactNode> = {
    desktop: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M2 9h20"/><path d="M6 14h12"/></svg>,
    laptop: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M2 17h20"/></svg>,
    mobile: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>,
    tablet: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M12 18h.01"/></svg>,
    server: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="8" rx="1"/><rect x="2" y="14" width="20" height="8" rx="1"/></svg>,
    other: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 4v16"/><path d="M15 4v16"/></svg>,
  };
  return <span className="w-5 h-5" aria-hidden>{icons[tipo]}</span>;
}

export interface SeccionIdentidadProps {
  neurona: { id: string; name: string; kind: NeuronKind; capabilities: Record<string, unknown> };
  nombreAparato: string;
  onNombreAparatoChange: (nombre: string) => void;
  esEsta: boolean;
}

export function SeccionIdentidad({ neurona, nombreAparato, onNombreAparatoChange, esEsta }: SeccionIdentidadProps) {
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [borradorNombre, setBorradorNombre] = useState(neurona.name);
  const [editandoAparato, setEditandoAparato] = useState(false);
  const [borradorAparato, setBorradorAparato] = useState(nombreAparato);
  const [guardando, setGuardando] = useState(false);

  const settings = settingsFor(neurona.id);
  const tipoActual = iconoElegido(settings.icono) ?? neurona.kind;
  const colorActual = settings.colorPublico ?? "#007FFF";

  const commitNombre = async () => {
    const nombre = borradorNombre.trim().slice(0, 60);
    if (nombre && nombre !== neurona.name) {
      setGuardando(true);
      try {
        setNeuronSettings(neurona.id, { name: nombre });
      } finally {
        setGuardando(false);
      }
    }
    setEditandoNombre(false);
  };

  const commitAparato = async () => {
    const nombre = borradorAparato.trim().slice(0, 60);
    if (nombre && nombre !== nombreAparato) {
      onNombreAparatoChange(nombre);
      try {
        await import("@/lib/neurons/neurons").then((m) => m.renombrarEsteAparato(nombre));
      } catch { /* defensivo */ }
    }
    setEditandoAparato(false);
  };

  const cambiarTipo = (nuevoTipo: NeuronKind) => {
    setNeuronKind(neurona.id, nuevoTipo);
  };

  const cambiarColor = (color: string) => {
    if (/^#[0-9a-fA-F]{6}$/.test(color)) {
      setNeuronSettings(neurona.id, { colorPublico: color.toLowerCase() });
    }
  };

  return (
    <div className="space-y-3" data-seccion="identidad">
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs font-medium text-white/60 cursor-pointer">
          <svg className="w-4 h-4 text-emerald-300 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span>Nombre de la neurona</span>
        </label>
        {editandoNombre ? (
          <div className="flex items-center gap-2">
            <Input
              value={borradorNombre}
              onChange={(e) => setBorradorNombre(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitNombre(); if (e.key === "Escape") { setBorradorNombre(neurona.name); setEditandoNombre(false); } }}
              onBlur={commitNombre}
              className="h-8 flex-1 min-w-0 bg-black/30 border-white/10 text-sm"
              autoFocus
              maxLength={60}
              aria-label="Nombre de la neurona"
            />
            <Button size="sm" variant="ghost" className="cursor-pointer h-8 px-2" onClick={commitNombre} disabled={guardando || !borradorNombre.trim()}>
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-emerald-400" />}
            </Button>
          </div>
        ) : (
          <button
            onClick={() => { setBorradorNombre(neurona.name); setEditandoNombre(true); }}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left cursor-pointer rounded-lg border border-white/10 bg-black/20 hover:bg-white/[0.02] transition-colors"
          >
            <span className="text-sm text-white/90 truncate max-w-[280px]">{neurona.name}</span>
            <MousePointerClick className="w-4 h-4 text-white/30 flex-shrink-0" aria-hidden />
          </button>
        )}
      </div>

      {esEsta && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-medium text-white/60 cursor-pointer">
            <Palette className="w-4 h-4 text-sky-300 flex-shrink-0" aria-hidden />
            <span>Nombre de este aparato</span>
          </label>
          {editandoAparato ? (
            <div className="flex items-center gap-2">
              <Input
                value={borradorAparato}
                onChange={(e) => { setBorradorAparato(e.target.value); onNombreAparatoChange(e.target.value); }}
                onKeyDown={(e) => { if (e.key === "Enter") commitAparato(); if (e.key === "Escape") { setBorradorAparato(nombreAparato); setEditandoAparato(false); } }}
                onBlur={commitAparato}
                className="h-8 flex-1 min-w-0 bg-black/30 border-white/10 text-sm"
                autoFocus
                maxLength={60}
                aria-label="Nombre de este aparato"
              />
              <Button size="sm" variant="ghost" className="cursor-pointer h-8 px-2" onClick={commitAparato}>
                <Check className="w-4 h-4 text-emerald-400" />
              </Button>
            </div>
          ) : (
            <button
              onClick={() => { setBorradorAparato(nombreAparato); setEditandoAparato(true); }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left cursor-pointer rounded-lg border border-white/10 bg-black/20 hover:bg-white/[0.02] transition-colors"
            >
              <span className="text-sm text-white/90 truncate max-w-[280px]">{nombreAparato || "Sin nombre"}</span>
              <MousePointerClick className="w-4 h-4 text-white/30 flex-shrink-0" aria-hidden />
            </button>
          )}
        </div>
      )}

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs font-medium text-white/60 cursor-pointer">
          <svg className="w-4 h-4 text-amber-300 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 4v16"/><path d="M15 4v16"/></svg>
          <span>Tipo / Icono</span>
        </label>
        <div className="inline-flex rounded-lg border border-white/10 overflow-hidden">
          {TIPOS.map((t) => (
            <button
              key={t.id}
              onClick={() => cambiarTipo(t.id)}
              className={cn(
                "px-3 py-1.5 text-xs transition-colors cursor-pointer whitespace-normal flex items-center gap-1.5",
                tipoActual === t.id ? "bg-emerald-500/20 text-emerald-100" : "text-white/55 hover:bg-white/5"
              )}
              aria-pressed={tipoActual === t.id}
            >
              <TipoIcon tipo={t.id} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs font-medium text-white/60 cursor-pointer">
          <Palette className="w-4 h-4 text-fuchsia-300 flex-shrink-0" aria-hidden />
          <span>Color público</span>
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            type="color"
            value={colorActual}
            onChange={(e) => cambiarColor(e.target.value)}
            className="w-10 h-10 rounded-lg border border-white/10 bg-black/30 cursor-pointer"
            aria-label="Color público de la neurona"
          />
          <Input
            value={colorActual}
            onChange={(e) => cambiarColor(e.target.value)}
            onBlur={(e) => cambiarColor(e.target.value)}
            className="h-8 flex-1 min-w-[120px] max-w-xs bg-black/30 border-white/10 text-sm font-mono text-white/90"
            aria-label="Color público en hexadecimal"
          />
          <span className="text-[11px] text-white/40">Se ve en el control entre neuronas</span>
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs font-medium text-white/60 cursor-pointer">
          <Image className="w-4 h-4 text-sky-300 flex-shrink-0" aria-hidden />
          <span>Foto / Avatar</span>
        </label>
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-emerald-500/30 to-cyan-500/30 border border-white/10 flex items-center justify-center overflow-hidden">
            <svg className="w-8 h-8 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M12 14c-5 0-8 3-8 6v2h16v-2c0-3-3-6-8-6z"/></svg>
          </div>
          <div className="flex flex-col gap-1">
            <Button variant="outline" size="sm" className="cursor-pointer w-auto">Cambiar foto</Button>
            <Button variant="ghost" size="sm" className="cursor-pointer w-auto text-red-400/80 hover:text-red-300">Quitar</Button>
          </div>
          <span className="text-[11px] text-white/40">Se muestra en la red y en el control entre neuronas</span>
        </div>
      </div>
    </div>
  );
}

export default SeccionIdentidad;