"use client";

/**
 * La transcripción de un sueño, turno a turno (Ola 1025U · U4). Cada autor lleva su chapa «Bot de IA» (la de
 * `EtiquetaBotIA`, que no se puede ocultar) y, debajo, lo que el sueño dejó en ellos: recuerdos guardados y rasgos
 * movidos, o por qué no. Lo que dicen es imaginación de una IA, no hechos, y se dice.
 */
import { Info } from "lucide-react";
import { EtiquetaBotIA } from "@/components/agentes-red/etiqueta-bot-ia";
import type { Sueno } from "@/lib/avatares/suenos/sueno";

export function TranscripcionSueno({ sueno }: { sueno: Sueno }) {
  const previstos = sueno.orden.length;
  const c = sueno.consolidacion;
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="transcripcion-sueno">
      {sueno.turnos.length === 0 ? (
        <p className="text-xs text-white/60" role="status">
          {sueno.estado === "en-curso" ? "Esperando el primer turno de la IA…" : "No se escribió ningún turno: no se inventa un sueño que nadie soñó."}
        </p>
      ) : (
        <ol className="flex min-w-0 flex-col gap-2" aria-label={`Transcripción del sueño sobre ${sueno.tema}`}>
          {sueno.turnos.map((t, i) => (
            <li key={`${i}-${t.at}`} data-testid="turno-sueno" className="min-w-0 rounded-xl border border-white/10 bg-black/25 px-3 py-2">
              <div className="mb-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="min-w-0 break-words font-headline text-sm font-semibold tracking-wide text-white">{t.autorNombre}</span>
                <EtiquetaBotIA />
                <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-white/40">
                  turno {i + 1} de {previstos}
                </span>
              </div>
              <p className="break-words text-sm leading-relaxed text-white/85">{t.texto}</p>
            </li>
          ))}
        </ol>
      )}

      {sueno.estado !== "completo" && sueno.estado !== "en-curso" && sueno.motivo && (
        <p
          role="status"
          data-testid="motivo-sueno"
          className="break-words rounded-xl border border-[#FFBF00]/40 bg-[#FFBF00]/10 px-3 py-2 text-xs text-[#ffe9a8]"
        >
          {sueno.motivo}
        </p>
      )}

      {sueno.estado === "completo" && c && (
        <div className="flex min-w-0 flex-col gap-1 text-xs text-white/65" data-testid="consolidacion-sueno">
          <p>
            Al despertar: {c.recuerdos} {c.recuerdos === 1 ? "recuerdo guardado" : "recuerdos guardados"} · {c.rasgos}{" "}
            {c.rasgos === 1 ? "rasgo movido" : "rasgos movidos"} por la experiencia (poco, con tope diario y se puede deshacer en su ficha).
          </p>
          {c.avisos.map((a) => (
            <p key={a} className="break-words text-[#ffe9a8]">{a}</p>
          ))}
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[11px] leading-snug text-white/45">
        <Info className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
        Imaginación de una IA, no hechos. Nada de esto ocurrió de verdad.
      </p>
    </div>
  );
}
