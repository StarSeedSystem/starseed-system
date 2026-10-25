"use client";

// src/components/protomolecula/bloque-pizarra.tsx
// StarSeed · Protomolécula en pizarra: el átomo monta el panel autónomo y muestra estado de convergencia/conversión.

import { Sparkles, AlertTriangle, CheckCircle } from "lucide-react";

interface BloquePizarraProtomoleculaProps {
  moleculaId: string;
  aristasEntrantes: Array<{ id: string; fromId: string; toId: string; } | null>;
  aristasSalientes: Array<{ id: string; fromId: string; toId: string; } | null>;
}

export function BloquePizarraProtomolecula({
  moleculaId,
  aristasEntrantes,
  aristasSalientes,
}: BloquePizarraProtomoleculaProps) {
  const PanelProtomoleculaAutonomo = ({ moleculaId }: { moleculaId: string }) => {
    return (
      <div className="w-full h-full min-h-[200px] rounded-xl border border-fuchsia-500/30 bg-zinc-950/80 backdrop-blur p-4 flex items-center justify-center">
        <div className="text-center">
          <Sparkles className="w-12 h-12 text-fuchsia-400 mx-auto mb-2" />
          <h3 className="text-lg font-semibold text-fuchsia-100 mb-1">Protomolécula</h3>
          <p className="text-sm text-fuchsia-200/70">Molecula: {moleculaId}</p>
        </div>
      </div>
    );
  };

  const analizarConvergencia = (): {converging: boolean, faltaDe: string[]} => {
    const aristasEntrantesValidas = aristasEntrantes.filter((a): a is { id: string; fromId: string; toId: string } => a !== null && a.toId === moleculaId);
    const aristasSalientesValidas = aristasSalientes.filter((a): a is { id: string; fromId: string; toId: string } => a !== null && a.fromId === moleculaId);

    if (aristasEntrantesValidas.length === 0 && aristasSalientesValidas.length === 0) {
      return { converging: false, faltaDe: ["Recibe de …", "Alimenta a …"] };
    }

    const pendientes = [];

    if (aristasEntrantesValidas.length === 0) {
      pendientes.push("Recibe de …");
    }

    if (aristasSalientesValidas.length === 0) {
      pendientes.push("Alimenta a …");
    }

    return { converging: pendientes.length > 0, faltaDe: pendientes };
  };

  const rutaDeConversion = (): {requiresConversion: boolean, ruta?: string} => {
    if (!analizarConvergencia().converging) {
      return { requiresConversion: false };
    }

    const entradas = aristasEntrantes.filter((a): a is { id: string; fromId: string; toId: string } => a !== null && a.toId === moleculaId);
    const salidas = aristasSalientes.filter((a): a is { id: string; fromId: string; toId: string } => a !== null && a.fromId === moleculaId);

    if (entradas.length === 0 || salidas.length === 0) {
      return { requiresConversion: true, ruta: "No hay datos de entrada o salida" };
    }

    if (entradas.length > 1 && salidas.length > 1) {
      return { requiresConversion: true, ruta: "OBJ → glTF" };
    }

    return { requiresConversion: false };
  };

  const convergencia = analizarConvergencia();
  const conversion = rutaDeConversion();

  return (
    <div className="relative w-full h-full">
      <PanelProtomoleculaAutonomo moleculaId={moleculaId} />

      <div className="absolute bottom-0 left-0 right-0 p-1 bg-zinc-950/95 border-t border-fuchsia-500/30 text-[10px] text-white/80 flex items-center justify-between">
        {convergencia.faltaDe.map((item, idx) => (
          <div key={idx} className="flex items-center gap-1 text-fuchsia-200/70">
            <AlertTriangle className="w-3 h-3" />
            <span>{item}</span>
          </div>
        ))}

        {conversion.requiresConversion && (
          <div className="flex items-center gap-1 text-amber-300/80">
            <AlertTriangle className="w-3 h-3" />
            <span>Arista incompatible o conversión necesaria: {conversion.ruta}</span>
          </div>
        )}

        {!conversion.requiresConversion && convergencia.converging && (
          <div className="flex items-center gap-1 text-emerald-400/80">
            <CheckCircle className="w-3 h-3" />
            <span>Estado óptimo</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default BloquePizarraProtomolecula;

// Prototipo de PanelProtomoleculaAutonomo (componente separado necesario en otra tarea)
export function PanelProtomoleculaAutonomo({ moleculaId }: { moleculaId: string }) {
  return (
    <div className="w-full h-full min-h-[200px] rounded-xl border border-fuchsia-500/30 bg-zinc-950/80 backdrop-blur p-4 flex items-center justify-center">
      <div className="text-center">
        <Sparkles className="w-12 h-12 text-fuchsia-400 mx-auto mb-2" />
        <h3 className="text-lg font-semibold text-fuchsia-100 mb-1">Protomolécula</h3>
        <p className="text-sm text-fuchsia-200/70">Molecula: {moleculaId}</p>
      </div>
    </div>
  );
}