"use client";

/**
 * Ficha de una marca: hoja inferior en el teléfono, panel lateral en pantalla ancha.
 * Los botones que dependen de permisos de control remoto salen desactivados («próximamente»).
 * Para MI aparato, el dueño elige aquí quién ve su posición (apagado de fábrica).
 */

import { useState } from "react";
import { X, MapPinOff, LocateFixed } from "lucide-react";
import { cn } from "@/lib/utils";
import { fichaDeMarca, accionesDeMarca, DESCONOCIDO } from "@/lib/senales/geo/ficha-geo";
import type { MarcaGeo } from "@/lib/senales/geo/marcas";
import type { NivelPosicion, PreferenciaPosicion } from "@/lib/senales/geo/modelo-geo";
import { fijarPreferenciaPosicion, olvidarPosicionCruda, pedirUbicacion } from "@/lib/senales/geo/almacen-posicion";

const ESTILO_ESTADO: Record<string, string> = {
  medido: "text-emerald-300",
  declarado: "text-sky-300",
  estimado: "text-amber-300",
  "no-medido": "text-white/50",
};
const ETIQUETA_ESTADO: Record<string, string> = { medido: "medido", declarado: "declarado", estimado: "estimado", "no-medido": "sin medir" };

const OPCIONES: { id: NivelPosicion; texto: string }[] = [
  { id: "no", texto: "Nadie" },
  { id: "zona", texto: "Zona ≈1 km" },
  { id: "exacta", texto: "Punto exacto" },
];

export function FichaGeo({ marca, pref, compacto, onCerrar }: { marca: MarcaGeo; pref: PreferenciaPosicion; compacto: boolean; onCerrar: () => void }) {
  const ficha = fichaDeMarca(marca, marca.esYo ? pref : null);
  const acciones = accionesDeMarca();
  const [aviso, setAviso] = useState<string | null>(null);
  const [pidiendo, setPidiendo] = useState(false);

  const usarUbicacion = async () => {
    setPidiendo(true);
    const r = await pedirUbicacion();
    setAviso(r.ok ? null : `No se pudo: ${r.motivo}.`);
    setPidiendo(false);
  };

  return (
    <aside
      role="dialog" aria-label={`Ficha de ${marca.nombre}`} data-testid="ficha-geo"
      className={cn(
        "absolute z-[600] flex flex-col overflow-hidden border border-white/15 bg-[#0b1220]/95 text-white shadow-2xl backdrop-blur",
        compacto ? "inset-x-0 bottom-0 max-h-[82%] rounded-t-2xl" : "bottom-2 right-2 top-2 w-80 rounded-2xl",
      )}
    >
      {compacto && <div className="mx-auto mt-1.5 h-1 w-10 shrink-0 rounded-full bg-white/25" aria-hidden />}
      <header className="flex items-start gap-2 border-b border-white/10 px-3 py-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{ficha.titulo}</h3>
          <p className="truncate text-[11px] text-white/60">{ficha.subtitulo}</p>
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar ficha" className="cursor-pointer rounded-lg p-1.5 text-white/70 hover:bg-white/10"><X className="h-4 w-4" /></button>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-2">
        <p className="text-[11px] text-white/65">{ficha.resumen}</p>
        {ficha.secciones.map((s) => (
          <section key={s.id}>
            <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/50">{s.titulo}</h4>
            <dl className="space-y-1.5">
              {s.datos.map((d) => (
                <div key={d.etiqueta} className="rounded-lg bg-white/[0.04] px-2 py-1.5">
                  <dt className="flex items-center justify-between gap-2 text-[11px] text-white/60">
                    <span>{d.etiqueta}</span>
                    <span className={cn("text-[10px]", ESTILO_ESTADO[d.estado])}>{ETIQUETA_ESTADO[d.estado]}</span>
                  </dt>
                  <dd className={cn("text-[12px]", d.valor === DESCONOCIDO ? "italic text-white/50" : "text-white/90")}>{d.valor}</dd>
                  <dd className="text-[10px] text-white/45">{d.fuente}{d.nota ? ` — ${d.nota}` : ""}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        {marca.esYo && (
          <section data-testid="privacidad-posicion" className="rounded-lg border border-sky-400/25 bg-sky-500/[0.06] px-2 py-2">
            <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-sky-200">Quién ve mi posición</h4>
            <p className="mb-1.5 text-[11px] text-white/65">Tu punto exacto es privado: solo sale de este aparato si lo eliges aquí. Puedes retirarlo al instante.</p>
            <div className="mb-1 text-[11px] text-white/70">Mis otras neuronas</div>
            <div className="mb-2 flex flex-wrap gap-1" role="radiogroup" aria-label="Qué ven mis otras neuronas">
              {OPCIONES.map((o) => (
                <button key={o.id} type="button" role="radio" aria-checked={pref.cuenta === o.id} onClick={() => fijarPreferenciaPosicion({ cuenta: o.id })}
                  className={cn("cursor-pointer rounded-lg border px-2 py-1 text-[11px]", pref.cuenta === o.id ? "border-sky-400/50 bg-sky-500/20 text-sky-100" : "border-white/10 text-white/70 hover:border-white/30")}>{o.texto}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" disabled={pidiendo} onClick={usarUbicacion} className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-100 disabled:opacity-50"><LocateFixed className="h-3 w-3" />{pidiendo ? "Buscando…" : "Usar mi ubicación"}</button>
              <button type="button" onClick={olvidarPosicionCruda} className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/15 px-2 py-1 text-[11px] text-white/75"><MapPinOff className="h-3 w-3" />Olvidar mi ubicación</button>
            </div>
            {aviso && <p role="status" className="mt-1 text-[11px] text-amber-300">{aviso}</p>}
          </section>
        )}
      </div>
      <footer className="border-t border-white/10 px-3 py-2">
        <div className="flex flex-wrap gap-1.5">
          {acciones.map((a) => (
            <button key={a.id} type="button" disabled={!a.habilitada} title={`${a.etiqueta}: ${a.nota}`} className="cursor-not-allowed rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-white/35">{a.etiqueta}</button>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-white/45">Ver, pedir acceso y configurar: próximamente.</p>
      </footer>
    </aside>
  );
}
