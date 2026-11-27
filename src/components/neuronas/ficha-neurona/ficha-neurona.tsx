"use client";

import { ChevronDown, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useState, useCallback, useEffect, useMemo } from "react";
import { settingsFor } from "@/lib/neurons/neurons";
import { thisDeviceId } from "@/lib/neurons/neurons";
import { SeccionIdentidad } from "./seccion-identidad";
import { SeccionAparatos } from "./seccion-aparatos";

export type ModoFicha = "completo" | "compacto";

export interface NeuronaFicha {
  id: string;
  name: string;
  kind: string;
  capabilities: {
    aparato?: { nombre?: string; medio?: string; so?: string; equipo?: string };
    aparatos?: Record<string, { n?: string; medio?: string; so?: string; equipo?: string; ts?: number; fuera?: number }>;
  };
  permissions: {
    compute: boolean;
    storage: boolean;
    sync: boolean;
    agent: boolean;
    senses: boolean;
    wake: boolean;
  };
  last_seen_at?: string;
  isThisDevice?: boolean;
  online?: boolean;
}

interface FichaNeuronaProps {
  neurona: NeuronaFicha;
  modo?: ModoFicha;
  onCambio?: () => void;
}

const SECCIONES_COMPLETAS = [
  { id: "identidad", label: "Identidad", icon: "🆔" },
  { id: "aparatos", label: "Aparatos", icon: "📱" },
  { id: "permisos", label: "Permisos", icon: "🔐" },
  { id: "papel", label: "Papel en la red", icon: "🌐" },
  { id: "salud", label: "Salud", icon: "💚" },
] as const;

const SECCIONES_COMPACTAS = [
  { id: "identidad", label: "Identidad", icon: "🆔" },
  { id: "aparatos", label: "Aparatos", icon: "📱" },
] as const;

