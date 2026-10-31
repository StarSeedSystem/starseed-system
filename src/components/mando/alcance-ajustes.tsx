"use client";

/**
 * Ajustes de alcance (INV1025Q): el interruptor «Envío automático inteligente»
 * nace APAGADO y BLOQUEADO (R2/§4): mientras el informe de sombra no diga
 * `validado: true`, manda «Validación pendiente». Muestra el informe en vivo
 * (muestras, falsos positivos, acierto, incidencias y tasa de respuesta) y los
 * límites del piloto. Activarlo pide escribir ACTIVAR y lo confirma una
 * persona — nunca lo enciende un agente ni el informe: solo Alex.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";

export interface InformeSombra {
  validado: boolean;
  validez: { muestras_21d: number; min: number; dias: number };
  falsos_positivos: { ultimos_30d: number; max: number };
  acierto_sin_cambios: { pct: number; min: number };
  incidencias: { total: number; max: number };
  tasa_respuesta: { automatica_pct: number | null; manual_pct: number | null; no_peor: boolean | null };
  piloto: Record<string, unknown>;
}

const ETIQUETAS: Record<string, string> = {
  tope_dia: "tope al día", nivel: "solo nivel", medio: "solo medio",
  retencion_horas: "retención, aviso para cancelar (h)", aviso_cancelar: "aviso para cancelar", interruptor_general: "interruptor general",
};

/** Las cifras del informe línea por línea, sin inventar nada. PURA. */
export function lineasInforme(i: InformeSombra | null): string[] {
  if (!i) return [];
  const tasa = i.tasa_respuesta;
  const tasaTexto = tasa.no_peor === null ? "sin datos" : `${tasa.automatica_pct} % · ${tasa.no_peor ? "no peor" : "PEOR"} que la manual${tasa.manual_pct === null ? "" : ` (${tasa.manual_pct} %)`}`;
  return [
    `Muestras en ${i.validez.dias} días: ${i.validez.muestras_21d} / ${i.validez.min}`,
    `Falsos positivos (últimos 30 días): ${i.falsos_positivos.ultimos_30d} / ${i.falsos_positivos.max} permitidos`,
    `Acierto sobre lo aprobado sin cambios: ${i.acierto_sin_cambios.pct} % / ${i.acierto_sin_cambios.min} %`,
    `Incidencias: ${i.incidencias.total} / ${i.incidencias.max} permitidas`,
    `Tasa de respuesta automática: ${tasaTexto}`,
  ];
}

/** El ajuste solo se puede activar con el informe validado de verdad. PURA. */
export function puedeActivar(i: InformeSombra | null): boolean {
  return !!i && i.validado === true;
}

export function AjustesAlcance() {
  const [informe, setInforme] = useState<InformeSombra | null>(null);
  const [cargando, setCargando] = useState(true);
  const [activo, setActivo] = useState(false);
  const [confirma, setConfirma] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/mando/alcance?informe=sombra", { cache: "no-store" });
      const d = (await r.json().catch(() => ({}))) as { informe?: InformeSombra };
      setInforme(d.informe ?? null);
      if (d.informe?.validado) setActivo(false);
      if (!r.ok) setAviso("El informe de sombra no está disponible todavía: el ajuste queda bloqueado.");
    } catch {
      setInforme(null);
      setAviso("La consola local no respondió: el ajuste queda bloqueado.");
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const activar = useCallback(async () => {
    if (confirma.trim() !== "ACTIVAR") { setAviso("Escribe ACTIVAR para confirmar: lo activa una persona, nunca un agente."); return; }
    setOcupado(true); setAviso(null);
    try {
      const r = await fetch("/api/mando/alcance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "automatico", activo: true, confirmacion: confirma.trim() }) });
      if (!r.ok) { setAviso("No se pudo activar: la consola rechazó el cambio."); return; }
      setActivo(true); setConfirma("");
      setAviso("Envío automático inteligente en marcha con los límites del piloto. Cualquier queja, rebote o incidencia lo vuelve a bloquear.");
    } finally { setOcupado(false); }
  }, [confirma]);

  const bloqueado = !puedeActivar(informe);

  return (
    <section aria-label="Ajustes del alcance" className="grid gap-2 rounded-lg border border-cyan-300/20 bg-cyan-400/5 p-3">
      <div className="flex items-center gap-2">
        <input
          type="checkbox" id="alcance-automatico"
          checked={activo} disabled={bloqueado || ocupado}
          onChange={(e) => (e.target.checked ? undefined : setActivo(false))}
          onClick={(e) => { if (!bloqueado && (e.target as HTMLInputElement).checked) { e.preventDefault(); } }}
          className="h-5 w-5 cursor-pointer accent-cyan-300 disabled:cursor-not-allowed"
        />
        <label htmlFor="alcance-automatico" className="cursor-pointer text-xs font-medium text-white/90 disabled:cursor-not-allowed">
          Envío automático inteligente
        </label>
        {cargando ? <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin text-white/60" aria-hidden /> : bloqueado ? <span className="rounded-full border border-amber-300/40 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-100">Validación pendiente</span> : null}
        {activo ? <span className="rounded-full border border-emerald-300/40 bg-emerald-400/10 px-2 py-0.5 text-[11px] text-emerald-100">en marcha (piloto)</span> : null}
      </div>
      {bloqueado && !cargando ? (
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-amber-100">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          El interruptor está apagado y bloqueado: solo Alex puede activarlo tras leer el informe de sombra. Nada se envía mientras duriere la espera.
        </p>
      ) : null}
      {aviso ? <p role="status" className="rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-[11px] text-white/85">{aviso}</p> : null}
      <ul aria-label="Informe de sombra" className="grid gap-0.5 text-[11px] leading-snug text-white/80">
        {lineasInforme(informe).map((l) => <li key={l}>{l}</li>)}
        {!cargando && !informe ? <li className="text-amber-100">Sin informe todavía: sombra 0 de 0 (modo sombra de INV1025Q por pequeña que esté la cola).</li> : null}
      </ul>
      {informe?.piloto ? (
        <p className="text-[11px] leading-snug text-white/70">
          Límites del piloto que el informe propone: {Object.entries(informe.piloto).filter(([, v]) => typeof v === "boolean" ? v : true).map(([k, v]) => `${ETIQUETAS[k] ?? k}: ${typeof v === "boolean" ? "sí" : String(v)}`).join(" · ")}.
        </p>
      ) : null}
      {!bloqueado && !activo ? (
        <form onSubmit={(e) => { e.preventDefault(); void activar(); }} className="grid gap-1.5" aria-label="Activar el envío automático">
          <label htmlFor="alcance-activar" className="text-[11px] font-medium text-cyan-100">
            Escribe ACTIVAR para ponerlo en marcha con los límites del piloto
          </label>
          <input id="alcance-activar" value={confirma} onChange={(e) => setConfirma(e.target.value)} autoComplete="off" className="rounded-lg border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80" />
          <button type="submit" disabled={confirma.trim() !== "ACTIVAR" || ocupado} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-cyan-300/40 bg-cyan-400/10 px-3 text-xs font-medium text-cyan-100 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50">
            {ocupado ? <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden /> : null}
            Activar el piloto
          </button>
        </form>
      ) : null}
    </section>
  );
}
