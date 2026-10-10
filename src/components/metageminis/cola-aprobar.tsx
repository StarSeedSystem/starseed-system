"use client";

/*
 * ColaAprobar — la cola «Para aprobar» de MetaGeminis (2026-10-10).
 * NADA sale sin pasar por aquí: cada mensaje o propuesta espera a que un DUEÑO de MetaGenesis lo apruebe con un
 * toque (o lo descarte con un motivo). Antes de decidir se ven los avisos de honestidad (¿el sitio acepta texto de IA?,
 * ¿el texto dice que lo escribe un agente?, ¿ha vencido el plazo?). Los envíos «a mano» los marca la persona que los hizo.
 */

import { useState } from "react";
import { BadgeCheck, Check, ChevronDown, ExternalLink, Loader2, Send, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { avisosBorrador, nivelMasAlto } from "@/lib/metageminis/avisos";
import { fechaCorta, ordenarParaAprobar, textoPuntuacion } from "@/lib/metageminis/cola";
import { sitioPorId } from "@/lib/metageminis/consulta";
import type { RespuestaOp } from "@/lib/metageminis/datos";
import { ETIQUETA_CANAL, nombreRama, type Borrador } from "@/lib/metageminis/tipos";

export interface AccionesCola {
  aprobar: (id: string) => Promise<RespuestaOp>;
  descartar: (id: string, motivo: string) => Promise<RespuestaOp>;
  marcarEnviado: (id: string) => Promise<RespuestaOp>;
}

interface Props {
  borradores: readonly Borrador[];
  esDueno: boolean;
  acciones: AccionesCola;
  /** Se llama tras una decisión válida (para recargar). */
  alCambiar?: () => void;
  hoy?: Date;
}

const COLOR_NIVEL = {
  alto: "border-emerald-400/40 text-emerald-200",
  medio: "border-cyan-400/40 text-cyan-200",
  bajo: "border-rose-400/40 text-rose-200",
} as const;

function TarjetaBorrador({ b, esDueno, acciones, alCambiar, hoy }: Props & { b: Borrador }) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [descartando, setDescartando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const sitio = b.sitio_id ? sitioPorId(b.sitio_id) : undefined;
  const avisos = avisosBorrador(b, hoy);
  const peor = nivelMasAlto(avisos);

  const ejecutar = async (clave: string, accion: () => Promise<RespuestaOp>, bien: string) => {
    setOcupado(clave);
    const r = await accion();
    setOcupado(null);
    if (r.ok) {
      toast.success(bien);
      setDescartando(false);
      setMotivo("");
      alCambiar?.();
    } else toast.error(r.motivo ?? "No se pudo completar.");
  };

  const titulo = b.asunto?.trim() || b.cuerpo.split("\n")[0].slice(0, 90);
  const pendiente = b.estado === "para_aprobar";

  return (
    <li
      data-testid="borrador"
      data-estado={b.estado}
      className={cn("space-y-2 rounded-xl border bg-black/20 p-3", peor === "alto" ? "border-rose-400/30" : "border-white/10")}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="text-[10px]">
          {nombreRama(b.rama_id)}
        </Badge>
        <Badge variant="outline" className={cn("text-[10px]", COLOR_NIVEL[b.puntuacion_nivel ?? "medio"])} title="Puntuación de Jev: orienta, no decide">
          Jev: {textoPuntuacion(b)}
        </Badge>
        <Badge variant="outline" className="text-[10px] text-white/70">
          {ETIQUETA_CANAL[b.canal]}
        </Badge>
        <span className="ml-auto text-[11px] text-white/40">{fechaCorta(b.creado_en)}</span>
      </div>

      <p className="text-sm font-medium text-white">{titulo}</p>
      <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-white/55">
        Para:{" "}
        {sitio ? (
          <a href={sitio.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-cyan-200 underline-offset-2 hover:underline">
            {sitio.nombre} <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : (
          <span>{b.sitio_id ? `${b.sitio_id} (fuera del directorio)` : "sin sitio concreto"}</span>
        )}
      </p>

      {avisos.length > 0 && (
        <ul className="space-y-1" aria-label="Avisos antes de decidir">
          {avisos.map((a) => (
            <li
              key={a.texto}
              data-nivel={a.nivel}
              className={cn(
                "flex items-start gap-1.5 rounded-lg border px-2 py-1 text-[11px]",
                a.nivel === "alto" ? "border-rose-400/30 bg-rose-500/10 text-rose-100" : "border-amber-400/25 bg-amber-500/[0.06] text-amber-100",
              )}
            >
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {a.texto}
            </li>
          ))}
        </ul>
      )}

      <details className="group rounded-lg border border-white/10 bg-black/20 p-2 text-xs">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-white/70 [&::-webkit-details-marker]:hidden">
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden /> Leer el texto completo
        </summary>
        <p className="mt-2 whitespace-pre-wrap break-words text-white/85">{b.cuerpo}</p>
      </details>

      {b.estado === "aprobado" && (
        <p className="flex items-center gap-1.5 text-[11px] text-emerald-200">
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Aprobado el {fechaCorta(b.aprobado_en)}.{" "}
          {b.canal === "manual_alex" ? "Lo envía una persona." : "Esperando a que el agente lo envíe."}
        </p>
      )}

      {!esDueno ? (
        <p className="text-[11px] text-white/45">Solo los dueños de MetaGenesis aprueban, descartan o marcan como enviado.</p>
      ) : pendiente ? (
        descartando ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`motivo-${b.id}`}>
              Motivo del descarte
            </label>
            <input
              id={`motivo-${b.id}`}
              value={motivo}
              maxLength={300}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo (opcional)"
              className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/30 p-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
            />
            <Button size="sm" variant="ghost" className="cursor-pointer text-rose-200" disabled={ocupado !== null} onClick={() => void ejecutar("descartar", () => acciones.descartar(b.id, motivo), "Descartado.")}>
              {ocupado === "descartar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
              Confirmar descarte
            </Button>
            <Button size="sm" variant="ghost" className="cursor-pointer" disabled={ocupado !== null} onClick={() => setDescartando(false)}>
              Cancelar
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="cursor-pointer gap-1" disabled={ocupado !== null} onClick={() => void ejecutar("aprobar", () => acciones.aprobar(b.id), "Aprobado.")}>
              {ocupado === "aprobar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
              {peor === "alto" ? "Aprobar igualmente" : "Aprobar"}
            </Button>
            <Button size="sm" variant="outline" className="cursor-pointer gap-1" disabled={ocupado !== null} onClick={() => setDescartando(true)}>
              <X className="h-3.5 w-3.5" aria-hidden /> Descartar
            </Button>
          </div>
        )
      ) : b.estado === "aprobado" && b.canal === "manual_alex" ? (
        <Button size="sm" variant="outline" className="cursor-pointer gap-1" disabled={ocupado !== null} onClick={() => void ejecutar("enviado", () => acciones.marcarEnviado(b.id), "Marcado como enviado.")}>
          {ocupado === "enviado" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />}
          Ya lo envié yo
        </Button>
      ) : null}
    </li>
  );
}

export function ColaAprobar(props: Props) {
  const { borradores } = props;
  const paraAprobar = ordenarParaAprobar(borradores);
  const aprobados = borradores.filter((b) => b.estado === "aprobado");
  return (
    <div className="space-y-4" data-testid="cola-aprobar">
      <section aria-labelledby="mg-para-aprobar" className="space-y-2">
        <h4 id="mg-para-aprobar" className="text-sm font-semibold text-white">
          Para aprobar <span className="text-white/45">({paraAprobar.length})</span>
        </h4>
        {paraAprobar.length === 0 ? (
          <p className="rounded-xl border border-white/10 p-3 text-xs text-white/60">
            No hay nada esperando tu aprobación. Cuando MetaGeminis prepare un mensaje o una propuesta, aparecerá aquí y no saldrá hasta que lo apruebes.
          </p>
        ) : (
          <ul className="space-y-2">
            {paraAprobar.map((b) => (
              <TarjetaBorrador key={b.id} b={b} {...props} />
            ))}
          </ul>
        )}
      </section>
      {aprobados.length > 0 && (
        <section aria-labelledby="mg-aprobados" className="space-y-2">
          <h4 id="mg-aprobados" className="text-sm font-semibold text-white">
            Aprobados, pendientes de enviar <span className="text-white/45">({aprobados.length})</span>
          </h4>
          <ul className="space-y-2">
            {aprobados.map((b) => (
              <TarjetaBorrador key={b.id} b={b} {...props} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
