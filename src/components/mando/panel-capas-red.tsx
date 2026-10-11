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
import { Table, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";

/** Forma de la respuesta del API /api/mando/capas. */
interface RespuestaCapas {
  catalogo: Array<{
    id: string;
    version: string;
    estado: "recomendado" | "respaldo" | "nuevo";
    dispositivos: number;
    servidores: number;
    espejos: number;
    banco: string; // último resultado del banco
    aprendizaje: string; // último ciclo de aprendizaje
  }>;
  /** Estado de los espejos (por ejemplo, { ok: true, mensaje: "Todos sincronizados" }) */
  espejos: {
    ok: boolean;
    mensaje: string;
  };
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
              <TableHead>
                <TableRow>
                  <TableCell>Capa</TableCell>
                  <TableCell>Versión</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell>Dispositivos</TableCell>
                  <TableCell>Servidores</TableCell>
                  <TableCell>Espejos</TableCell>
                  <TableCell>Último banco</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {respuesta.catalogo.map((capa) => (
                  <TableRow key={capa.id} data-testid={`capa-${capa.id}`}>
                    <TableCell>{capa.id}</TableCell>
                    <TableCell>{capa.version}</TableCell>
                    <TableCell>
                      {capa.estado === "recomendado" ? (
                        <span className="text-emerald-200">Recomendado</span>
                      ) : capa.estado === "respaldo" ? (
                        <span className="text-amber-200">Respaldo</span>
                      ) : (
                        <span className="text-rose-200">Nuevo en banco</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {capa.dispositivos > 0 ? capa.dispositivos : "sin medir"}
                    </TableCell>
                    <TableCell>
                      {capa.servidores > 0 ? capa.servidores : "sin medir"}
                    </TableCell>
                    <TableCell>
                      {capa.espejos > 0 ? capa.espejos : "sin medir"}
                    </TableCell>
                    <TableCell>{capa.banco || "sin datos"}</TableCell>
                  </TableRow>
                ))}
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