"use client";

/**
 * Pilar «Procesos activos» (CB1013N · §7). Lee las fuentes reales con
 * `leerProcesos()` y las agrupa por tipo. Cada número sale de una medida con
 * su fuente; lo que no se puede medir dice «sin medida» y nunca un 0 inventado.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ETIQUETA_TIPO,
  type EstadoProceso,
  type HardwareServidor,
  type ProcesoActivo,
  type TipoProceso,
} from "@/lib/cerebros/procesos";
import { agruparPorTipo } from "@/lib/cerebros/procesos-normalizar";
import { leerProcesos } from "@/lib/cerebros/procesos-fuentes";
import { usarPreferenciasProcesos } from "@/lib/cerebros/procesos-preferencias";
import { usePresenciaNeuronas } from "@/lib/neurons/presencia";
import { useEstadoActualizaciones } from "@/components/actualizaciones/use-estado-actualizaciones";
import { textoHace } from "@/lib/metagenesis/remoto";
import { readDesktopsSnapshot, setWindowMinimized } from "@/components/desktop/desktop-store";
import { ProcesosHardware } from "./procesos-hardware";
import { ProcesosAjustes } from "./procesos-ajustes";

const ETIQUETA_ESTADO: Record<EstadoProceso, string> = {
  "en-marcha": "en marcha",
  esperando: "esperando",
  pausado: "pausado",
  fallando: "fallando",
};

const TIPOS = Object.keys(ETIQUETA_TIPO) as TipoProceso[];

type FiltroTipo = TipoProceso | "todos";

interface FuenteLeida {
  nombre: string;
  ok: boolean;
  ms: number;
  motivo?: string;
}

interface Lectura {
  procesos: ProcesoActivo[];
  hardware: HardwareServidor[];
  fuentes: FuenteLeida[];
  cuando: number;
}

export interface ProcesosPanelProps {
  brainId: string | null;
  brainName?: string;
}

function tiposVisibles(tipos: TipoProceso[]): TipoProceso[] {
  if (tipos.length === 0) return TIPOS;
  return TIPOS.filter((tipo) => tipos.includes(tipo));
}

function ventanaDe(proceso: ProcesoActivo): { desktopId: string; ventanaId: string } | null {
  if (proceso.tipo !== "app-fondo" || !proceso.id.startsWith("ventana:")) return null;
  const resto = proceso.id.slice("ventana:".length);
  const corte = resto.lastIndexOf(":");
  if (corte <= 0 || corte === resto.length - 1) return null;
  return { desktopId: resto.slice(0, corte), ventanaId: resto.slice(corte + 1) };
}

function puedeRestaurar(proceso: ProcesoActivo): boolean {
  const ref = ventanaDe(proceso);
  if (!ref) return false;
  const escritorio = readDesktopsSnapshot().desktops.find((d) => d.id === ref.desktopId);
  return Boolean(escritorio?.windows.some((w) => w.id === ref.ventanaId && w.minimized));
}

function textoProgreso(progreso: number): string {
  return `${Math.round(progreso * 100)} %`;
}

function FilaProceso({
  proceso,
  montado,
  onRestaurar,
}: {
  proceso: ProcesoActivo;
  montado: boolean;
  onRestaurar: (desktopId: string, ventanaId: string) => void;
}) {
  const desde = proceso.desde === null ? null : textoHace(Date.now() - proceso.desde);
  const progreso =
    proceso.progreso === null ? null : Math.min(1, Math.max(0, proceso.progreso));
  const ventana = montado && puedeRestaurar(proceso) ? ventanaDe(proceso) : null;

  return (
    <li className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium text-white/90">{proceso.nombre}</p>
          <p className="mt-1 break-words text-xs text-white/60">
            {ETIQUETA_ESTADO[proceso.estado]} · {proceso.donde}
            {desde ? ` · ${desde}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {proceso.tipo === "genesis" && (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-auto cursor-pointer whitespace-normal text-xs"
            >
              <Link href="/genesis">Abrir Genesis</Link>
            </Button>
          )}
          {ventana && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-auto cursor-pointer whitespace-normal text-xs"
              onClick={() => onRestaurar(ventana.desktopId, ventana.ventanaId)}
            >
              Restaurar ventana
            </Button>
          )}
        </div>
      </div>

      {progreso !== null && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-[11px] text-white/50">
            <span>Progreso</span>
            <span>{textoProgreso(progreso)}</span>
          </div>
          <div
            role="progressbar"
            aria-label={`Progreso de ${proceso.nombre}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progreso * 100)}
            className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"
          >
            <div
              className="h-full rounded-full bg-cyan-400/80"
              style={{ width: `${Math.round(progreso * 100)}%` }}
            />
          </div>
        </div>
      )}

      {proceso.detalle && (
        <p className="mt-1 break-words text-[11px] text-white/45">{proceso.detalle}</p>
      )}
      <p className="mt-1 break-words text-[11px] text-white/35">Fuente: {proceso.fuente}</p>
    </li>
  );
}

export default function ProcesosPanel({ brainId, brainName }: ProcesosPanelProps) {
  const { prefs } = usarPreferenciasProcesos();
  const presencia = usePresenciaNeuronas();
  const actualizaciones = useEstadoActualizaciones();

  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [montado, setMontado] = useState(false);
  const [filtro, setFiltro] = useState<FiltroTipo>("todos");
  const [ajustesAbiertos, setAjustesAbiertos] = useState(false);

  const vivo = useRef(true);
  const enCurso = useRef(false);
  const contexto = useRef<{ presencia: unknown; atrasos: unknown }>({
    presencia,
    atrasos: actualizaciones.atrasos,
  });
  contexto.current = { presencia, atrasos: actualizaciones.atrasos };

  useEffect(() => {
    vivo.current = true;
    setMontado(true);
    return () => {
      vivo.current = false;
    };
  }, []);

  const cargar = useCallback(async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    setLeyendo(true);
    try {
      const r = await leerProcesos(contexto.current);
      if (!vivo.current) return;
      setLectura({ ...r, cuando: Date.now() });
      setError(null);
    } catch (e) {
      if (!vivo.current) return;
      setError(e instanceof Error ? e.message : "No se pudo leer ahora mismo.");
    } finally {
      if (vivo.current) setLeyendo(false);
      enCurso.current = false;
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    let temporizador: ReturnType<typeof setInterval> | null = null;
    const arrancar = () => {
      if (temporizador !== null) return;
      temporizador = setInterval(() => {
        if (document.visibilityState === "visible") void cargar();
      }, prefs.intervaloSeg * 1000);
    };
    const parar = () => {
      if (temporizador === null) return;
      clearInterval(temporizador);
      temporizador = null;
    };
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === "visible") {
        void cargar();
        arrancar();
      } else {
        parar();
      }
    };
    if (document.visibilityState === "visible") arrancar();
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    return () => {
      parar();
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
    };
  }, [prefs.intervaloSeg, cargar]);

  const restaurar = useCallback(
    (desktopId: string, ventanaId: string) => {
      setWindowMinimized(desktopId, ventanaId, false);
      void cargar();
    },
    [cargar],
  );

  const visibles = useMemo(() => tiposVisibles(prefs.tipos), [prefs.tipos]);
  const grupos = useMemo(
    () => (lectura ? agruparPorTipo(lectura.procesos) : {}),
    [lectura],
  );
  const cuentas = useMemo(() => {
    const base = {} as Record<TipoProceso, number>;
    for (const tipo of TIPOS) base[tipo] = grupos[tipo]?.length ?? 0;
    return base;
  }, [grupos]);
  const filtroEfectivo: FiltroTipo = filtro !== "todos" && !visibles.includes(filtro) ? "todos" : filtro;
  const totalVisible = visibles.reduce((suma, tipo) => suma + cuentas[tipo], 0);
  const aMostrar = lectura
    ? lectura.procesos.filter(
        (proceso) =>
          visibles.includes(proceso.tipo) &&
          (filtroEfectivo === "todos" || proceso.tipo === filtroEfectivo),
      )
    : [];
  const gruposAMostrar = visibles.filter((tipo) =>
    aMostrar.some((proceso) => proceso.tipo === tipo),
  );
  const hora = lectura
    ? new Date(lectura.cuando).toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "sin lectura";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-white">Procesos activos</h3>
          <p className="mt-1 break-words text-xs text-white/50">
            Procesos de toda la cuenta
            {brainName ? ` · cerebro activo: ${brainName}` : ""}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-white/45">Última lectura: {hora}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-auto cursor-pointer whitespace-normal text-xs"
            onClick={() => void cargar()}
            disabled={leyendo}
            aria-busy={leyendo}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", leyendo && "animate-spin")} />
            Actualizar
          </Button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200"
        >
          {error}
        </p>
      )}

      <section aria-label="Cuenta de procesos por tipo" className="space-y-2">
        <div
          role="group"
          aria-label="Filtrar procesos por tipo"
          className="flex flex-wrap gap-1.5"
        >
          <button
            type="button"
            aria-pressed={filtroEfectivo === "todos"}
            onClick={() => setFiltro("todos")}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
              filtroEfectivo === "todos"
                ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100"
                : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06]",
            )}
          >
            Todos <span className="font-mono text-[11px] opacity-80">{totalVisible}</span>
          </button>
          {visibles.map((tipo) => (
            <button
              key={tipo}
              type="button"
              aria-pressed={filtroEfectivo === tipo}
              onClick={() => setFiltro(tipo)}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                filtroEfectivo === tipo
                  ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100"
                  : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06]",
              )}
            >
              {ETIQUETA_TIPO[tipo]}{" "}
              <span className="font-mono text-[11px] opacity-80">{cuentas[tipo]}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-white/40">
          Cuentas medidas en la última lectura; pulsa un tipo para filtrar la lista.
        </p>
      </section>

      <section aria-label="Procesos activos agrupados por tipo" className="space-y-4">
        {lectura === null ? (
          <p className="text-sm text-white/60">Leyendo los procesos activos de todas las fuentes…</p>
        ) : lectura.procesos.length === 0 ? (
          <p className="text-sm text-white/60">
            Ninguna fuente informó de procesos activos ahora mismo.
          </p>
        ) : aMostrar.length === 0 ? (
          <p className="text-sm text-white/60">
            No hay procesos de este tipo en la última lectura.
          </p>
        ) : (
          <div className="space-y-4">
            {gruposAMostrar.map((tipo) => (
              <div key={tipo} className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-white/50">
                  {ETIQUETA_TIPO[tipo]} · {grupos[tipo]?.length ?? 0}
                </h4>
                <ul className="space-y-2">
                  {(grupos[tipo] ?? [])
                    .filter((proceso) => filtroEfectivo === "todos" || proceso.tipo === filtroEfectivo)
                    .map((proceso) => (
                      <FilaProceso
                        key={proceso.id}
                        proceso={proceso}
                        montado={montado}
                        onRestaurar={restaurar}
                      />
                    ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-label="Hardware de los servidores vinculados" className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-white/50">Hardware</h4>
        {lectura === null ? (
          <p className="text-sm text-white/60">Midiendo el hardware de los servidores vinculados…</p>
        ) : lectura.hardware.length === 0 ? (
          <p className="text-sm text-white/60">
            Sin medida: ningún servidor o neurona vinculado respondió. La medida de esta Mac solo
            está disponible en la propia Mac o con sesión de MetaGenesis.
          </p>
        ) : (
          <ProcesosHardware
            hardware={lectura.hardware}
            umbrales={prefs.umbrales}
            ocultos={prefs.ocultos}
          />
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
        <button
          type="button"
          aria-expanded={ajustesAbiertos}
          onClick={() => setAjustesAbiertos((abierto) => !abierto)}
          className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
        >
          <span className="text-xs font-semibold text-white/85">Ajustes de procesos</span>
          <span className="text-[11px] text-white/40">tipos, intervalo y umbrales</span>
          <ChevronDown
            className={cn(
              "ml-auto h-4 w-4 text-white/40 transition-transform",
              ajustesAbiertos && "rotate-180",
            )}
          />
        </button>
        {ajustesAbiertos && (
          <div className="border-t border-white/5 px-3 pb-3 pt-3">
            <ProcesosAjustes brainId={brainId} />
          </div>
        )}
      </section>

      <section
        aria-label="Fuentes consultadas"
        className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-white/55">
            Fuentes consultadas
          </h4>
          {lectura && (
            <span className="text-[11px] text-white/45">
              {lectura.fuentes.filter((f) => f.ok).length} de {lectura.fuentes.length} respondieron
            </span>
          )}
        </div>
        {lectura === null ? (
          <p className="text-[11px] text-white/45">Todavía sin lectura.</p>
        ) : (
          <ul className="grid gap-1 sm:grid-cols-2">
            {lectura.fuentes.map((fuente) => (
              <li key={fuente.nombre} className="flex items-start gap-1.5 text-[11px]">
                <span
                  aria-hidden="true"
                  className={fuente.ok ? "text-emerald-300" : "text-red-300"}
                >
                  {fuente.ok ? "✓" : "✗"}
                </span>
                <span className="break-words text-white/60">
                  <span className="text-white/80">{fuente.nombre}</span>
                  {` · ${fuente.ms} ms`}
                  {fuente.ok ? "" : ` · ${fuente.motivo?.trim() || "sin respuesta"}`}
                  <span className="sr-only">{fuente.ok ? " disponible" : " no disponible"}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-white/40">
          Las fuentes locales (/api/mando) solo responden en la Mac o con sesión de MetaGenesis;
          fuera de ella se muestran como «no disponible aquí».
        </p>
      </section>
    </div>
  );
}
