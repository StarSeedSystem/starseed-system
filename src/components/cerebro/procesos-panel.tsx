"use client";

/**
 * Pilar «Procesos activos» (contrato §7, CB1013N). Lee `leerProcesos()` al
 * montarse y luego cada `intervaloSeg` de las preferencias
 * (usarPreferenciasProcesos de CB1013P), SOLO con la pestaña visible. Arriba
 * van las cuentas reales por tipo como filtros; debajo la lista agrupada por
 * tipo con las acciones que ya existen (abrir Genesis para agentes y restaurar
 * una ventana en segundo plano si el desktop-store lo permite). Luego el
 * hardware (ProcesosHardware, CB1013O) y los ajustes plegables
 * (ProcesosAjustes, CB1013P). Al pie, las fuentes consultadas con ✓/✗ y su
 * motivo, y la hora de la última lectura con el botón «Actualizar». Lo que no
 * se puede medir se dice «sin medida», nunca un 0.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { ETIQUETA_TIPO, type HardwareServidor, type ProcesoActivo, type TipoProceso } from "@/lib/cerebros/procesos";
import { agruparPorTipo } from "@/lib/cerebros/procesos-normalizar";
import { leerProcesos } from "@/lib/cerebros/procesos-fuentes";
import { usarPreferenciasProcesos } from "@/lib/cerebros/procesos-preferencias";
import { ETIQUETA_ESTADO, cuentasPorTipo, partesVentana, procesosSeleccionados } from "@/lib/cerebros/procesos-vista";
import { textoHace } from "@/lib/metagenesis/remoto";
import { readDesktopsSnapshot, setWindowMinimized } from "@/components/desktop/desktop-store";
import { ProcesosHardware } from "./procesos-hardware";
import { ProcesosAjustes } from "./procesos-ajustes";

const BTN = "cursor-pointer whitespace-normal h-auto text-xs rounded-md px-2.5 py-1.5 transition-colors";
type EstadoFuente = { nombre: string; ok: boolean; ms: number; motivo?: string };

/** Acciones existentes: abrir Genesis para un agente y restaurar la ventana
 * minimizada del escritorio si el desktop-store la tiene todavía. */
function AccionProceso(x: { p: ProcesoActivo; alRestaurar: () => void }) {
  const { p, alRestaurar } = x;
  if (p.tipo === "genesis") {
    return (
      <Link href="/genesis" title="Abrir Genesis" className="cursor-pointer text-xs text-cyan-300 underline underline-offset-2">
        Abrir Genesis
      </Link>
    );
  }
  if (p.tipo === "app-fondo") {
    const partes = partesVentana(p.id);
    if (!partes) return null;
    const escritorio = readDesktopsSnapshot().desktops.find((d) => d.id === partes.desktopId);
    if (!escritorio?.windows.some((w) => w.id === partes.winId && w.minimized)) return null;
    return (
      <button type="button"
        onClick={() => { setWindowMinimized(partes.desktopId, partes.winId, false); alRestaurar(); }}
        className={`${BTN} border border-white/15 text-white/80 hover:bg-white/10`}>
        Restaurar ventana
      </button>
    );
  }
  return null;
}

/** Una fila: nombre, estado en palabras, dónde corre, desde cuándo (relativo)
 * y barra de progreso SOLO si el progreso viene medido (no es null). */
