"use client";

// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Panel "Modelos por función"
// ----------------------------------------------------------------------------
// Lista las FUNCIONES de generación (texto, imagen, vídeo, presentaciones,
// infografías, sitios web, voz, transcripción, diseño, documentos,
// automatización) y, por cada una y por SCOPE (usuario · cerebro), deja elegir
// qué CONEXIÓN OSS usar (de las conexiones configuradas en /servicios). Muestra
// el estado resuelto (servicio + endpoint) con `resolveServiceFor`.
//
// Se apoya en:
//   • useFunctionModels() → registro + get/set por función/scope.
//   • useOssConnections() → conexiones concretas del usuario (por servicio).
//
// SSR-safe y defensivo. No añade dependencias. No toca providerStore/chat/MoA.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Cpu,
  Server,
  ChevronRight,
  ExternalLink,
  Wand2,
  CheckCircle2,
  CircleDashed,
} from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  useFunctionModels,
  type GenerationFunction,
} from "@/ai/functions/function-models";
import {
  useOssConnections,
  type OssConnection,
  type OssScope,
} from "@/lib/services/oss-connections";
import { listBrains, type Brain } from "@/lib/brains/brains";

/** Etiqueta legible de un scope OSS. */
function scopeLabel(scope: OssScope, brains: Brain[]): string {
  if (scope === "user") return "Usuario";
  if (scope === "context") return "Contexto";
  if (scope.startsWith("brain:")) {
    const id = scope.slice(6);
    const b = brains.find((x) => x.id === id);
    return b ? `Cerebro · ${b.name}` : `Cerebro · ${id}`;
  }
  if (scope.startsWith("page:")) return `Página · ${scope.slice(5)}`;
  return scope;
}