export function FichaNeurona({ neurona, modo = "completo", onCambio }: FichaNeuronaProps) {
  const [busqueda, setBusqueda] = useState("");
  const [seccionesAbiertas, setSeccionesAbiertas] = useState<Record<string, boolean>>({});
  const [settings, setSettings] = useState(() => settingsFor(neurona.id));
  const idActual = thisDeviceId();

  useEffect(() => {
    setSettings(settingsFor(neurona.id));
  }, [neurona.id]);

  const secciones = modo === "compacto" ? SECCIONES_COMPACTAS : SECCIONES_COMPLETAS;

  const toggleSeccion = useCallback((id: string) => {
    setSeccionesAbiertas((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const abrirTodas = useCallback(() => {
    const nuevas: Record<string, boolean> = {};
    secciones.forEach((s) => { nuevas[s.id] = true; });
    setSeccionesAbiertas(nuevas);
  }, [secciones]);

  const cerrarTodas = useCallback(() => {
    setSeccionesAbiertas({});
  }, []);

  const handleCambioNombreNeurona = useCallback((nombre: string) => {
    // TODO: conectar con setNeuronName
    console.log("Cambiar nombre neurona:", nombre);
    onCambio?.();
  }, [onCambio]);

  const handleCambioNombreAparato = useCallback((nombre: string) => {
    // TODO: conectar con renombrarEsteAparato
    console.log("Cambiar nombre aparato:", nombre);
    onCambio?.();
  }, [onCambio]);

  const handleCambioIcono = useCallback((icono: string) => {
    // TODO: conectar con setNeuronKind
    console.log("Cambiar icono:", icono);
    onCambio?.();
  }, [onCambio]);

  const handleCambioColor = useCallback((color: string) => {
    // TODO: conectar con setNeuronSettings
    console.log("Cambiar color:", color);
    onCambio?.();
  }, [onCambio]);

  const handleCambioFoto = useCallback((foto: string) => {
    // TODO: conectar con setNeuronSettings
    console.log("Cambiar foto:", foto);
    onCambio?.();
  }, [onCambio]);

  const handleRefrescar = useCallback(() => {
    onCambio?.();
  }, [onCambio]);

  const seccionIdentidadAbierta = seccionesAbiertas.identidad ?? true;
  const seccionAparatosAbierta = seccionesAbiertas.aparatos ?? true;

  return (
    <div className="rounded-2xl border bg-black/20 p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="grid place-items-center w-9 h-9 rounded-xl bg-black/30 border border-white/10 shrink-0">
          {neurona.kind === "mobile" && "📱"}
          {neurona.kind === "tablet" && "📱"}
          {neurona.kind === "desktop" && "💻"}
          {neurona.kind === "laptop" && "💻"}
          {neurona.kind === "server" && "🖥"}
          {neurona.kind === "other" && "⚙️"}
        </span>

        <span className="text-sm font-semibold text-white/90 truncate max-w-[220px] flex-1 min-w-0">{neurona.name}</span>

        {neurona.isThisDevice && (
          <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-400/30 text-[9px]">Esta neurona</Badge>
        )}

        <Badge
          variant="outline"
          className={cn(
            "text-[9px]",
            neurona.online
              ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/30"
              : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
          )}
        >
          <span className={cn("w-1.5 h-1.5 rounded-full mr-1", neurona.online ? "bg-emerald-400 animate-pulse" : "bg-zinc-500")} />
          {neurona.online ? "En línea" : "Fuera de línea"}
        </Badge>

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" className="cursor-pointer h-7 px-2" onClick={abrirTodas}>
            <ChevronDown className="w-3.5 h-3.5" /> Todas
          </Button>
          <Button variant="ghost" size="sm" className="cursor-pointer h-7 px-2" onClick={cerrarTodas}>
            <X className="w-3.5 h-3.5" /> Ninguna
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <Input
          placeholder="Buscar en la ficha…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="pl-8 h-8 text-sm bg-black/30 border-white/10"
        />
        {busqueda && (
          <Button variant="ghost" size="sm" className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer h-6 w-6 p-0" onClick={() => setBusqueda("")}>
            <X className="w-3.5 h-3.5 text-white/40" />
          </Button>
        )}
      </div>

      <div className="space-y-2" role="list" aria-label="Secciones de la ficha de neurona">
        {secciones.map((seccion) => {
          const estaAbierta = seccionesAbiertas[seccion.id] ?? (seccion.id === "identidad" || seccion.id === "aparatos");
          const key = `${neurona.id}-${seccion.id}`;

          if (seccion.id === "identidad") {
            return (
              <SeccionIdentidad
                key={key}
                neurona={neurona}
                settings={settings}
                onChangeNombreNeurona={handleCambioNombreNeurona}
                onChangeNombreAparato={handleCambioNombreAparato}
                onChangeIcono={handleCambioIcono}
                onChangeColor={handleCambioColor}
                onChangeFoto={handleCambioFoto}
                busqueda={busqueda}
                estaAbierta={estaAbierta}
                onToggle={() => toggleSeccion(seccion.id)}
              />
            );
          }

          if (seccion.id === "aparatos") {
            return (
              <SeccionAparatos
                key={key}
                neurona={neurona}
                settings={settings}
                idActual={idActual}
                busqueda={busqueda}
                estaAbierta={estaAbierta}
                onToggle={() => toggleSeccion(seccion.id)}
                onRefrescar={handleRefrescar}
              />
            );
          }

          // Placeholders para las demás secciones (se implementarán en partes posteriores)
          return (
            <details key={key} className="group rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden" open={estaAbierta}>
              <summary
                onClick={(e) => {
                  e.preventDefault();
                  toggleSeccion(seccion.id);
                }}
                className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-semibold text-white/80"
              >
                <span aria-hidden>{seccion.icon}</span> {seccion.label}
                <span className="ml-auto text-[10px] font-normal text-white/40 group-open:hidden">ver</span>
                <span className="ml-auto text-[10px] font-normal text-white/40" style={{ transform: estaAbierta ? "rotate(180deg)" : "rotate(0)" }}>▼</span>
              </summary>
              {estaAbierta && (
                <div className="px-3 pb-3 pt-3 border-t border-white/5 text-xs text-white/50">
                  {seccion.label} — próximamente en la siguiente parte de NEU1126B
                </div>
              )}
            </details>
          );
        })}
      </div>
    </div>
  );
}

export default FichaNeurona;