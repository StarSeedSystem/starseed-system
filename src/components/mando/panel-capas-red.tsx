"use client";

/**
 * Panel de capas de Genesis (Ola K2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Muestra el catálogo de capas, su estado, dispositivos, espejos, banco y aprendizaje.
 * También muestra la última noche de automejora y las propuestas pendientes.
 *
 * Solo tiene sentido en local: las rutas `/api/mando/*` responden 404 en el
 * despliegue público. Si eso ocurre, el aviso lo dice claro.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert, Clock, Send, Trash2, FileText, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";
import type { CapaNueva, FilaCapaRed, UltimoBanco } from "@/lib/mando/capas-red";

/** Forma REAL de la respuesta de GET /api/mando/capas (sin `catalogo` ni `espejos`). */
interface RespuestaCapas {
  filas: FilaCapaRed[];
  nuevas?: CapaNueva[];
  actualizado?: string | null;
  /** Última noche de automejora */
  ultimaNoche: {
    fecha: string;
    traido: number;
    motivo: string;
    directivas: Array<{
      capa: string;
      version: number | null;
      estado: string;
    }>;
    propuestas: Array<{
      id: string;
      capa: string;
      description: string;
      archivos: string[];
      prompt_inicio: string;
      referencia_funcion: string;
      enviada?: boolean;
    }>;
    errores?: Array<{ capa: string; motivo: string }>;
    sin_juez?: Array<{ capa: string; motivo: string }>;
    aplicadas?: Array<{ capa: string; version: number | null; estado: string }>;
  } | null;
  /** Propuestas de automejora por archivo de fecha */
  propuestas: Array<{
    fecha: string;
    origen: string;
    propuestas: Array<{
      id: string;
      capa: string;
      description: string;
      archivos: string[];
      prompt_inicio: string;
      referencia_funcion: string;
      enviada?: boolean;
    }>;
  }>;
}

interface PropuestaItem {
  archivo: string;
  fecha: string;
  id: string;
  capa: string;
  description: string;
  archivos: string[];
  prompt_inicio: string;
  referencia_funcion: string;
  enviada: boolean;
}

/** Resume el estado de los espejos a partir de las filas reales, sin inventar nada. */
export function resumenEspejos(filas: FilaCapaRed[]): { ok: boolean; mensaje: string } {
  if (filas.length === 0) return { ok: false, mensaje: "Sin catálogo de capas" };
  const sinEspejo = filas.filter((f) => f.espejos <= 0);
  if (sinEspejo.length === 0) {
    return { ok: true, mensaje: `Las ${filas.length} capas tienen al menos un espejo` };
  }
  const ids = sinEspejo.slice(0, 5).map((f) => f.id).join(", ");
  return {
    ok: false,
    mensaje: `${sinEspejo.length} de ${filas.length} capas sin espejo: ${ids}`,
  };
}

function textoEstado(estado: string): { texto: string; clase: string } {
  if (estado === "recomendado") return { texto: "Recomendado", clase: "text-emerald-200" };
  if (estado === "respaldo") return { texto: "Respaldo", clase: "text-amber-200" };
  if (estado === "en-banco") return { texto: "Nuevo en banco", clase: "text-rose-200" };
  return { texto: estado, clase: "text-white/70" };
}

function textoBanco(banco: UltimoBanco | null): string {
  if (!banco) return "sin datos";
  const partes: string[] = [];
  if (banco.tokS !== null) partes.push(`${banco.tokS} tok/s`);
  if (banco.latenciaMs !== null) partes.push(`${banco.latenciaMs} ms`);
  return partes.length > 0 ? partes.join(" · ") : "sin datos";
}

