"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { RadioTower, Cpu, Volume2, Antenna, ShieldCheck, Sparkles, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  getAutoDetect,
  setAutoDetectPref,
} from "@/lib/network/device-registry";
import { NODOS_INFERENCIA_LOCAL_STORAGE } from "@/lib/network/inferencia-local";
import { type TransporteBwp } from "@/ai/astraura/mesh/transporte-bwp";
import {
  CLAVE_TRANSPORTE_PREFERIDO,
  CLAVE_VOZ_SUPERTONIC,
  CLAVE_VOZ_IDIOMA,
  normalizarInferenciaLocal,
  evaluarNivelVozBorde,
  obtenerListaTransportes,
  obtenerListaIdiomasVoz,
} from "@/lib/network/red-mesh-settings";

export interface RedMeshSectionProps {
  compact?: boolean;
}

export function RedMeshSection({ compact = false }: RedMeshSectionProps) {
  const [transportePreferido, setTransportePreferido] = useState<TransporteBwp>("webrtc-local");
  const [autoDetect, setAutoDetectState] = useState<boolean>(true);
  const [inferenciaLocal, setInferenciaLocal] = useState<boolean>(true);
  const [vozSuptonica, setVozSuptonica] = useState<boolean>(true);
  const [idiomaVoz, setIdiomaVoz] = useState<string>("es");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const storedTrans = localStorage.getItem(CLAVE_TRANSPORTE_PREFERIDO) as TransporteBwp | null;
      if (storedTrans) setTransportePreferido(storedTrans);

      setAutoDetectState(getAutoDetect());

      const rawInf = localStorage.getItem(NODOS_INFERENCIA_LOCAL_STORAGE);
      setInferenciaLocal(normalizarInferenciaLocal(rawInf));

      const rawVoz = localStorage.getItem(CLAVE_VOZ_SUPERTONIC);
      setVozSuptonica(rawVoz ? rawVoz === "1" || rawVoz === "true" : true);

      const rawLang = localStorage.getItem(CLAVE_VOZ_IDIOMA);
      if (rawLang) setIdiomaVoz(rawLang);
    } catch {
      // Ignorar errores de localStorage
    }
  }, []);

  const listTransportes = obtenerListaTransportes();
  const listIdiomas = obtenerListaIdiomasVoz();
  const nivelVozEfectivo = evaluarNivelVozBorde(vozSuptonica);

  const handleCambiarTransporte = (nuevo: TransporteBwp) => {
    setTransportePreferido(nuevo);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(CLAVE_TRANSPORTE_PREFERIDO, nuevo);
      } catch {
        /* noop */
      }
    }
    toast.success(`Transporte preferido cambiado a ${nuevo}`);
  };

  const handleToggleAutoDetect = (v: boolean) => {
    setAutoDetectState(v);
    setAutoDetectPref(v);
    toast.success(v ? "Autodetección de dispositivos activada" : "Autodetección desactivada");
  };

  const handleToggleInferencia = (v: boolean) => {
    setInferenciaLocal(v);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(
          NODOS_INFERENCIA_LOCAL_STORAGE,
          JSON.stringify({ servirFlota: v, ultimoCambio: new Date().toISOString() })
        );
      } catch {
        /* noop */
      }
    }
    toast.success(v ? "Inferencia local habilitada para la flota" : "Inferencia local restringida");
  };

  const handleToggleVoz = (v: boolean) => {
    setVozSuptonica(v);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(CLAVE_VOZ_SUPERTONIC, v ? "1" : "0");
      } catch {
        /* noop */
      }
    }
    toast.success(v ? "Voz de borde suptónica activada" : "Voz de borde desactivada (usando respaldo)");
  };

  const handleCambiarIdioma = (code: string) => {
    setIdiomaVoz(code);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(CLAVE_VOZ_IDIOMA, code);
      } catch {
        /* noop */
      }
    }
    toast.success(`Idioma preferido de voz establecido en ${code}`);
  };

  return (
    <div className="space-y-6 text-foreground">
      {/* (a) Transporte preferido BWP */}
      <Card className="border-emerald-500/20 bg-emerald-950/10">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RadioTower className="h-5 w-5 text-emerald-400" />
              <CardTitle className="text-base font-semibold text-emerald-100">
                Transporte de Red Mesh (BWP)
              </CardTitle>
            </div>
            <Badge variant="outline" className="border-emerald-400/40 text-emerald-300">
              {transportePreferido}
            </Badge>
          </div>
          <CardDescription className="text-xs text-muted-foreground">
            Selecciona el canal de transporte BWP preferido para enlaces en la malla soberana.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {listTransportes.map((item) => {
              const esSeleccionado = transportePreferido === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleCambiarTransporte(item.key)}
                  className={`flex cursor-pointer flex-col justify-between rounded-lg border p-3 text-left transition-colors duration-200 ${
                    esSeleccionado
                      ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-100"
                      : "border-border/60 bg-muted/20 hover:border-emerald-500/30 hover:bg-emerald-500/5 text-muted-foreground"
                  }`}
                >
                  <div className="flex items-center justify-between font-medium text-sm">
                    <span>{item.etiqueta}</span>
                    {item.requiereHardware && (
                      <Badge className="bg-amber-500/20 text-amber-300 text-[10px] border-amber-500/30">
                        Hardware
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-col text-[11px] opacity-80 space-y-0.5">
                    <span>Alcance: {item.alcance}</span>
                    <span>Latencia: {item.latencia}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* (b) Autodetección */}
      <Card className="border-border/60 bg-card/40">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base font-semibold text-foreground">
                Autodetección de Dispositivos LAN
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Detecta y sincroniza de forma transparente con otros nodos de tu cuenta en la misma red.
              </CardDescription>
            </div>
            <Switch
              checked={autoDetect}
              onCheckedChange={handleToggleAutoDetect}
              className="cursor-pointer"
            />
          </div>
        </CardHeader>
      </Card>

      {/* (c) Inferencia Local */}
      <Card className="border-border/60 bg-card/40">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-cyan-400" />
                <CardTitle className="text-base font-semibold text-foreground">
                  Servir Inferencia a la Flota
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-muted-foreground">
                Permite o restringe que este nodo comparta sus motores de IA local con otros nodos de la red mesh.
              </CardDescription>
            </div>
            <Switch
              checked={inferenciaLocal}
              onCheckedChange={handleToggleInferencia}
              className="cursor-pointer"
            />
          </div>
        </CardHeader>
      </Card>

      {/* (d) Voz de borde */}
      <Card className="border-border/60 bg-card/40">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-purple-400" />
                <CardTitle className="text-base font-semibold text-foreground">
                  Voz de Borde (Supertonic ONNX)
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-muted-foreground">
                Activa el motor suptónico local en WebAssembly SIMD para síntesis de voz en borde sin GPU.
              </CardDescription>
            </div>
            <Switch
              checked={vozSuptonica}
              onCheckedChange={handleToggleVoz}
              className="cursor-pointer"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-1">
          <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 p-2.5">
            <span className="text-xs text-muted-foreground">Nivel efectivo de voz:</span>
            <Badge variant="secondary" className="text-xs">
              {nivelVozEfectivo}
            </Badge>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground cursor-pointer" htmlFor="idioma-voz-select">
              Idioma preferido para voz de borde:
            </label>
            <select
              id="idioma-voz-select"
              value={idiomaVoz}
              onChange={(e) => handleCambiarIdioma(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs ring-offset-background cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {listIdiomas.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* (e) Antenas: constancia y enlace */}
      <Card className="border-sky-500/20 bg-sky-950/10">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Antenna className="h-4 w-4 text-sky-400" />
              <CardTitle className="text-base font-semibold text-sky-100">
                Panel de Antenas y Radar
              </CardTitle>
            </div>
            <Link
              href="/senales"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-sky-400/40 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-200 transition-colors hover:bg-sky-500/20"
            >
              <span>Ir a Señales</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
          <CardDescription className="text-xs text-muted-foreground">
            La gestión de antenas físicas, escaneo espectral, OpenWISP y el radar en vivo de neuronas se administran centralizadamente desde la página de Señales.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
