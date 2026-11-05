"use client";

/**
 * Panel de capas de Genesis (Ola ???)
 * ─────────────────────────────────────────────────────────────────────────────
 * Muestra el catálogo de capas, su estado, dispositivos, espejos, banco y aprendizaje.
 * 
 * Solo tiene sentido en local: las rutas `/api/mando/*` responden 404 en el
 * despliegue público. Si eso ocurre, el aviso lo dice claro.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { NocheAutomejora } from "@/lib/astraura/capas/automejora";
import type { PropuestaAutomejora } from "@/lib/mando/propuestas-automejora";

interface BancoVista { tokS?: number | null; latenciaMs?: number | null; acierto?: number | null; fecha?: string | null }
interface FilaCapa {
  id: string; version?: string | null; estado?: string; dispositivos?: number | null;
  servidores?: number | null; espejos?: number | string[] | null; banco?: string | BancoVista | null;
}

/** Forma de la respuesta del API /api/mando/capas (tolera también la vieja). */
interface RespuestaCapas {
  filas?: FilaCapa[]; catalogo?: FilaCapa[];
  nuevas?: Array<{ repo: string; estado?: string | null; lastModified?: string | null }>;
  actualizado?: string | null; noche?: NocheAutomejora | null; propuestas?: PropuestaAutomejora[];
  espejos?: { ok: boolean; mensaje: string };
}

const filasDe = (r: RespuestaCapas): FilaCapa[] => r.filas ?? r.catalogo ?? [];

const estadoLegible = (estado: string | undefined): string =>
  estado === "recomendado" ? "Recomendado" : estado === "respaldo" ? "Respaldo"
    : estado === "nuevo" || estado === "en-banco" ? "Nuevo en banco" : estado ?? "desconocido";

const numeroLegible = (v: number | null | undefined): string | number =>
  typeof v === "number" && v > 0 ? v : "sin medir";

const espejosLegibles = (v: number | string[] | null | undefined): string | number =>
  Array.isArray(v) ? (v.length > 0 ? v.length : "sin medir") : numeroLegible(v);