/** Componente principal del panel. */
export function PanelCapasRed() {
  const [cargando, setCargando] = useState(true);
  const [soloLocal, setSoloLocal] = useState(false);
  const [respuesta, setRespuesta] = useState<RespuestaCapas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [propuestasAplanadas, setPropuestasAplanadas] = useState<PropuestaItem[]>([]);

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
      // Aplanar propuestas para la tabla
      const aplanadas: PropuestaItem[] = [];
      for (const pa of datos.propuestas ?? []) {
        for (const p of pa.propuestas ?? []) {
          aplanadas.push({ archivo: pa.fecha + ".json", fecha: pa.fecha, ...p, enviada: p.enviada ?? false });
        }
      }
      setPropuestasAplanadas(aplanadas);
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

  const mandarPropuesta = useCallback(async (archivo: string, id: string) => {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch("/api/mando/capas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "mandar-propuesta", archivo, id }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Error desconocido" }));
        setError(err.error ?? `No se pudo mandar la propuesta (HTTP ${r.status}).`);
        return;
      }
      void cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setCargando(false);
    }
  }, [cargar]);

  const descartarPropuesta = useCallback(async (archivo: string, id: string) => {
    if (!confirm("¿Descartar esta propuesta de automejora? No se puede deshacer.")) return;
    setCargando(true);
    setError(null);
    try {
      const r = await fetch("/api/mando/capas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "descartar", archivo, id }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Error desconocido" }));
        setError(err.error ?? `No se pudo descartar la propuesta (HTTP ${r.status}).`);
        return;
      }
      void cargar();
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

  const espejos = resumenEspejos(respuesta.filas ?? []);

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

      {/* Última noche de automejora */}
      {respuesta.ultimaNoche && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Última noche de automejora
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm text-white/70">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden />
                <strong>Fecha:</strong> {respuesta.ultimaNoche.fecha}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden />
                <strong>Traída:</strong> {new Date(respuesta.ultimaNoche.traido).toLocaleString()}
              </span>
              <span className="flex items-center gap-1">
                <strong>Motivo:</strong> {respuesta.ultimaNoche.motivo}
              </span>
            </div>

            {respuesta.ultimaNoche.directivas.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-white/80 mb-2">Directivas propuestas</h4>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {respuesta.ultimaNoche.directivas.map((d, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm"
                    >
                      <p className="font-medium text-white">{d.capa}</p>
                      <p className="text-white/60">v{d.version ?? "—"} · {d.estado}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {respuesta.ultimaNoche.aplicadas && respuesta.ultimaNoche.aplicadas.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-white/80 mb-2">Aplicadas por el juez</h4>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {respuesta.ultimaNoche.aplicadas.map((a, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm"
                    >
                      <p className="font-medium text-emerald-200">{a.capa}</p>
                      <p className="text-white/60">v{a.version ?? "—"} · {a.estado}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(respuesta.ultimaNoche.errores?.length ?? 0) > 0 && (
              <div>
                <h4 className="text-sm font-medium text-rose-200 mb-2">Errores</h4>
                <ul className="space-y-1 text-sm text-rose-200">
                  {respuesta.ultimaNoche.errores!.map((e, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      <span>{e.capa}: {e.motivo}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(respuesta.ultimaNoche.sin_juez?.length ?? 0) > 0 && (
              <div>
                <h4 className="text-sm font-medium text-amber-200 mb-2">Sin juez</h4>
                <ul className="space-y-1 text-sm text-amber-200">
                  {respuesta.ultimaNoche.sin_juez!.map((s, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      <span>{s.capa}: {s.motivo}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Propuestas de automejora pendientes */}
      {propuestasAplanadas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Propuestas de automejora pendientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>Capa</TableCell>
                    <TableCell className="max-w-[300px]">Descripción</TableCell>
                    <TableCell>Archivos</TableCell>
                    <TableCell>Función ref.</TableCell>
                    <TableCell>Estado</TableCell>
                    <TableCell className="w-[160px]">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {propuestasAplanadas.map((p) => (
                    <TableRow key={p.id} data-testid={`propuesta-${p.id}`}>
                      <TableCell className="font-mono text-xs">{p.id}</TableCell>
                      <TableCell>{p.capa}</TableCell>
                      <TableCell className="max-w-[300px] truncate">{p.description}</TableCell>
                      <TableCell className="text-xs font-mono">
                        {p.archivos.join(", ") || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.referencia_funcion || "—"}</TableCell>
                      <TableCell>
                        {p.enviada ? (
                          <span className="inline-flex items-center gap-1 text-emerald-200 text-xs">
                            <CheckCircle2 className="h-3 w-3" aria-hidden />
                            Enviada al enjambre
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-200 text-xs">
                            <Clock className="h-3 w-3" aria-hidden />
                            Pendiente
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {!p.enviada && (
                            <Button
                              type="button"
                              variant="default"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => void mandarPropuesta(p.archivo, p.id)}
                              disabled={cargando}
                              title="Mandar al enjambre"
                            >
                              <Send className="h-4 w-4" aria-hidden />
                            </Button>
                          )}
                          {!p.enviada && (
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => void descartarPropuesta(p.archivo, p.id)}
                              disabled={cargando}
                              title="Descartar"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </Button>
                          )}
                          {p.enviada && (
                            <span className="text-xs text-white/50">Enviada</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {propuestasAplanadas.length === 0 && respuesta.ultimaNoche && (
        <Card>
          <CardContent className="py-6 text-center">
            <FileText className="h-8 w-8 mx-auto text-white/30 mb-2" />
            <p className="text-sm text-white/60">
              No hay propuestas de automejora pendientes.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Catálogo de capas */}
      <Card>
        <CardHeader>
          <CardTitle>Catálogo de capas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Capa</TableCell>
                  <TableCell>Versión</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell>SHA</TableCell>
                  <TableCell>Dispositivos</TableCell>
                  <TableCell>Servidores</TableCell>
                  <TableCell>Espejos</TableCell>
                  <TableCell>Último banco</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(respuesta.filas ?? []).map((capa) => {
                  const estado = textoEstado(capa.estado);
                  return (
                    <TableRow key={capa.id} data-testid={`capa-${capa.id}`}>
                      <TableCell>{capa.id}</TableCell>
                      <TableCell>{capa.version ?? "—"}</TableCell>
                      <TableCell>
                        <span className={estado.clase}>{estado.texto}</span>
                      </TableCell>
                      <TableCell>
                        {capa.shaVerificado ? "verificado" : "sin SHA"}
                      </TableCell>
                      <TableCell>
                        {capa.dispositivos === null ? "sin medir" : capa.dispositivos}
                      </TableCell>
                      <TableCell>
                        {capa.servidores === null ? "sin medir" : capa.servidores}
                      </TableCell>
                      <TableCell>
                        {capa.espejos > 0 ? capa.espejos : "sin espejo"}
                      </TableCell>
                      <TableCell>{textoBanco(capa.banco)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Estado de los espejos */}
      <Card>
        <CardHeader>
          <CardTitle>Estado de los espejos</CardTitle>
        </CardHeader>
          <CardContent>
            <p data-testid="espejos-mensaje" className="text-sm text-white/70">
              {espejos.mensaje}
            </p>
            {espejos.ok ? (
              <span className="inline-flex items-center gap-1 text-emerald-200 text-xs">
                <CheckCircle2 className="h-3 w-3" aria-hidden />
                Con espejo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-rose-200 text-xs">
                <AlertTriangle className="h-3 w-3" aria-hidden />
                Faltan espejos
              </span>
            )}
          </CardContent>
      </Card>

      {/* Nota sobre el aprendizaje por ámbito */}
      <Card>
        <CardHeader>
          <CardTitle>Aprendizaje por ámbito</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-white/70">
            Los ciclos de aprendizaje por ámbito se muestran en el detalle de cada capa.
            Consulte el banco de pruebas para validar nuevos adaptadores.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}