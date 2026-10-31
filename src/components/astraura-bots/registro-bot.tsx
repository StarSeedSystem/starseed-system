"use client";

import { History, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface RegistroEntrada {
  id: string;
  at: number;
  quien: string;
  tipo: "propuesta" | "confirmada" | "rechazada" | "aplicada" | "fallida" | "deshecha";
  accion?: string;
  motivo: string;
  deshacer?: unknown;
  reversible: boolean;
}

export interface RegistroBotProps {
  entradas: RegistroEntrada[];
  onUndo: (entradaId: string) => void;
}

export function RegistroBot({ entradas, onUndo }: RegistroBotProps) {
  const formatearFecha = (ms: number) => {
    const fecha = new Date(ms);
    const ahora = new Date();
    const diffMin = Math.floor((ahora.getTime() - ms) / 60000);
    if (diffMin < 1) return "Hace un momento";
    if (diffMin < 60) return `Hace ${diffMin} min`;
    const diffHoras = Math.floor(diffMin / 60);
    if (diffHoras < 24) return `Hace ${diffHoras} h`;
    const diffDias = Math.floor(diffHoras / 24);
    return `Hace ${diffDias} día${diffDias > 1 ? "s" : ""}`;
  };

  const getTipoColor = (tipo: RegistroEntrada["tipo"]) => {
    switch (tipo) {
      case "propuesta": return "text-blue-400";
      case "confirmada": return "text-green-400";
      case "rechazada": return "text-red-400";
      case "aplicada": return "text-purple-400";
      case "fallida": return "text-orange-400";
      case "deshecha": return "text-cyan-400";
      default: return "text-zinc-400";
    }
  };

  const getTipoIcono = (tipo: RegistroEntrada["tipo"]) => {
    switch (tipo) {
      case "propuesta": return <History className="h-4 w-4" />;
      case "confirmada": return "✓";
      case "rechazada": return <X className="h-4 w-4" />;
      case "aplicada": return "→";
      case "fallida": return "✗";
      case "deshecha": return <X className="h-4 w-4" />;
      default: return "·";
    }
  };

  return (
    <Card className="border-white/20 bg-zinc-900/95 backdrop-blur-sm h-full">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-white flex items-center gap-2">
          <History className="h-5 w-5" />
          Registro de actividad
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3 max-h-96 overflow-y-auto">
        {entradas.length === 0 ? (
          <div className="text-center text-zinc-500 py-8">
            <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No hay actividad reciente</p>
          </div>
        ) : (
          entradas.map((entrada) => (
            <div
              key={entrada.id}
              className="p-4 rounded border border-white/10 bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors group"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className={`text-sm ${getTipoColor(entrada.tipo)}`}>{getTipoIcono(entrada.tipo)}</span>
                  <span className="text-sm text-zinc-300 font-medium">{entrada.quien}</span>
                  <span className="text-xs text-zinc-500">{formatearFecha(entrada.at)}</span>
                </div>
                {entrada.tipo === "aplicada" && entrada.reversible && (
                  <Button
                    onClick={() => onUndo(entrada.id)}
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Deshacer
                  </Button>
                )}
                {entrada.tipo === "aplicada" && !entrada.reversible && (
                  <div className="text-xs text-orange-400 px-2 py-1 rounded bg-orange-500/10 border border-orange-500/30">
                    No reversible
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {entrada.accion && (
                  <div className="text-sm text-white font-medium bg-zinc-700/50 px-2 py-1 rounded">
                    {entrada.accion}
                  </div>
                )}
                <div className="text-sm text-zinc-400 leading-relaxed">
                  {entrada.motivo}
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
