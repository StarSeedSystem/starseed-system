"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Loader2, Zap, Server, Microchip, User, MessageCircle, AlertTriangle } from "lucide-react";
import { leerFuentesConectores, type ConectorCerebro, type TipoConector, type EstadoConector } from "@/lib/cerebros/conectores-fuentes";
import { pushPreferences } from "@/lib/settings-sync";

export interface ConectoresPanelProps {
  brainId: string | null;
  brainName?: string;
}

export default function ConectoresPanel({ brainId, brainName }: ConectoresPanelProps) {
  const [fuentes, setFuentes] = useState<ConectorCerebro[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!brainId) {
      setFuentes([]);
      setAvisos(["Selecciona un cerebro para ver sus conectores"]);
      setCargando(false);
      return;
    }

    let cancelado = false;
    const cargarFuentes = async () => {
      try {
        setCargando(true);
        setError(null);
        const resultado = await leerFuentesConectores(brainId);
        if (!cancelado) {
          setFuentes(resultado.fuentes);
          setAvisos(resultado.avisos);
          setCargando(false);
        }
      } catch (err) {
        if (!cancelado) {
          setError(err instanceof Error ? err.message : String(err));
          setCargando(false);
        }
      }
    };

    cargarFuentes();
    return () => {
      cancelado = true;
    };
  }, [brainId, brainName]);

  if (cargando) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/20 p-8 text-center">
        <Loader2 className="w-8 h-8 text-white/25 mx-auto mb-2" />
        <p className="text-sm text-white/50">Cargando conectores...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/20 p-8 text-center">
        <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
        <p className="text-sm text-white/50">{error}</p>
      </div>
    );
  }

  avisos.forEach((aviso) => toast.warning(aviso));

  if (fuentes.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/20 p-8 text-center">
        <MessageCircle className="w-8 h-8 text-white/25 mx-auto mb-2" />
        <p className="text-sm text-white/50">
          No se encontraron conectores para este cerebro.
        </p>
      </div>
    );
  }

  const grupos: Record<TipoConector, ConectorCerebro[]> = {
    conector: [],
    integracion: [],
    mcp: [],
    "cuenta-externa": [],
    canal: [],
  };

  for (const fuente of fuentes) {
    grupos[fuente.tipo].push(fuente);
  }

  const iconMap: Record<TipoConector, React.ComponentType<{ className?: string }>> = {
    conector: Zap,
    integracion: Server,
    mcp: Microchip,
    "cuenta-externa": User,
    canal: MessageCircle,
  };

  return (
    <div className="space-y-4">
      {Object.entries(grupos).map(([tipo, fuentesDelTipo]) => {
        if (fuentesDelTipo.length === 0) return null;
        const Icon = iconMap[tipo as TipoConector];
        return (
          <div key={tipo} className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Icon className={`w-5 h-5 text-${tipo === "conector" ? "cyan-300" : tipo === "integracion" ? "blue-300" : tipo === "mcp" ? "green-300" : tipo === "cuenta-externa" ? "purple-300" : "orange-300"}`} />
                <h3 className="text-base font-semibold text-white/80">
                  {tipo === "conector" ? "Conectores" : tipo === "integracion" ? "Integraciones" : tipo === "mcp" ? "Servidores MCP" : tipo === "cuenta-externa" ? "Cuentas externas" : "Canales de mensajería"}
                </h3>
                <Badge variant="outline" className="ml-auto border-white/20 text-white/50">
                  {fuentesDelTipo.length}
                </Badge>
              </div>
            </div>
            <p className="mt-2 text-sm text-white/60">
              Lista de {tipo === "conector" ? "conectores disponibles" : tipo === "integracion" ? "integraciones configuradas" : tipo === "mcp" ? "servidores MCP vinculados" : tipo === "cuenta-externa" ? "cuentas externas vinculadas" : "canales de mensajería"} para{" "}
              <span className="text-white/80">{brainName ?? "este cerebro"}</span>.
            </p>
            <div className="mt-4 space-y-2">
              {fuentesDelTipo.map((fuente) => (
                <div
                  key={fuente.id}
                  className="flex items-start gap-2 rounded-lg border border-white/10 bg-black/20 p-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm text-white/80 truncate">{fuente.nombre}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "border-white/15 text-white/50 text-[9px] py-0",
                          fuente.estado === "conectado" && "border-green-500/30 text-green-300",
                          fuente.estado === "falta-clave" && "border-yellow-500/30 text-yellow-300",
                          fuente.estado === "disponible" && "border-white/20 text-white/50",
                          fuente.estado === "error" && "border-red-500/30 text-red-300"
                        )}
                      >
                        {fuente.estado === "conectado" ? "Conectado" : fuente.estado === "falta-clave" ? "Falta clave" : fuente.estado === "disponible" ? "Disponible" : "Error"}
                      </Badge>
                    </div>
                    {fuente.enlace && (
                      <p className="text-[11px] text-white/45 mt-0.5">
                        <span className="font-mono">Enlace:</span> <span className="underline">{fuente.enlace}</span>
                      </p>
                    )}
                  </div>
                  <Switch
                    checked={fuente.enCerebro}
                    onChange={(checked) => {
                      const clave = `starseed.brain.${brainId}.conectores`;
                      const valorActual: Record<string, boolean> =
                        (() => {
                          if (typeof window === "undefined") return {};
                          try {
                            const raw = window.localStorage.getItem(clave);
                            return raw ? JSON.parse(raw) : {};
                          } catch {
                            return {};
                          }
                        })() || {};
                      const nuevoValor = { ...valorActual, [fuente.id]: checked };
                      window.localStorage.setItem(clave, JSON.stringify(nuevoValor));
                      pushPreferences().then((result) => {
                        if (!result.ok) {
                          toast.error(`No se pudo sincronizar: ${result.reason || result.message}`);
                        } else {
                          toast.success("Preferencia guardada");
                        }
                      });
                    }}
                    className="ml-0"
                    aria-label={`Usar ${fuente.nombre} en este cerebro`}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}