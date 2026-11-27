"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Brain, Activity, Zap, Clock, Settings2, BarChart3, Smartphone, Network } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { SeccionIdentidad } from "./seccion-identidad";
import { SeccionAparatos } from "./seccion-aparatos";
import { type Neuron } from "@/lib/neurons/neurons";

interface FichaNeuronaProps {
  neurona: Neuron;
  onCambio: () => void;
  compacto?: boolean;
}

const PERMISOS_CONFIG = [
  { key: "compute", label: "Cómputo IA", hint: "Servir IA local al resto de neuronas" },
  { key: "storage", label: "Almacenamiento", hint: "Replicar y servir archivos/memorias" },
  { key: "sync", label: "Sincronización", hint: "Contexto y ajustes en vivo" },
  { key: "agent", label: "Agentes", hint: "Aceptar órdenes de agentes" },
  { key: "senses", label: "Sentidos", hint: "Mic/cámara/pantalla si se piden" },
  { key: "wake", label: "Despertar", hint: "Recibir notificaciones de otras neuronas" },
] as const;

const PAPEL_CONFIG = [
  { key: "cerebro", label: "Cerebro", hint: "Cómputo y contexto (IA local, sentidos)" },
  { key: "servidor", label: "Servidor", hint: "Almacén y servicios (archivos, memorias)" },
  { key: "ambos", label: "Ambos", hint: "Cerebro + servidor (predeterminado)" },
] as const;

interface SeccionPlegableProps {
  titulo: string;
  icono: React.ElementType;
  abierto: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  badge?: React.ReactNode;
}

function SeccionPlegable({ titulo, icono: Icono, abierto, onToggle, children, badge }: SeccionPlegableProps) {
  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 p-3 hover:bg-white/5 transition-colors cursor-pointer"
        aria-expanded={abierto}
      >
        <div className="flex items-center gap-2">
          <Icono className="w-4 h-4 text-white/60" />
          <span className="text-sm font-medium text-white/90">{titulo}</span>
          {badge}
        </div>
        {abierto ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
      </button>
      {abierto && (
        <div className="px-3 pb-3">
          {children}
        </div>
      )}
    </div>
  );
}

function formatDate(iso?: string): string {
  if (!iso) return "Nunca";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Desconocida";
  return d.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function FichaNeurona({ neurona, onCambio, compacto = false }: FichaNeuronaProps) {
  const [secciones, setSecciones] = useState({
    identidad: true,
    aparatos: false,
    permisos: false,
    papel: false,
    salud: false,
  });

  const toggleSeccion = (seccion: keyof typeof secciones) => {
    setSecciones((s) => ({ ...s, [seccion]: !s[seccion] }));
  };

  const online = neurona.online ?? false;
  const ultimaVisto = neurona.last_seen_at ? formatDate(neurona.last_seen_at) : "Nunca";
  const esEsta = neurona.isThisDevice ?? false;

  return (
    <Card className="w-full max-w-sm border-emerald-400/20 bg-emerald-500/[0.03] hover:shadow-lg transition-shadow duration-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Brain className="w-4 h-4 text-emerald-300" />
          {neurona.name}
          {esEsta && (
            <Badge className="text-xs" variant="outline" style={{ backgroundColor: "#39FF1415", borderColor: "#39FF1430", color: "#39FF14" }}>
              Esta neurona
            </Badge>
          )}
          {!esEsta && (
            <Badge
              variant="outline"
              className="text-xs"
              style={{
                backgroundColor: online ? "#10B98115" : "#6B728015",
                borderColor: online ? "#10B98130" : "#6B728030",
                color: online ? "#10B981" : "#9CA3AF",
              }}
            >
              {online ? "En línea" : "Offline"}
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="text-xs text-white/60 mt-1 leading-relaxed">
          {neurona.capabilities?.platform ?? "Dispositivo"} • Último visto: {ultimaVisto}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-2">
        <SeccionPlegable
          titulo="Identidad"
          icono={Settings2}
          abierto={secciones.identidad}
          onToggle={() => toggleSeccion("identidad")}
          badge={<Badge variant="outline" className="text-xs">Editable</Badge>}
        >
          <SeccionIdentidad neurona={neurona} onCambio={onCambio} esEsta={esEsta} />
        </SeccionPlegable>

        <SeccionPlegable
          titulo="Aparatos"
          icono={Smartphone}
          abierto={secciones.aparatos}
          onToggle={() => toggleSeccion("aparatos")}
        >
          <SeccionAparatos neurona={neurona} onCambio={onCambio} esEsta={esEsta} />
        </SeccionPlegable>

        <SeccionPlegable
          titulo="Permisos"
          icono={Zap}
          abierto={secciones.permisos}
          onToggle={() => toggleSeccion("permisos")}
          badge={
            <Badge variant="outline" className="text-xs">
              OFF por defecto
            </Badge>
          }
        >
          <div className="space-y-2">
            {PERMISOS_CONFIG.map((p) => (
              <div key={p.key} className="flex items-center justify-between gap-2 p-2 rounded-md border border-white/10">
                <div>
                  <p className="text-xs font-medium text-white/90">{p.label}</p>
                  <p className="text-xs text-white/50">{p.hint}</p>
                </div>
                <Switch
                  checked={neurona.permissions?.[p.key] ?? false}
                  onCheckedChange={() => {}}
                  aria-label={p.label}
                  disabled
                />
              </div>
            ))}
          </div>
        </SeccionPlegable>

        <SeccionPlegable
          titulo="Papel en la red"
          icono={Network}
          abierto={secciones.papel}
          onToggle={() => toggleSeccion("papel")}
        >
          <div className="space-y-2">
            {PAPEL_CONFIG.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {}}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md border text-xs transition-colors",
                  (neurona.settings?.role ?? "ambos") === p.key
                    ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
                    : "border-white/10 bg-black/20 text-white/60 hover:border-white/20"
                )}
              >
                {p.label}
              </button>
            ))}
            <p className="text-xs text-white/50 mt-1">{neurona.settings?.role === "cerebro" ? "Procesa IA local" : "Almacena archivos"}</p>
          </div>
        </SeccionPlegable>

        <SeccionPlegable
          titulo="Salud"
          icono={Activity}
          abierto={secciones.salud}
          onToggle={() => toggleSeccion("salud")}
        >
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-white/60">Estado:</span>
              <Badge
                variant="outline"
                className={cn(
                  online ? "border-emerald-400/30 text-emerald-200" : "border-zinc-400/30 text-zinc-400"
                )}
              >
                {online ? "Activa" : "Inactiva"}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">Última conexión:</span>
              <span className="text-white/80">{ultimaVisto}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">Versión:</span>
              <Badge variant="outline" className="text-xs">{neurona.capabilities?.browser ?? "Web"}</Badge>
            </div>
          </div>
        </SeccionPlegable>
      </CardContent>
    </Card>
  );
}

export default FichaNeurona;