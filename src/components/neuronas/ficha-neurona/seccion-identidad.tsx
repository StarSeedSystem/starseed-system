"use client";

import { useState } from "react";
import { Pencil, Check, Camera, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { setNeuronName, setNeuronKind, iconoElegido, type Neuron, type NeuronKind } from "@/lib/neurons/neurons";

const NOMBRE_KINDS: Record<NeuronKind, string> = {
  desktop: "Escritorio",
  laptop: "Portátil",
  mobile: "Móvil",
  tablet: "Tableta",
  server: "Servidor",
  other: "Dispositivo",
};

interface SeccionIdentidadProps {
  neurona: Neuron;
  onCambio: () => void;
  esEsta: boolean;
}

export function SeccionIdentidad({ neurona, onCambio, esEsta }: SeccionIdentidadProps) {
  const [editingNombre, setEditingNombre] = useState(false);
  const [draftNombre, setDraftNombre] = useState(neurona.name);
  const [editingIcono, setEditingIcono] = useState(false);
  const [draftIcono, setDraftIcono] = useState<NeuronKind>(neurona.kind);
  const [editingColor, setEditingColor] = useState(false);
  const [draftColor, setDraftColor] = useState("");

  const commitNombre = () => {
    const nombre = draftNombre.trim();
    if (nombre && nombre !== neurona.name) {
      try {
        setNeuronName(neurona.id, nombre);
        toast.success("Nombre actualizado");
        onCambio();
      } catch {
        toast.error("No se pudo actualizar el nombre");
      }
    }
    setEditingNombre(false);
  };

  const commitIcono = () => {
    const icono = iconoElegido(draftIcono);
    if (icono && icono !== neurona.kind) {
      try {
        setNeuronKind(neurona.id, icono);
        toast.success("Tipo de dispositivo actualizado");
        onCambio();
      } catch {
        toast.error("No se pudo actualizar el tipo");
      }
    }
    setEditingIcono(false);
  };

  const commitColor = () => {
    const color = draftColor.trim().slice(0, 7);
    if (color.match(/^#[0-9a-fA-F]{6}$/) && color !== (neurona.capabilities?.colorPublico || "")) {
      toast.success("Color actualizado");
      onCambio();
    }
    setEditingColor(false);
  };

  return (
    <section className="space-y-3" data-testid="seccion-identidad">
      <div className="flex items-start gap-3">
        <div className="relative">
          <Camera className="w-4 h-4 text-white/50" />
          <Badge className="absolute -top-1 -right-1 text-xs" variant="secondary">
            Foto
          </Badge>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-white/90 mb-1">Identidad</h4>
          <p className="text-xs text-white/50">Nombre, tipo de dispositivo y apariencia de la neurona.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <label className="text-xs text-muted-foreground mb-1.5 block">Nombre de la neurona</label>
          {editingNombre ? (
            <div className="flex items-center gap-2">
              <Input
                value={draftNombre}
                onChange={(e) => setDraftNombre(e.target.value)}
                onBlur={commitNombre}
                onKeyDown={(e) => { if (e.key === "Enter") commitNombre(); if (e.key === "Escape") setEditingNombre(false); }}
                className="h-8 text-sm"
                autoFocus
                maxLength={60}
              />
              <Button variant="ghost" size="sm" className="cursor-pointer h-8 px-2" onClick={commitNombre}>
                <Check className="w-4 h-4 text-emerald-400" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-white/90 truncate max-w-[200px]">{neurona.name}</span>
              <Button variant="ghost" size="sm" className="cursor-pointer h-7 px-1.5" onClick={() => { setDraftNombre(neurona.name); setEditingNombre(true); }}>
                <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <label className="text-xs text-muted-foreground mb-1.5 block">Tipo de dispositivo</label>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">{NOMBRE_KINDS[neurona.kind] ?? "Dispositivo"}</Badge>
            {esEsta && (
              <Button variant="ghost" size="sm" className="cursor-pointer h-7 px-1.5" onClick={() => setEditingIcono(true)}>
                <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                Cambiar
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <label className="text-xs text-muted-foreground mb-1.5 block">Color público</label>
          <div className="flex items-center gap-2">
            {neurona.capabilities?.colorPublico ? (
              <>
                <div
                  className="w-8 h-8 rounded-full border border-white/20"
                  style={{ backgroundColor: neurona.capabilities.colorPublico }}
                />
                <span className="text-xs text-white/60">{neurona.capabilities.colorPublico}</span>
              </>
            ) : (
              <span className="text-xs text-white/40">Sin color (usa el por defecto)</span>
            )}
            {esEsta && (
              <Button variant="ghost" size="sm" className="cursor-pointer h-7 px-1.5" onClick={() => setEditingColor(true)}>
                <Palette className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}