function bancoLegible(banco: string | BancoVista | null | undefined): string {
  if (typeof banco === "string") return banco || "sin datos";
  if (!banco) return "sin datos";
  const partes = [
    typeof banco.tokS === "number" ? `${banco.tokS} tok/s` : "",
    typeof banco.latenciaMs === "number" ? `${banco.latenciaMs} ms` : "",
    typeof banco.acierto === "number" ? `${Math.round(banco.acierto * 100)} % acierto` : "",
    banco.fecha ?? "",
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : "sin datos";
}

/** Componente principal del panel. */
export function PanelCapasRed() {
  const [cargando, setCargando] = useState(true);
  const [soloLocal, setSoloLocal] = useState(false);
  const [respuesta, setRespuesta] = useState<RespuestaCapas | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch("/api/mando/capas", { cache: "no-store" });
      if (!r.ok) {
        if (r.status === 404) {
          setSoloLocal(true);
        } else {
          setError(`No se pudo leer el estado de las capas (HTTP ${r.status}).`);
        }
        return;
      }
      const datos = (await r.json()) as RespuestaCapas;
      setRespuesta(datos);
    } catch {
      setSoloLocal(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const acciones = useCallback(async (accion: "comprobar" | "banco") => {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch("/api/mando/capas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion }),
      });
      if (!r.ok) {
        setError(`No se pudo realizar la acción (HTTP ${r.status}).`);
        return;
      }
      // Recargar los datos después de la acción
      void cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setCargando(false);
    }
  }, [cargar]);

  const accionPropuesta = useCallback(async (accion: "mandar-propuesta" | "descartar-propuesta", archivo: string, id: string) => {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch("/api/mando/capas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion, archivo, id }) });
      if (!r.ok) {
        setError(accion === "mandar-propuesta" ? `No se pudo mandar la propuesta (HTTP ${r.status}).` : `No se pudo descartar la propuesta (HTTP ${r.status}).`);
        return;
      }
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setCargando(false);
    }
  }, [cargar]);

  if (cargando) {
    return (
      <div className="flex items-center gap-2 text-sm text-white/60">
        <Loader2 className="h-4 w-4 animate-spin" />
        Leyendo el estado de las capas…
      </div>
    );
  }

  if (soloLocal) {
    return (
      <div className="space-y-4">
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100"
        >
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>
            El panel de capas solo funciona en tu máquina (las rutas
            <code>/api/mando/*</code> están apagadas en el despliegue público).
          </p>
        </div>
      </div>
    );
  }

  if (error || !respuesta) {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200"
      >
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <p>{error ?? "No se pudo cargar el estado de las capas."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            <CheckCircle2 className="h-4 w-4" />
            Capas autoadaptables
          </h2>
          <p className="mt-0.5 text-xs text-white/50">
            Estado actual del catálogo de capas de Astraura
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void acciones("comprobar")}
            disabled={cargando}
          >
            Comprobar versiones
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void acciones("banco")}
            disabled={cargando}
          >
            Correr banco
          </Button>
        </div>
      </header>

      {/* Catálogo de capas */}
      <Card>
        <CardHeader>
          <CardTitle>Catálogo de capas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Capa</TableHead>
                  <TableHead>Versión</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Dispositivos</TableHead>
                  <TableHead>Servidores</TableHead>
                  <TableHead>Espejos</TableHead>
                  <TableHead>Último banco</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filasDe(respuesta).map((capa) => (
                  <TableRow key={capa.id} data-testid={`capa-${capa.id}`}>
                    <TableCell>{capa.id}</TableCell>
                    <TableCell>{capa.version ?? "sin versión"}</TableCell>
                    <TableCell>
                      {capa.estado === "recomendado" ? (
                        <span className="text-emerald-200">Recomendado</span>
                      ) : capa.estado === "respaldo" ? (
                        <span className="text-amber-200">Respaldo</span>
                      ) : (
                        <span className="text-rose-200">{estadoLegible(capa.estado)}</span>
                      )}
                    </TableCell>
                    <TableCell>{numeroLegible(capa.dispositivos)}</TableCell>
                    <TableCell>{numeroLegible(capa.servidores)}</TableCell>
                    <TableCell>{espejosLegibles(capa.espejos)}</TableCell>
                    <TableCell>{bancoLegible(capa.banco)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {respuesta.espejos && (
        <Card>
          <CardHeader>
            <CardTitle>Estado de los espejos</CardTitle>
          </CardHeader>
          <CardContent>
            <p data-testid="espejos-mensaje" className="text-sm text-white/70">
              {respuesta.espejos.mensaje}
            </p>
            {respuesta.espejos.ok ? (
              <span className="inline-flex items-center gap-1 text-emerald-200 text-xs">
                <CheckCircle2 className="h-3 w-3" aria-hidden />
                Todos los espejos están sincronizados
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-rose-200 text-xs">
                <AlertTriangle className="h-3 w-3" aria-hidden />
                Hay espejos desincronizados
              </span>
            )}
          </CardContent>
        </Card>
      )}

      <Card data-testid="ultima-noche">
        <CardHeader><CardTitle>Última noche</CardTitle></CardHeader>
        <CardContent>
          {respuesta.noche ? (
            <div className="flex flex-col gap-1 text-sm text-white/70">
              <span>{respuesta.noche.fecha}{respuesta.noche.donde ? ` · corrió en ${respuesta.noche.donde}` : ""}{` · ${respuesta.noche.llamadas} llamadas`}</span>
              {respuesta.noche.propuso && <span className="italic text-white/60">Propuso: «{respuesta.noche.propuso}»</span>}
              <span>Juez: aprobó {respuesta.noche.aprobadas} de {respuesta.noche.propuestas} pautas{respuesta.noche.tareas > 0 ? ` · ${respuesta.noche.tareas} tareas de código al enjambre` : ""}</span>
            </div>
          ) : <p className="text-sm text-white/60">Aún no ha corrido.</p>}
        </CardContent>
      </Card>

      <Card data-testid="propuestas-automejora">
        <CardHeader><CardTitle>Propuestas de la automejora</CardTitle></CardHeader>
        <CardContent>
          {(respuesta.propuestas ?? []).length === 0 ? (
            <p className="text-sm text-white/60">No hay propuestas pendientes.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {(respuesta.propuestas ?? []).map((p) => (
                <li key={`${p.archivo}-${p.id}`} data-testid={`propuesta-${p.id}`} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-white/10 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white">{p.titulo}</p>
                    <p className="text-xs text-white/50">{p.capa} · {p.fecha ?? "sin fecha"}{p.enviada ? " · enviada al enjambre" : p.descartada ? " · descartada" : ""}</p>
                    {p.descripcion && <p className="mt-1 text-xs text-white/70">{p.descripcion}</p>}
                    {p.archivos.length > 0 && <p className="mt-1 break-all text-xs text-white/40">{p.archivos.join(" · ")}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" size="sm" onClick={() => void accionPropuesta("mandar-propuesta", p.archivo, p.id)} disabled={cargando || p.enviada || p.descartada}>Mandar al enjambre</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => void accionPropuesta("descartar-propuesta", p.archivo, p.id)} disabled={cargando || p.enviada || p.descartada}>Descartar</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}