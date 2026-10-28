"use client";

/**
 * InsomneFicha — «Siempre disponible (pantalla cerrada)» por neurona (INS1027D).
 * Contrato: architecture/neurona-insomne.md §5. El OS LEE el estado de Insomnia
 * (viaja en la presencia); nunca ejecuta `pmset` ni usa su regla de sudoers.
 */

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, Eye, Moon, Wind } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Neuron } from "@/lib/neurons/neurons";
import { usePresenciaNeuronas, type PresenciaMedio } from "@/lib/neurons/presencia";
import { capacidadInsomne, politicaInsomne, type CapacidadInsomne, type PoliticaInsomne } from "@/lib/neurons/insomne";

/** Ficha de la Biblioteca que instala Insomnia (solo guarda el enlace). */
export const ENLACE_BIBLIOTECA_INSOMNIA = "/library?tab=destacado";
const PROVEEDORES: Record<string, string> = {
  insomnia: "Insomnia", caffeinate: "caffeinate", "systemd-inhibit": "systemd-inhibit",
  powercfg: "powercfg", siempre: "Siempre encendido", "wake-lock": "Screen Wake Lock", no: "Sin proveedor",
};

export interface SesionInsomne { hasta: number; proveedor: string; }
export interface ResumenInsomne { titulo: string; detalle: string; mostrarInstalacion: boolean; }

export function horaCorta(hasta: number | string | null): string {
  if (hasta === null) return "—";
  const t = typeof hasta === "number" ? hasta : Date.parse(hasta);
  return Number.isFinite(t) ? new Date(t).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "—";
}

export function sesionVigente(medios: readonly PresenciaMedio[], id: string, ahora: number = Date.now()): SesionInsomne | null {
  let mejor: SesionInsomne | null = null;
  for (const medio of medios) {
    if (medio.n !== id) continue;
    const sesion = medio.s?.insomne;
    if (!sesion || !Number.isFinite(sesion.hasta) || sesion.hasta <= ahora) continue;
    if (!mejor || sesion.hasta > mejor.hasta) mejor = { hasta: sesion.hasta, proveedor: sesion.proveedor };
  }
  return mejor;
}

export function sigueFuncionando(p: PoliticaInsomne): string {
  const partes = [
    p.agentes && "agentes", p.programados && "procesos programados", p.malla && "malla P2P",
    p.servidorCerebro && "servidor del cerebro", p.biblioteca && "Biblioteca",
  ].filter(Boolean);
  return partes.length ? partes.join(", ") : "nada (la política está apagada)";
}

export function resumenInsomne(capacidad: CapacidadInsomne, sesion: SesionInsomne | null, plataforma: string, versionSO?: string): ResumenInsomne {
  if (sesion) {
    return {
      titulo: `Siempre disponible hasta las ${horaCorta(sesion.hasta)}`,
      detalle: `Proveedor: ${PROVEEDORES[sesion.proveedor] ?? sesion.proveedor}. El OS solo lee su estado; la sesión la lleva la app.`,
      mostrarInstalacion: false,
    };
  }
  if (capacidad.disponible) {
    return {
      titulo: "Siempre disponible (sin sesión activa)",
      detalle: `Proveedor previsto: ${PROVEEDORES[capacidad.proveedor] ?? capacidad.proveedor}. ${capacidad.motivo}.`,
      mostrarInstalacion: capacidad.proveedor === "insomnia",
    };
  }
  if (/mac/i.test(plataforma) && !versionSO) {
    return {
      titulo: "Siempre disponible si esta Mac es compatible",
      detalle: `Insomnia pide macOS 26 o posterior en Apple Silicon. ${capacidad.motivo}.`,
      mostrarInstalacion: true,
    };
  }
  return { titulo: "No puede seguir con la pantalla cerrada", detalle: capacidad.motivo, mostrarInstalacion: false };
}

export function InsomneFicha({ neurona }: { neurona: Neuron }) {
  const plataforma = neurona.capabilities?.platform ?? "";
  const caps = neurona.capabilities as unknown as Record<string, unknown>;
  const versionSO = ["osVersion", "versionSO", "soVersion", "plataformaVersion"]
    .map((k) => caps[k]).find((v): v is string => typeof v === "string" && v.trim() !== "")?.trim();
  const capacidad = capacidadInsomne(plataforma, versionSO);
  const politica = politicaInsomne();
  const { medios } = usePresenciaNeuronas();
  const sesion = useMemo(() => sesionVigente(medios, neurona.id), [medios, neurona.id]);
  const resumen = resumenInsomne(capacidad, sesion, plataforma, versionSO);
  const activo = sesion !== null;

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <Eye className={cn("w-4 h-4 mt-0.5 shrink-0", activo ? "text-cyan-300" : "text-white/40")} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-white/80">Siempre disponible (pantalla cerrada)</p>
          <p className={cn("text-[11px]", activo ? "text-cyan-200" : "text-white/55")}>{resumen.titulo}</p>
        </div>
        <Badge variant="outline" className={cn("text-[9px] shrink-0", activo ? "border-cyan-400/40 text-cyan-200 bg-cyan-500/10" : "border-white/15 text-white/45 bg-black/20")}>
          {activo ? "En sesión" : resumen.mostrarInstalacion ? "Instalable" : "No compatible"}
        </Badge>
      </div>
      <p className="text-[11px] text-white/45">{resumen.detalle}</p>
      {activo && (
        <p className="text-[11px] text-white/55">
          <Moon className="w-3 h-3 inline mr-1 text-violet-300/80" aria-hidden />
          Sigue sirviendo: {sigueFuncionando(politica)}.
        </p>
      )}
      {resumen.mostrarInstalacion && (
        <div className="rounded-lg border border-amber-400/25 bg-amber-500/[0.06] p-2.5 space-y-1.5">
          <p className="text-[11px] text-amber-100/90">La sesión la empiezas tú desde la barra de menús de Insomnia; el OS solo lee su estado.</p>
          <p className="flex items-start gap-1.5 text-[11px] text-amber-200/85"><Wind className="w-3 h-3 mt-0.5 shrink-0" aria-hidden /><span>Apoya la Mac en una superficie estable y ventilada: nunca dentro de una bolsa.</span></p>
          <p className="flex items-start gap-1.5 text-[11px] text-amber-200/85"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" aria-hidden /><span>Su instalador pide tu contraseña y deja una regla de sudoers que permite a cualquier programa de tu usuario cambiar el sueño de la Mac; revísala antes.</span></p>
          <Link href={ENLACE_BIBLIOTECA_INSOMNIA} className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-300 hover:underline cursor-pointer">Abrir la ficha de Insomnia (lib-insomnia) en la Biblioteca →</Link>
        </div>
      )}
    </div>
  );
}
