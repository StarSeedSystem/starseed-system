"use client";

import { Clock, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { indicadorVisible } from "@/lib/astraura-bots/bucle";
import type { Bot } from "@/lib/astraura-bots/tipos";
import type { EstadoBucle, EventoBucle } from "@/lib/astraura-bots/bucle";
import { IndicadorSentidos } from "@/components/astraura-bots/indicador-sentidos";

export interface Propuesta {
  accion: string;
  motivo: string;
  riesgo: "bajo" | "medio" | "alto";
  requiere: "nada" | "confirmacion" | "votacion" | "consentimiento" | "expreso";
  decision: {
    requiere: string;
    motivo: string;
  };
  voting?: {
    op: unknown;
  };
  consentimiento?: {
    sentido: string;
  };
}

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

export interface TarjetaPropuestaProps {
  bot: Bot;
  propuesta: Propuesta;
  bucle: EstadoBucle;
  onConfirm: () => void;
  onReject: () => void;
  onVote: () => void;
  onConsent: (sentido: string) => void;
}

export interface RegistroBotProps {
  entradas: RegistroEntrada[];
  onUndo: (entradaId: string) => void;
}

export function TarjetaPropuesta({
  bot,
  propuesta,
  bucle,
  onConfirm,
  onReject,
  onVote,
  onConsent,
}: TarjetaPropuestaProps) {
  const getRiesgoColor = (riesgo: Propuesta["riesgo"]) => {
    switch (riesgo) {
      case "alto": return "bg-red-500/20 text-red-400 border-red-500/30";
      case "medio": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      case "bajo": return "bg-green-500/20 text-green-400 border-green-500/30";
      default: return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
    }
  };

  const getRiesgoTexto = (riesgo: Propuesta["riesgo"]) => {
    switch (riesgo) {
      case "alto": return "Alto";
      case "medio": return "Medio";
      case "bajo": return "Bajo";
      default: return "Desconocido";
    }
  };

  const getRequiereColor = (requiere: Propuesta["requiere"]) => {
    switch (requiere) {
      case "confirmacion": return "text-blue-400";
      case "votacion": return "text-purple-400";
      case "consentimiento": return "text-green-400";
      case "expreso": return "text-orange-400";
      default: return "text-zinc-400";
    }
  };

  const getRequiereTexto = (requiere: Propuesta["requiere"]) => {
    switch (requiere) {
      case "confirmacion": return "Confirmación necesaria";
      case "votacion": return "Votación necesaria";
      case "consentimiento": return "Se necesita consentimiento";
      case "expreso": return "Permiso expreso necesario";
      default: return "Sin requisitos";
    }
  };

  const formatearTiempo = (ms: number) => {
    const segundos = Math.floor(ms / 1000);
    if (segundos < 60) return `${segundos}s`;
    const minutos = Math.floor(segundos / 60);
    return `${minutos}m`;
  };

  return (
    <Card className={cn(
      "absolute w-80 border-white/20 bg-zinc-900/95 backdrop-blur-sm transition-all duration-300",
      indicadorVisible(bucle) && "ring-2 ring-cyan-500/50"
    )}
      style={{
        animation: 'slideIn 0.3s ease-out',
      }}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg font-semibold text-white">
            {bot.nombre} está esperando
          </CardTitle>
          <Badge className={getRiesgoColor(propuesta.riesgo)}>
            {getRiesgoTexto(propuesta.riesgo)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <div className="text-sm text-zinc-300 mb-1">Quiere hacer:</div>
          <div className="p-3 rounded bg-zinc-800/50 border border-white/10">
            <div className="font-medium text-white">{propuesta.accion}</div>
            <div className="text-sm text-zinc-400 mt-1">{propuesta.motivo}</div>
          </div>
        </div>

        <div>
          <div className="text-sm text-zinc-300 mb-1">Por qué:</div>
            <div className="p-2 rounded bg-zinc-800/30 border border-white/5">
            <div className="text-sm text-white/90">{propuesta.decision.motivo}</div>
          </div>
        </div>

        <div>
          <div className="text-sm text-zinc-300 mb-1">Requiere:</div>
          <div className={cn("text-sm font-medium", getRequiereColor(propuesta.requiere))}>
            {getRequiereTexto(propuesta.requiere)}
          </div>
        </div>

        {bucle && indicadorVisible(bucle) && (
          <div>
            <div className="text-sm text-zinc-300 mb-2">Sentidos activos:</div>
            <div className="flex flex-wrap gap-2">
              {bucle.sentidosActivos.map((sentido) => (
                <div
                  key={sentido}
                  className="px-2 py-1 rounded-full bg-cyan-500/20 text-cyan-300 text-xs border border-cyan-500/30"
                >
                  {sentido}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          {propuesta.requiere === "nada" && (
            <Button
              onClick={onConfirm}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
              Confirmar
            </Button>
          )}
          {propuesta.requiere === "confirmacion" && (
            <>
              <Button
                onClick={onReject}
                variant="outline"
                className="flex-1 border-red-500/50 text-red-400 hover:bg-red-500/10"
              >
                Rechazar
              </Button>
              <Button
                onClick={onConfirm}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                Confirmar
              </Button>
            </>
          )}
          {propuesta.requiere === "votacion" && (
            <Button
              onClick={onVote}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white"
            >
              Llevar a votación
            </Button>
          )}
          {propuesta.requiere === "consentimiento" && (
            <Button
              onClick={() => onConsent(propuesta.consentimiento?.sentido || "")}
              className="w-full bg-green-600 hover:bg-green-700 text-white"
            >
              Abrir diálogo de consentimiento
            </Button>
          )}
          {propuesta.requiere === "expreso" && (
            <Button
              onClick={() => onConsent(propuesta.consentimiento?.sentido || "")}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white"
            >
              Dar consentimiento expreso
            </Button>
          )}
        </div>

        <div className="pt-2 border-t border-white/10">
          <div className="text-xs text-zinc-500">
            Esperando por más de {formatearTiempo(Date.now() - (bucle.registro[0]?.at || Date.now()))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
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
      case "propuesta": return <Clock className="h-4 w-4" />;
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
        <CardTitle className="text-lg font-semibold text-white">
          Registro de actividad
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3 max-h-96 overflow-y-auto">
        {entradas.length === 0 ? (
          <div className="text-center text-zinc-500 py-8">
            No hay actividad reciente
          </div>
        ) : (
          entradas.map((entrada) => (
            <div
              key={entrada.id}
              className="p-3 rounded border border-white/10 bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={cn("text-sm", getTipoColor(entrada.tipo))}>{getTipoIcono(entrada.tipo)}</span>
                  <span className="text-sm text-zinc-300 font-medium">{entrada.quien}</span>
                  <span className="text-xs text-zinc-500">{formatearFecha(entrada.at)}</span>
                </div>
                {entrada.tipo === "aplicada" && entrada.reversible && (
                  <Button
                    onClick={() => onUndo(entrada.id)}
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10"
                  >
                    Deshacer
                  </Button>
                )}
              </div>

              <div className="space-y-1">
                {entrada.accion && (
                  <div className="text-sm text-white font-medium">{entrada.accion}</div>
                )}
                <div className="text-sm text-zinc-400">{entrada.motivo}</div>
                {entrada.tipo === "aplicada" && !entrada.reversible && (
                  <div className="text-xs text-orange-400 mt-1">
                    Esta acción no puede deshacerse
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