export function FunctionModelsPanel() {
  const fm = useFunctionModels();
  const oss = useOssConnections();
  const [brains, setBrains] = useState<Brain[]>([]);

  // Carga defensiva de cerebros para ofrecer scopes `brain:<id>` reales.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await listBrains();
        if (alive && Array.isArray(list)) setBrains(list);
      } catch {
        /* sin sesión / sin tabla: nos quedamos sólo con "Usuario" */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Opciones de scope: siempre "Usuario", más un scope por cada cerebro.
  const scopeOptions: OssScope[] = useMemo(() => {
    const opts: OssScope[] = ["user"];
    for (const b of brains) opts.push(`brain:${b.id}` as OssScope);
    return opts;
  }, [brains]);

  const activeScope = fm.uiScope;

  return (
    <Card className="bg-background/40 backdrop-blur-sm border-white/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Boxes className="h-4 w-4 text-fuchsia-400" />
          Modelos por función
        </CardTitle>
        <CardDescription className="leading-relaxed">
          Elige qué servicio genera cada cosa: texto, imagen, vídeo,
          presentaciones, infografías, sitios web, voz… Cada función usa una de
          tus <strong>conexiones</strong> de{" "}
          <Link href="/servicios" className="text-primary hover:underline inline-flex items-center gap-1">
            /servicios <ExternalLink className="h-3 w-3" />
          </Link>
          . Puedes configurarlo por <strong>usuario</strong> o por{" "}
          <strong>cerebro</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Selector de scope (usuario / cerebro) */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Ámbito de configuración
          </label>
          <div className="flex flex-wrap gap-2">
            {scopeOptions.map((s) => {
              const active = s === activeScope;
              const isBrain = s.startsWith("brain:");
              const Icon = isBrain ? Server : Cpu;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => fm.setUiScope(s)}
                  className={`text-left rounded-lg border px-3 py-1.5 text-xs transition cursor-pointer flex items-center gap-1.5 ${
                    active
                      ? "border-fuchsia-400/50 bg-fuchsia-400/10 text-fuchsia-100"
                      : "border-white/10 bg-black/20 hover:border-fuchsia-400/40 hover:bg-fuchsia-400/5 text-muted-foreground"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {scopeLabel(s, brains)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Filas por función */}
        <div className="space-y-2">
          {fm.functions.map((fn) => (
            <FunctionRow
              key={fn.id}
              fn={fn}
              scope={activeScope}
              brains={brains}
              connections={oss.connections.filter(
                (c) => c.serviceId && servicesIdsForFn(fn, oss).includes(c.serviceId),
              )}
              currentConnId={fm.getServiceFor(fn.id, activeScope) ?? ""}
              onChange={(connId) => fm.setServiceFor(fn.id, connId || null, activeScope)}
              resolvedEndpoint={fm.resolveFunction(fn.id, activeScope)}
            />
          ))}
        </div>

        <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
          <Wand2 className="h-3.5 w-3.5 shrink-0 mt-0.5 text-fuchsia-400" />
          <span>
            Si no eliges nada, cada función usa la primera conexión activa de su
            tipo (o el servicio por defecto del catálogo). Conecta más servicios
            en{" "}
            <Link href="/servicios" className="text-primary hover:underline">
              /servicios
            </Link>{" "}
            para tener más opciones aquí.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/** Ids de servicios OSS elegibles para una función (por su categoría). */
function servicesIdsForFn(
  fn: GenerationFunction,
  oss: ReturnType<typeof useOssConnections>,
): string[] {
  return oss.services
    .filter((s) => s.category === fn.category)
    .map((s) => s.id);
}

interface FunctionRowProps {
  fn: GenerationFunction;
  scope: OssScope;
  brains: Brain[];
  connections: OssConnection[];
  currentConnId: string;
  onChange: (connId: string) => void;
  resolvedEndpoint: ReturnType<
    ReturnType<typeof useFunctionModels>["resolveFunction"]
  >;
}

function FunctionRow({
  fn,
  connections,
  currentConnId,
  onChange,
  resolvedEndpoint,
}: FunctionRowProps) {
  const resolved = resolvedEndpoint?.resolved ?? null;
  const explicit = !!currentConnId;

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        {/* Identidad de la función */}
        <div className="flex items-center gap-2 md:w-48 shrink-0">
          <span className="text-lg leading-none">{fn.glyph ?? "•"}</span>
          <div>
            <p className="text-sm font-medium text-cyan-50">{fn.label}</p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {fn.category}
            </p>
          </div>
        </div>

        {/* Selector de conexión */}
        <div className="flex-1 space-y-1">
          <select
            value={currentConnId}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-md bg-background/60 border border-white/10 px-3 py-2 text-xs text-cyan-50 outline-none focus:border-fuchsia-400/50 cursor-pointer"
          >
            <option value="">
              — Automático ({resolved?.service?.name ?? "sin servicio"}) —
            </option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
                {c.endpoint ? ` · ${c.endpoint}` : ""}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground leading-snug">{fn.help}</p>
        </div>

        {/* Estado resuelto */}
        <div className="md:w-52 shrink-0 space-y-1">
          {resolved ? (
            <div className="flex items-center gap-1.5">
              {explicit ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              ) : (
                <CircleDashed className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
              <Badge
                variant="outline"
                className={
                  explicit
                    ? "text-emerald-300 border-emerald-400/40"
                    : "text-muted-foreground border-white/10"
                }
              >
                {resolved.service.name}
              </Badge>
            </div>
          ) : (
            <Badge variant="outline" className="text-rose-300 border-rose-400/40">
              Sin servicio
            </Badge>
          )}
          {resolved?.endpoint ? (
            <p className="text-[10px] font-mono text-muted-foreground break-all flex items-center gap-1">
              <ChevronRight className="h-3 w-3 shrink-0" />
              {resolved.endpoint}
            </p>
          ) : resolved && !resolved.endpoint ? (
            <p className="text-[10px] text-muted-foreground">
              {resolved.service.runsInBrowser
                ? "Corre en el navegador"
                : "Sin endpoint configurado"}
            </p>
          ) : null}
        </div>
      </div>

      {/* Enlace rápido para conectar más de este tipo */}
      {connections.length === 0 && (
        <div className="mt-2 pt-2 border-t border-white/5">
          <Link
            href="/servicios"
            className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
          >
            Conectar un servicio de {fn.label.toLowerCase()}{" "}
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}

export default FunctionModelsPanel;
