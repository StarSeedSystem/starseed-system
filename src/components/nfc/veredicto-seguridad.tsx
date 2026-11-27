"use client";

import { AlertOctagon, AlertTriangle, Lightbulb, ShieldCheck } from "lucide-react";
import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import type { ResultadoEscaneo, Veredicto } from "@/lib/security/vinculos-escaner";

interface Props {
  resultado: ResultadoEscaneo;
  /** El usuario confirma abrir (solo en «aviso») o abre directo (seguro/sugerencia). */
  onAbrir?: () => void;
  onRechazar?: () => void;
}

const ESTILO: Record<Veredicto, { titulo: string; Icono: ComponentType<{ className?: string }>; clases: string }> = {
  seguro: { titulo: "Seguro", Icono: ShieldCheck, clases: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" },
  sugerencia: { titulo: "Sugerencia", Icono: Lightbulb, clases: "border-sky-500/40 bg-sky-500/10 text-sky-200" },
  aviso: { titulo: "Aviso", Icono: AlertTriangle, clases: "border-amber-500/40 bg-amber-500/10 text-amber-200" },
  alerta: { titulo: "Alerta", Icono: AlertOctagon, clases: "border-red-500/50 bg-red-500/10 text-red-200" },
};

export function VeredictoSeguridad({ resultado, onAbrir, onRechazar }: Props) {
  const { titulo, Icono, clases } = ESTILO[resultado.veredicto];
  return (
    <section
      role={resultado.bloquea ? "alert" : "status"}
      aria-label={"Veredicto de seguridad: " + titulo}
      data-testid="veredicto-seguridad"
      className={"flex flex-col gap-3 rounded-xl border p-4 backdrop-blur " + clases}
    >
      <header className="flex items-center gap-2 font-medium">
        <Icono className="h-5 w-5" />
        <span>{titulo}</span>
      </header>
      <p className="text-sm">{resultado.explicacion}</p>
      {resultado.motivos.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-xs opacity-90">
          {resultado.motivos.map((m) => (
            <li key={m.codigo}>{m.explicacion}</li>
          ))}
        </ul>
      )}
      <footer className="flex gap-2">
        {!resultado.bloquea && (
          <Button size="sm" className="cursor-pointer" onClick={onAbrir}>
            {resultado.requiereConfirmar ? "Abrir de todos modos" : "Abrir"}
          </Button>
        )}
        {onRechazar && (
          <Button size="sm" variant="outline" className="cursor-pointer" onClick={onRechazar}>
            {resultado.bloquea ? "Entendido" : "No abrir"}
          </Button>
        )}
      </footer>
    </section>
  );
}
