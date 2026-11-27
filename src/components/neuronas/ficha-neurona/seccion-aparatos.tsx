"use client";

import { useState } from "react";
import { Smartphone, ChevronDown, AlertCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  thisDeviceId,
  resolverAliasEsteMedio,
  cambiarNeuronaDeEsteAparato,
  nombreEsteAparato,
  type Neuron,
} from "@/lib/neurons/neurons";
import { aparatosDe, type AparatoDeNeurona } from "@/lib/neurons/aparatos-de-neurona";

const NOMBRE_SO: Record<string, string> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
  android: "Android",
  ios: "iOS",
};

interface AparatoInfo {
  nombre: string;
  medio?: string;
  so?: string;
  equipo?: string;
}

function obtenerNombreAparato(e: AparatoInfo | undefined): string {
  if (!e) return "Aparato sin nombre";
  const partes = [e.nombre];
  if (e.medio || e.so) {
    partes.push(` · ${(e.medio ?? "") + (e.so ? ` ${e.so}` : "")}`);
  }
  return partes.join("").trim() || "Aparato sin nombre";
}

interface SeccionAparatosProps {
  neurona: Neuron;
  onCambio: () => void;
  esEsta: boolean;
}

export function SeccionAparatos({ neurona, onCambio, esEsta }: SeccionAparatosProps) {
  const [ocupado, setOcupado] = useState(false);

  const separarAPartirDeEsta = async () => {
    setOcupado(true);
    try {
      await cambiarNeuronaDeEsteAparato(null);
      toast.success("Aparato creado con su propia neurona");
      onCambio();
    } catch {
      toast.error("No se pudo crear la neurona");
    } finally {
      setOcupado(false);
    }
  };

  const infoAparato = esEsta
    ? (neurona.capabilities?.aparato || {} as AparatoInfo)
    : (neurona.capabilities?.apara ? neurona.capabilities.apara : undefined);

  const aparatos = aparatosDe([neurona]);

  return (
    <section className="space-y-3" data-testid="seccion-aparatos">
      <div className="flex items-start gap-3">
        <Smartphone className="w-4 h-4 text-white/50" />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-white/90 mb-1">Aparatos</h4>
          <p className="text-xs text-white/50">Dispositivos físicos que usan esta neurona.</p>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-white/60">Aparato actual</span>
          {esEsta && (
            <Button
              variant="ghost"
              size="sm"
              className="cursor-pointer h-7 px-2 text-xs gap-1"
              onClick={() => {
                const medio = infoAparato?.medio ?? "web";
                // TODO: abrir diálogo de renombrado
              }}
            >
              <Plus className="w-3 h-3" /> Renombrar
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {infoAparato?.equipo && (
            <Badge variant="outline" className="text-xs">{infoAparato.equipo}</Badge>
          )}
          {infoAparato?.medio && (
            <Badge variant="outline" className="text-xs">{infoAparato.medio}</Badge>
          )}
          {infoAparato?.so && (
            <Badge variant="outline" className="text-xs">{NOMBRE_SO[infoAparato.so] ?? infoAparato.so}</Badge>
          )}
        </div>

        <p className="text-xs text-white/40 mt-2">
          {obtenerNombreAparato(infoAparato)}
        </p>

        {esEsta && (
          <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
            <p className="text-xs text-white/50">¿Qué puedes hacer?</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer h-7 text-xs gap-1"
                onClick={separarAPartirDeEsta}
                disabled={ocupado}
              >
                <Plus className="w-3 h-3" /> Crear neurona nueva
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="cursor-pointer h-7 text-xs gap-1"
                onClick={() => {/* TODO: abrir diálogo de unión */}}
                disabled={ocupado}
              >
                Unir a otra neurona
              </Button>
            </div>
          </div>
        )}
      </div>

      {esEsta && aparatos.length > 1 && (
        <div className="rounded-lg border border-amber-400/25 bg-amber-500/10 p-3">
          <p className="text-xs text-amber-100 mb-2 flex items-center gap-1.5">
            <AlertCircle className="w-3 h-3" />
            <span>Esta neurona la comparten {aparatos.length} aparatos</span>
          </p>
          <p className="text-xs text-amber-200/80">
            Lo recomendado es una neurona por aparato. Puedes separar un aparato con el botón de arriba.
          </p>
        </div>
      )}
    </section>
  );
}