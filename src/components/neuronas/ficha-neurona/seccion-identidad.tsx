"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Neuron, NeuronKind } from "@/lib/neurons/neurons";
import { setNeuronKind, setNeuronName } from "@/lib/neurons/neurons";
import { nombreEsteAparato, renombrarEsteAparato } from "@/lib/neurons/neurons";
import { colorPublicoDeNeurona, ponerColorPublico } from "@/lib/neurons/color-publico-ajuste";
import { PALETA_COLOR_PUBLICO, colorPorDefecto } from "@/lib/neurons/color-publico";

const TIPOS: { id: NeuronKind; etiqueta: string }[] = [
  { id: "desktop", etiqueta: "Escritorio" },
  { id: "laptop", etiqueta: "Portátil" },
  { id: "mobile", etiqueta: "Móvil" },
  { id: "tablet", etiqueta: "Tableta" },
  { id: "server", etiqueta: "Servidor" },
  { id: "other", etiqueta: "Otro" },
];

export interface SeccionIdentidadProps {
  neurona: Neuron;
  alCambiar?: () => void;
}

export function SeccionIdentidad({ neurona, alCambiar }: SeccionIdentidadProps) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(neurona.name);
  const [editAparato, setEditAparato] = useState(false);
  const [nombreAparato, setNombreAparato] = useState("");
  const color = colorPublicoDeNeurona(neurona.id);

  const guardarNombre = async () => {
    const limpio = nombre.trim().slice(0, 60);
    if (limpio && limpio !== neurona.name) {
      await setNeuronName(neurona.id, limpio);
      alCambiar?.();
    }
    setEditando(false);
  };

  const guardarAparato = async () => {
    const limpio = nombreAparato.trim().slice(0, 60);
    if (limpio !== nombreEsteAparato().trim()) {
      await renombrarEsteAparato(limpio);
      alCambiar?.();
    }
    setEditAparato(false);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-white/70">Nombre de la neurona</label>
        <div className="flex items-center gap-2">
          {editando ? (
            <>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60}
                className="h-9 bg-black/20 border-white/10" aria-label="Nombre de la neurona" />
              <Button size="sm" variant="ghost" className="cursor-pointer h-9 px-2" onClick={() => void guardarNombre()}>
                <Check className="h-4 w-4" /><span className="sr-only">Guardar</span>
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-white/90 min-w-0 break-words">{neurona.name}</p>
              <Button size="sm" variant="ghost" className="cursor-pointer h-8 px-2" onClick={() => { setNombre(neurona.name); setEditando(true); }}>
                <Pencil className="h-3.5 w-3.5" /><span className="sr-only">Editar nombre</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {neurona.isThisDevice && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-white/70">Nombre de este aparato</label>
          <div className="flex items-center gap-2">
            {editAparato ? (
              <>
                <Input value={nombreAparato} onChange={(e) => setNombreAparato(e.target.value)} maxLength={60}
                  className="h-9 bg-black/20 border-white/10" aria-label="Nombre de este aparato" />
                <Button size="sm" variant="ghost" className="cursor-pointer h-9 px-2" onClick={() => void guardarAparato()}>
                  <Check className="h-4 w-4" /><span className="sr-only">Guardar</span>
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-white/90 min-w-0 break-words">{nombreEsteAparato() || "Sin nombre propio"}</p>
                <Button size="sm" variant="ghost" className="cursor-pointer h-8 px-2" onClick={() => { setNombreAparato(nombreEsteAparato()); setEditAparato(true); }}>
                  <Pencil className="h-3.5 w-3.5" /><span className="sr-only">Editar nombre del aparato</span>
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <span className="text-xs font-medium text-white/70">Tipo de aparato</span>
        <div className="flex flex-wrap gap-1.5">
          {TIPOS.map((t) => (
            <button key={t.id} type="button"
              onClick={() => { setNeuronKind(neurona.id, t.id); alCambiar?.(); }}
              className={cn("cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors",
                neurona.kind === t.id ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100" : "border-white/10 text-white/60 hover:bg-white/5")}>
              {t.etiqueta}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="text-xs font-medium text-white/70">Color</span>
        <div className="flex flex-wrap gap-2">
          {PALETA_COLOR_PUBLICO.map((p) => (
            <button key={p.color} type="button" title={p.nombre} aria-label={`Color ${p.nombre}`}
              onClick={() => { ponerColorPublico(neurona.id, p.color); alCambiar?.(); }}
              className={cn("h-7 w-7 rounded-full border-2 cursor-pointer", color === p.color ? "border-white" : "border-transparent") }
              style={{ backgroundColor: p.color }} />
          ))}
          <button type="button" title="Por defecto" aria-label="Color por defecto"
            onClick={() => { ponerColorPublico(neurona.id, null); alCambiar?.(); }}
            className={cn("h-7 w-7 rounded-full border-2 cursor-pointer text-[10px] text-white/60", color === colorPorDefecto(neurona.id) ? "border-white" : "border-white/20")}
            style={{ backgroundColor: colorPorDefecto(neurona.id) }}>·</button>
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="text-xs font-medium text-white/70">Foto</span>
        <p className="text-xs text-white/45">La foto de la neurona usa el perfil activo. Se configura desde el perfil.</p>
      </div>
    </div>
  );
}