function FilaProceso(x: { p: ProcesoActivo; alRestaurar: () => void }) {
  const { p, alRestaurar } = x;
  const desde = p.desde == null ? "sin fecha" : textoHace(Date.now() - p.desde);
  return (
    <li className="rounded-lg border border-white/10 bg-black/20 p-3">
      <p className="break-normal text-sm font-medium text-white/90">{p.nombre}</p>
      <p className="text-xs text-white/60">
        {ETIQUETA_ESTADO[p.estado]} · {p.donde} · desde {desde}
        {p.detalle ? ` · ${p.detalle}` : ""}
      </p>
      {p.progreso != null && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10" role="progressbar"
          aria-valuenow={Math.round(p.progreso * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.max(0, Math.min(1, p.progreso)) * 100}%` }} />
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span className="text-white/45">Fuente: {p.fuente}{p.progreso == null ? " · progreso sin medida" : ""}</span>
        <AccionProceso p={p} alRestaurar={alRestaurar} />
      </div>
    </li>
  );
}

export interface ProcesosPanelProps {
  brainId: string | null;
  brainName?: string;
}

export default function ProcesosPanel({ brainId }: ProcesosPanelProps) {
  const { prefs } = usarPreferenciasProcesos();
  const [procesos, setProcesos] = useState<ProcesoActivo[] | null>(null);
  const [hardware, setHardware] = useState<HardwareServidor[] | null>(null);
  const [fuentes, setFuentes] = useState<EstadoFuente[] | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [ultimaLectura, setUltimaLectura] = useState<number | null>(null);
  const [seleccion, setSeleccion] = useState<TipoProceso[]>([]);
  const [conAjustes, setConAjustes] = useState(false);

  const cargar = useCallback(async () => {
    setLeyendo(true);
    try {
      const r = await leerProcesos();
      setProcesos(r.procesos);
      setHardware(r.hardware);
      setFuentes(r.fuentes);
      setUltimaLectura(Date.now());
    } finally {
      setLeyendo(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  // Lectura periódica según el ajuste de intervalo, SOLO con la pestaña visible.
  useEffect(() => {
    const cron = window.setInterval(() => {
      if (document.visibilityState === "visible") void cargar();
    }, Math.max(5, prefs.intervaloSeg) * 1000);
    return () => window.clearInterval(cron);
  }, [prefs.intervaloSeg, cargar]);

  // Al volver a la pestaña se lee de nuevo.
  useEffect(() => {
    const alCambiar = () => { if (document.visibilityState === "visible") void cargar(); };
    document.addEventListener("visibilitychange", alCambiar);
    return () => document.removeEventListener("visibilitychange", alCambiar);
  }, [cargar]);

  const cuenta = procesos ? cuentasPorTipo(procesos, prefs.tipos) : [];
  const activos = seleccion.length > 0 ? seleccion : cuenta.map((c) => c.tipo);
  const grupos = procesos ? agruparPorTipo(procesosSeleccionados(procesos, activos)) : {};
  const hora = ultimaLectura == null
    ? "sin lectura todavía"
    : new Date(ultimaLectura).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="text-base font-semibold text-white">Procesos activos</h3>
        <span className="text-xs text-white/50">Última lectura {hora}</span>
        <button type="button" onClick={() => void cargar()} disabled={leyendo}
          className={`${BTN} border border-white/15 text-white/85 hover:bg-white/10 disabled:opacity-50`}>
          <RefreshCw className={`mr-1 inline-block size-3.5 ${leyendo ? "animate-spin" : ""}`} aria-hidden="true" />
          Actualizar
        </button>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Cuentas reales por tipo; pulsa para filtrar">
        {cuenta.map((c) => {
          const activo = seleccion.includes(c.tipo);
          return (
            <button key={c.tipo} type="button" aria-pressed={activo}
              onClick={() => setSeleccion((s) => (s.includes(c.tipo) ? s.filter((t) => t !== c.tipo) : [...s, c.tipo]))}
              className={`${BTN} border ${activo ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100" : "border-white/15 text-white/70 hover:bg-white/10"}`}>
              {c.etiqueta} · {c.cuenta}
            </button>
          );
        })}
      </div>

      <section aria-label="Lista de procesos agrupada por tipo" className="space-y-4">
        {procesos === null ? (
          <p className="text-sm text-white/60">Leyendo los procesos activos de todas las fuentes…</p>
        ) : Object.keys(grupos).length === 0 ? (
          <p className="text-sm text-white/60">Ningún proceso activo en los tipos que se enseñan ahora mismo.</p>
        ) : (
          (Object.keys(ETIQUETA_TIPO) as TipoProceso[]).map((tipo) => {
            const delTipo = grupos[tipo];
            if (!delTipo?.length) return null;
            return (
              <div key={tipo} className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-white/50">{ETIQUETA_TIPO[tipo]} · {delTipo.length}</h4>
                <ul className="space-y-2">
                  {delTipo.map((y) => <FilaProceso key={y.id} p={y} alRestaurar={() => void cargar()} />)}
                </ul>
              </div>
            );
          })
        )}
      </section>

      <section aria-label="Hardware de los servidores vinculados" className="space-y-2">
        <h3 className="text-sm font-semibold text-white">Hardware</h3>
        {hardware === null ? (
          <p className="text-sm text-white/60">Midiendo el hardware de los servidores vinculados…</p>
        ) : hardware.length === 0 ? (
          <p className="text-sm text-white/60">Sin medida: ningún servidor o neurona vinculado respondió. La medida de esta Mac solo está disponible en la propia Mac o con sesión de MetaGenesis.</p>
        ) : (
          <ProcesosHardware hardware={hardware} umbrales={prefs.umbrales} ocultos={prefs.ocultos} />
        )}
      </section>

      <section aria-label="Ajustes de los procesos" className="space-y-2">
        <button type="button" aria-expanded={conAjustes} onClick={() => setConAjustes((v) => !v)}
          className={`${BTN} border border-white/15 text-white/85 hover:bg-white/10`}>
          {conAjustes
            ? <ChevronUp className="mr-1 inline-block size-3.5" aria-hidden="true" />
            : <ChevronDown className="mr-1 inline-block size-3.5" aria-hidden="true" />}
          Ajustes de los procesos
        </button>
        {conAjustes && <ProcesosAjustes brainId={brainId} />}
      </section>

      <section aria-label="Fuentes consultadas" className="space-y-2">
        <h3 className="text-sm font-semibold text-white">Fuentes consultadas</h3>
        {fuentes === null ? (
          <p className="text-sm text-white/60">Leyendo fuentes…</p>
        ) : (
          <ul className="space-y-1 text-xs text-white/60">
            {fuentes.map((f) => (
              <li key={f.nombre}>
                {f.ok ? "✓" : "✗"} {f.nombre} · {f.ms} ms
                {!f.ok ? ` —${f.motivo ?? " sin respuesta"}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
