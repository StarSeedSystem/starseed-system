"use client";

// Ficha de Versiones del OS (Ola 1105V)
// Muestra el estado, historial y enlaces de instalación de StarSeed OS.

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Download, RefreshCw, History, Shield } from "lucide-react";
import {
  OS_VERSION,
  OS_FECHA,
  formatearFechaBuild,
} from "@/lib/version/os-release";

export type VersionOS = {
  version: string;
  fecha: string;
  notas: string;
};

// Historial simulado (la API real vendrá de los endpoints de lanzamientos)
const HISTORIAL_EJEMPLO: VersionOS[] = [
  { version: "v0.8.0", fecha: "2026-10-01", notas: "Estabilización de núcleo y nueva UI Trinity." },
  { version: "v0.7.5", fecha: "2026-09-15", notas: "Mejoras en el bus de eventos y latidos." },
];

export function FichaVersionesOS() {
  const [cargando, setCargando] = useState(false);

  return (
    <div className="space-y-6">
      {/* Versión Actual */}
      <GlassCard className="p-5 border-emerald-400/20 bg-emerald-950/20">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-emerald-50">StarSeed OS {OS_VERSION}</h3>
            <p className="text-sm text-muted-foreground">Instalada: {formatearFechaBuild(OS_FECHA)}</p>
          </div>
          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">Actualizado</Badge>
        </div>
        <Button className="mt-4 w-full cursor-pointer gap-2" variant="outline" onClick={() => setCargando(true)} disabled={cargando}>
          {cargando ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Comprobar actualizaciones
        </Button>
      </GlassCard>

      {/* Historial */}
      <div>
        <h4 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-3">
          <History className="h-4 w-4" /> Historial de versiones
        </h4>
        <div className="space-y-2">
          {HISTORIAL_EJEMPLO.map((v) => (
            <div key={v.version} className="flex justify-between items-center p-3 rounded-lg border border-white/5 bg-white/[0.02] text-sm">
              <span className="font-medium text-emerald-100">{v.version}</span>
              <span className="text-muted-foreground text-xs">{v.fecha}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
