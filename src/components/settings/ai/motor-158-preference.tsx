"use client";

// ════════════════════════════════════════════════════════════════
// Motor158PreferenceCard — «Motor 1.58 · Preferencia de cognición».
// (Adenda 175) Lee y cambia EN CALIENTE la preferencia del backend
// soberano Astraura 1.58-bit (auto · bitnet-158 · multimodel) vía
// GET/POST /api/starseed/cognition/preference — neurona local
// primero, nube (proxy del OS con sesión) como respaldo. Honesto:
// si la variable de entorno del backend fuerza el valor, el
// selector se bloquea y se dice; si el backend no responde, se
// muestra el motivo real en vez de fingir. SSR-safe (useEffect).
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Cpu, RefreshCw, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import {
  fetchAstraura158CognitionPreference, setAstraura158CognitionPreference,
  type Astraura158CognitionPreference, type Astraura158CognitionPreferenceValue,
  type Astraura158Target,
} from "@/lib/astraura/astraura-158-client";

const OPCIONES: { value: Astraura158CognitionPreferenceValue; label: string; hint: string }[] = [
  { value: "auto", label: "Auto", hint: "BitNet 1.58-bit primero; si no está disponible, el mejor gratuito (Ollama · :free)." },
  { value: "bitnet-158", label: "Solo BitNet 1.58", hint: "Fuerza el motor ternario nativo; los demás solo si el nativo está caído del todo." },
  { value: "multimodel", label: "Multi-modelo", hint: "BitNet primero, respetando tu catálogo de modelos como alternativa explícita." },
];

const FUENTE_LABEL: Record<string, string> = {
  env: "forzada por entorno",
  stored: "guardada en el backend",
  default: "valor por defecto",
};

export function Motor158PreferenceCard() {
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<Astraura158CognitionPreferenceValue | null>(null);
  const [target, setTarget] = useState<Astraura158Target | null>(null);
  const [detalle, setDetalle] = useState<Astraura158CognitionPreference | null>(null);
  const [sinConexion, setSinConexion] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    let ultimo = "";
    for (const t of ["local", "nube"] as Astraura158Target[]) {
      try {
        const r = await fetchAstraura158CognitionPreference(t);
        if (r.ok && r.data?.preference) {
          setTarget(t);
          setDetalle(r.data);
          setSinConexion(null);
          setCargando(false);
          return;
        }
        ultimo = r.ok ? "respuesta sin preferencia (¿backend anterior a la Adenda 175?)" : r.error;
      } catch (e) {
        ultimo = e instanceof Error ? e.message : String(e);
      }
    }
    setSinConexion(ultimo || "backend 1.58 sin conexión");
    setCargando(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function elegir(value: Astraura158CognitionPreferenceValue) {
    if (!target || !detalle || detalle.env_override || guardando || value === detalle.preference) return;
    setGuardando(value);
    try {
      const r = await setAstraura158CognitionPreference(target, value);
      if (r.ok && r.data?.applied !== false) {
        setDetalle({ ...detalle, ...r.data, preference: r.data.preference ?? value });
        toast.success(`Motor 1.58 → ${OPCIONES.find((o) => o.value === value)?.label ?? value}`);
      } else {
        const motivo = (r.ok ? r.data?.reason : r.error) || "el backend no aplicó el cambio";
        toast.error(`No se aplicó: ${motivo}`);
        if (r.ok && r.data) setDetalle({ ...detalle, ...r.data });
      }
    } catch (e) {
      toast.error(`No se aplicó: ${e instanceof Error ? e.message : String(e)}`);
    }
    setGuardando(null);
  }

  return (
    <Card className="bg-background/40 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Cpu className="h-4 w-4 text-cyan-300" />
          Motor 1.58 · Preferencia de cognición
          {detalle?.env_override ? (
            <Badge className="bg-amber-500/20 text-amber-200 border-amber-400/30 text-[9px]">
              <Lock className="h-3 w-3 mr-1" /> Forzada por entorno
            </Badge>
          ) : target ? (
            <Badge className="bg-cyan-500/20 text-cyan-200 border-cyan-400/30 text-[9px]">
              {target === "local" ? "Neurona local" : "Nube"}
            </Badge>
          ) : null}
        </CardTitle>
        <CardDescription className="text-xs">
          Cómo elige motor el backend soberano Astraura 1.58-bit para el chat y los procesos de fondo.
          El cambio aplica en caliente y queda persistido{detalle?.source ? ` (${FUENTE_LABEL[detalle.source] ?? detalle.source})` : ""}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {cargando ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Consultando el backend 1.58…
          </div>
        ) : sinConexion ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
            <p className="text-[11px] text-amber-200/90 min-w-0">Backend 1.58 sin conexión: {sinConexion}</p>
            <Button variant="outline" size="sm" className="shrink-0 cursor-pointer" onClick={() => void cargar()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reintentar
            </Button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-3 gap-2">
            {OPCIONES.map((o) => {
              const activa = detalle?.preference === o.value;
              const bloqueada = !!detalle?.env_override;
              return (
                <button
                  key={o.value}
                  onClick={() => void elegir(o.value)}
                  disabled={bloqueada || guardando !== null}
                  aria-pressed={activa}
                  className={`text-left rounded-lg border p-3 transition min-h-[44px] ${bloqueada ? "opacity-60 cursor-not-allowed" : "cursor-pointer"} ${activa ? "border-cyan-400/50 bg-cyan-400/5 ring-1 ring-cyan-400/30" : "border-white/5 bg-black/20 hover:border-cyan-400/30"}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {guardando === o.value ? <Loader2 className="h-4 w-4 animate-spin text-cyan-300" /> : <Cpu className="h-4 w-4 text-cyan-300" />}
                    <span className="text-sm font-semibold">{o.label}</span>
                    {o.value === "auto" && <Badge className="bg-cyan-500/20 text-cyan-200 border-cyan-400/30 text-[9px]">Recomendado</Badge>}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{o.hint}</p>
                </button>
              );
            })}
          </div>
        )}
        {detalle?.env_override && (
          <p className="text-[11px] text-amber-200/80">
            ASTRAURA_COGNITION_PREFERENCE está definida en el backend y manda sobre este selector; quítala para configurarlo desde aquí.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
