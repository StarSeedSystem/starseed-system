"use client";

/* Asistente «Conectar Genesis» · estado de Cloudroom (Ola 1024C · CRM1024F).
 * La entrada `cloudroom` del catálogo (CRM1024B) se pinta aquí con su estado
 * honesto: si consta instalada en esta neurona y cuánto cupo le queda al
 * contexto (cupo-cloudroom.ts, CRM1024C). Solo se propone como servidor de un
 * agente cuando `sugerirParaAmbito` la devuelve; si no, se dice por qué.
 * Módulo de cliente sin red ni claves: todo entra por props. */

import { Cloud, ExternalLink } from "lucide-react";
import { cupoRestante, ritmoDiario, type Consumo, type PlanCloudroom } from "@/lib/genesis/conectores/cupo-cloudroom";
import type { GrupoSugerencias, Sugerencia } from "@/lib/genesis/conectores/sugerir";

export type InstalacionCloudroom = "instalada" | "no-instalada" | "sin-dato";

export interface EntradaEstadoCloudroom {
  instalacion?: InstalacionCloudroom;
  plan?: PlanCloudroom;
  consumos?: readonly Consumo[];
  inicioCiclo?: string | number;
  ahora?: string | number;
  diasQueQuedan?: number;
  sugerencias?: readonly GrupoSugerencias[];
}

export interface EstadoCloudroom {
  instalacion: InstalacionCloudroom;
  cupo: number | null;
  ritmo: number;
  sugerencia: Sugerencia | null;
  ofrecible: boolean;
  texto: string;
}

/** Busca la sugerencia de Cloudroom en los grupos que devuelve el sugeridor. */
export function sugerenciaCloudroom(grupos: readonly GrupoSugerencias[]): Sugerencia | null {
  for (const grupo of grupos) {
    if (!("opciones" in grupo)) continue;
    const encontrada = grupo.opciones.find((opcion) => opcion.id === "cloudroom");
    if (encontrada) return encontrada;
  }
  return null;
}

const ESTADO_INSTALACION: Record<InstalacionCloudroom, string> = {
  instalada: "instalada en esta neurona",
  "no-instalada": "no instalada en esta neurona",
  "sin-dato": "instalación sin comprobar en esta neurona",
};

export function estadoCloudroom(entrada: EntradaEstadoCloudroom): EstadoCloudroom {
  const instalacion = entrada.instalacion ?? "sin-dato";
  const conCiclo = entrada.plan !== undefined && entrada.inicioCiclo !== undefined && entrada.ahora !== undefined;
  const cupo = conCiclo
    ? cupoRestante(entrada.plan!, [...(entrada.consumos ?? [])], entrada.inicioCiclo!, entrada.ahora!)
    : null;
  const ritmo = cupo !== null && entrada.diasQueQuedan !== undefined
    ? ritmoDiario(cupo, entrada.diasQueQuedan)
    : 0;
  const sugerencia = sugerenciaCloudroom(entrada.sugerencias ?? []);
  const cupoTexto = cupo === null
    ? "cupo sin lectura"
    : `${cupo} agente(s) en la nube en este ciclo · ritmo ${ritmo}/día`;
  const motivo = sugerencia
    ? `Sugerida para este contexto: ${sugerencia.motivo}`
    : "No se ofrece como servidor: el sugeridor no la devuelve para este contexto.";
  return {
    instalacion,
    cupo,
    ritmo,
    sugerencia,
    ofrecible: sugerencia !== null && instalacion !== "no-instalada",
    texto: `Cloudroom: ${ESTADO_INSTALACION[instalacion]}; ${cupoTexto}. ${motivo}`,
  };
}

export function AsistenteConectores({ entrada, className = "" }: { entrada: EntradaEstadoCloudroom; className?: string }) {
  const estado = estadoCloudroom(entrada);
  return (
    <section
      aria-label="Cloudroom como servidor de agentes"
      className={`rounded-xl border border-cyan-400/20 bg-cyan-500/[0.04] p-3 ${className}`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <Cloud className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden />
        <h3 className="text-sm font-semibold text-white/85">Cloudroom</h3>
        <span
          data-testid="cloudroom-instalacion"
          className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] text-white/60"
        >
          {ESTADO_INSTALACION[estado.instalacion]}
        </span>
        <span data-testid="cloudroom-cupo" className="text-[10px] text-white/55">
          {estado.cupo === null ? "Cupo sin lectura" : `${estado.cupo} agente(s) en la nube · ritmo ${estado.ritmo}/día`}
        </span>
      </header>
      <p className="mt-1 text-[11px] text-white/55">{estado.texto}</p>
      {estado.ofrecible && estado.sugerencia ? (
        <p role="status" className="mt-2 rounded-lg border border-emerald-400/25 bg-emerald-500/10 p-2 text-[11px] text-emerald-100">
          Sugerida para los agentes de este ámbito (100 agentes en la nube cada 30 días).
          {estado.sugerencia.enlaceAlta ? (
            <a
              href={estado.sugerencia.enlaceAlta}
              target="_blank"
              rel="noreferrer"
              className="ml-1 inline-flex cursor-pointer items-center gap-0.5 underline"
            >
              Abrir Cloudroom <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          ) : null}
        </p>
      ) : (
        <p role="status" className="mt-2 rounded-lg border border-white/10 bg-black/20 p-2 text-[11px] text-white/50">
          No se sugiere aquí; el catálogo la mantiene como una opción más, nunca la única.
        </p>
      )}
    </section>
  );
}
