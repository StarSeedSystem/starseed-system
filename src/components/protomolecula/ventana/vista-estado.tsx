"use client";
/**
 * Ventana de la Protomolécula · estados honestos de la petición: planificando, ejecutando, resultado y error.
 * Cada uno dice qué pasó de verdad y qué se puede hacer a continuación.
 */
import { TriangleAlert, CircleCheck, Loader2, RotateCcw, Undo2, WandSparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { permiteReglasLocales, permiteReintento, textoFallo } from "./pasos";
import type { EstadoPeticion } from "./tipos";

const boton = "inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-full border border-white/15 px-4 text-sm font-medium transition-colors duration-150 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F0FF]/80";

export function Cargando({ texto, alCancelar }: { texto: string; alCancelar?: () => void }) {
  return (
    <div role="status" className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm">
      <Loader2 className="h-4 w-4 shrink-0 text-[#00F0FF] motion-safe:animate-spin" aria-hidden="true" />
      <span className="min-w-0 flex-1">{texto}</span>
      {alCancelar && (
        <button type="button" onClick={alCancelar} className={cn(boton, "px-3 text-xs")}>Cancelar</button>
      )}
    </div>
  );
}

export interface ResultadoProps {
  estado: Extract<EstadoPeticion, { fase: "hecho" }>;
  alDeshacer?: () => void;
  alCerrar: () => void;
}

export function Resultado({ estado, alDeshacer, alCerrar }: ResultadoProps) {
  const { resultado } = estado;
  const ok = resultado.ok;
  return (
    <section
      role={ok ? "status" : "alert"}
      aria-label={ok ? "Hecho" : "No se pudo aplicar"}
      data-testid="resultado-plan"
      className={cn("rounded-2xl border p-3 text-sm", ok ? "border-[#10B981]/40 bg-[#10B981]/10" : "border-[#DC143C]/50 bg-[#DC143C]/10")}
    >
      <p className="flex items-center gap-2 font-headline font-semibold tracking-wide">
        {ok ? <CircleCheck className="h-4 w-4 text-[#10B981]" aria-hidden="true" /> : <TriangleAlert className="h-4 w-4 text-[#FF6B85]" aria-hidden="true" />}
        {ok ? "Hecho" : "No se pudo aplicar"}
      </p>
      {resultado.motivo ? <p className="mt-1 break-words text-xs text-white/80">{resultado.motivo}</p> : null}
      {resultado.hechos.length > 0 && (
        <ul className="mt-1.5 list-disc pl-4 text-xs text-white/85">
          {resultado.hechos.map((h, i) => <li key={i} className="break-words">{h}</li>)}
        </ul>
      )}
      {resultado.pendientes.length > 0 && (
        <div className="mt-1.5 text-xs">
          <p className="font-medium text-white/80">Pendiente de tu confirmación o de otros pasos</p>
          <ul className="list-disc pl-4 text-white/75">
            {resultado.pendientes.map((h, i) => <li key={i} className="break-words">{h}</li>)}
          </ul>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {resultado.deshacer && alDeshacer && (
          <button type="button" onClick={alDeshacer} className={boton}><Undo2 className="h-4 w-4" aria-hidden="true" />Deshacer</button>
        )}
        <button type="button" onClick={alCerrar} className={boton}><X className="h-4 w-4" aria-hidden="true" />Cerrar</button>
      </div>
    </section>
  );
}

export interface ErrorProps {
  estado: Extract<EstadoPeticion, { fase: "error" }>;
  alReintentar: () => void;
  alUsarReglasLocales: () => void;
  alCerrar: () => void;
}

export function ErrorPeticion({ estado, alReintentar, alUsarReglasLocales, alCerrar }: ErrorProps) {
  const reglas = permiteReglasLocales(estado.tipo) && Boolean(estado.texto);
  const reintentar = permiteReintento(estado.tipo) && Boolean(estado.texto);
  return (
    <section role="alert" data-testid="error-peticion" data-tipo={estado.tipo} className="rounded-2xl border border-[#FFBF00]/40 bg-[#FFBF00]/10 p-3 text-xs leading-snug">
      <p className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#FFBF00]" aria-hidden="true" />
        <span className="min-w-0 break-words">{textoFallo(estado.tipo, estado.motivo)}</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {reglas && (
          <button type="button" onClick={alUsarReglasLocales} className={boton}><WandSparkles className="h-4 w-4" aria-hidden="true" />Probar con las reglas locales</button>
        )}
        {reintentar && (
          <button type="button" onClick={alReintentar} className={boton}><RotateCcw className="h-4 w-4" aria-hidden="true" />Reintentar</button>
        )}
        <button type="button" onClick={alCerrar} className={boton}><X className="h-4 w-4" aria-hidden="true" />Cerrar</button>
      </div>
    </section>
  );
}
