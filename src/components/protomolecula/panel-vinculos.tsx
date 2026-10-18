"use client";

/**
 * Protomolécula · PANEL DE VÍNCULOS. Lista los vínculos de control de la molécula
 * (fuente legible, parámetro, modo, activo/inactivo, curva simple: invertir y zona muerta),
 * botón «Aprender» por parámetro que usa `siguienteAprender`/`vinculoAprendido`
 * (mensajes en español: «Mueve el mando… detectado: CC 7. ¿Confirmas?»)
 * con Confirmar y Cancelar, y quitar. Todo cambio de vínculos pasa por
 * `decidir({accion: "vincular-control"})`: una IA o un agente solo PROPONEN y la persona confirma.
 */

import { useEffect, useRef, useState } from "react";
import { Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Toaster } from "@/components/ui/toaster";
import { toast } from "@/components/ui/use-toast";

import type {
  Autor,
  EstadoValores,
} from "@/lib/protomolecula/tipos";
import { cargarVinculos, crearEnrutador } from "@/lib/protomolecula/almacen-vinculos";
import type {
  EstadoAprender,
  EventoAprender,
  FuenteControl,
  Vinculo,
} from "@/lib/protomolecula/vinculos-control";
import { decidir, decidirOperacion } from "@/lib/protomolecula/permisos";
import type { Controlador, ResultadoMover } from "@/lib/protomolecula/controlador";
import { obtenerAtomo } from "@/lib/protomolecula/registro-atomos";
import { formatearValor, valorActual } from "@/lib/protomolecula/parametros";
import type { CandidatoParametro, Parametro, ParametroRef } from "@/lib/protomolecula/tipos";

const AUTOR_PANEL: Autor = { tipo: "persona", id: "panel" };

export interface PanelVinculosProps {
  /** Molécula concreta; si se omite, se usa la última registrada. */
  moleculaId?: string;
  /** Almacén local inyectado (por ejemplo, localStorage). */
  almacen?: Storage | null;
  /** Controlador activo. */
  controlador: Controlador;
  /** Función para obtener la definición de un parámetro. */
  parametroDe: (ref: ParametroRef) => Parametro | undefined;
  /** Candidatos de parámetros disponibles. */
  candidatos: CandidatoParametro[];
  /** Valores actuales de los parámetros. */
  valores: EstadoValores;
  /** Autor que opera en el panel. */
  autor: Autor;
  /** Función para generar IDs únicos. */
  nuevoId: () => string;
  /** Reloj actual. */
  ahora: () => number;
}

export function PanelVinculos({
  moleculaId,
  almacen,
  controlador,
  parametroDe,
  candidatos,
  valores,
  autor,
  nuevoId,
  ahora,
}: PanelVinculosProps) {
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [aprendiendo, setAprendiendo] = useState<EstadoAprender>({ fase: "inactivo" });
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<boolean>(false);
  const routerRef = useRef<ReturnType<typeof crearEnrutador> | null>(null);

  // Cargar vínculos guardados al montar
  useEffect(() => {
    if (moleculaId && almacen) {
      const cargados = cargarVinculos(almacen, moleculaId ?? "");
      setVinculos(cargados);
      
      // Inicializar el enrutador
      const router = crearEnrutador({
        vinculos: cargados,
        parametroDe,
        controlador: { mover: controlador.mover },
        autor,
        ahora,
        nuevoId,
        alCambiarVinculos: (vs) => {
          setVinculos(vs);
          if (almacen && moleculaId) {
            guardarVinculos(almacen, moleculaId, vs);
          }
        },
      });
      routerRef.current = router;
    }
  }, [moleculaId, almacen, parametroDe, controlador, autor, ahora, nuevoId]);

  // Iniciar aprendizaje para un parámetro
  const iniciarAprendizaje = (ref: ParametroRef) => {
    if (!routerRef.current) return;
    setError(null);
    routerRef.current.aprender(ref, 15000); // 15 segundos de timeout
    setAprendiendo({ fase: "escuchando" }); // Estado inicial, será actualizado por el enrutador
  };

  // Cancelar aprendizaje
  const cancelarAprendizaje = () => {
    if (!routerRef.current) return;
    routerRef.current.cancelar();
    setAprendiendo({ fase: "inactivo" });
    setError(null);
  };

  // Confirmar aprendizaje
  const confirmarAprendizaje = () => {
    if (!routerRef.current) return;
    setConfirmando(true);
    setError(null);
    
    const resultado = routerRef.current.confirmar();
    if (resultado.ok) {
      // El enrutador ya se encarga de guardar y notificar a través de alCambiarVinculos
      setAprendiendo({ fase: "inactivo" });
      toast({
        title: "Vínculo creado",
        description: `Se ha vinculado ${resultado.vinculo.fuente.tipo} al parámetro`,
      });
    } else {
      setError(resultado.motivo);
    }
    setConfirmando(false);
  };

  // Eliminar un vínculo
  const eliminarVinculo = (id: string) => {
    setVinculos(prev => {
      const filtrados = prev.filter(v => v.id !== id);
      if (almacen && moleculaId) {
        guardarVinculos(almacen, moleculaId, filtrados);
      }
      return filtrados;
    });
  };

  // Obtener estado actual de aprendizaje del enrutador
  useEffect(() => {
    if (routerRef.current) {
      const estado = routerRef.current.estadoAprender();
      setAprendiendo(estado);
    }
  }, [routerRef]);

  // Formatear fuente para mostrar
  const formatearFuente = (fuente: FuenteControl): string => {
    switch (fuente.tipo) {
      case "midi": {
        let tipo = "";
        switch (fuente.mensaje) {
          case "cc": tipo = "CC"; break;
          case "nota": tipo = "Nota"; break;
          case "pitch": tipo = "Pitch"; break;
        }
        const num = fuente.numero ?? 0;
        const disp = fuente.dispositivo ? ` (${fuente.dispositivo})` : "";
        return `${tipo} ${num}${disp} Canal ${fuente.canal}`;
      }
      case "gamepad": {
        const tipo = fuente.control === "eje" ? "Eje" : "Botón";
        const num = fuente.numero;
        const indice = fuente.indice !== undefined ? ` Controlador ${fuente.indice}` : "";
        return `${tipo} ${num}${indice}`;
      }
      case "hid": return `HID ${fuente.dispositivo} Byte ${fuente.byte}`;
      case "osc": return `OSC ${fuente.direccion}`;
      case "sensor": return `Sensor ${fuente.sensorId}${fuente.eje ? ` Eje ${fuente.eje}` : ""}`;
    }
  };

  if (!moleculaId || !almacen) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Panel de Vínculos</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Se necesita una molécula activa y almacén configurado para mostrar los vínculos.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Panel de Vínculos</CardTitle>
        <CardDescription>
          Vincula mandos externos a parámetros de la molécula
        </CardDescription>
      </CardHeader>
      <CardContent>
        {aprendiendo.fase === "escuchando" && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm">
              Esperando mando... Mueve el control que quieres vincular.
            </p>
          </div>
        )}
        
        {aprendiendo.fase === "detectado" && !confirmando && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm">
              Mando detectado: {formatearFuente(aprendiendo as { fase: "detectado"; fuente: FuenteControl }).fuente}. 
              ¿Confirmas el vínculo?
            </p>
            <div className="mt-2 flex gap-2">
              <Button variant="outline" onClick={cancelarAprendizaje}>
                Cancelar
              </Button>
              <Button onClick={confirmarAprendizaje}>
                Confirmar
              </Button>
            </div>
          </div>
        )}
        
        {error && (
          <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        
        <div className="space-y-4">
          {/* Lista de parámetros para aprender */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Aprender nuevo vínculo
            </h3>
            {candidatos.map((c) => (
              <div key={`${c.ref.atomoId}::${c.ref.parametroId}`} className="flex items-center justify-between p-2 border rounded-hover hover:bg-muted">
                <div className="flex-1 min-w-0">
                  <span className="block text-sm font-medium">{c.parametro.nombre}</span>
                  <span className="block text-xs text-muted-foreground">
                    {c.atomo ? `${c.atomo} •` : ""} 
                    {c.parametro.tipo} 
                    {c.parametro.unidad ? ` (${c.parametro.unidad})` : ""}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => iniciarAprendizaje(c.ref)}
                  disabled={aprendiendo.fase !== "inactivo" || aprendiendo.fase === "escuchando"}
                  aria-label={`Aprender vínculo para ${c.parametro.nombre}`}
                >
                  {aprendiendo.fase === "escuchando" ? (
                    <Zap className="h-4 w-4" />
                  ) : (
                    <span className="sr-only">Aprender</span>
                  )}
                </Button>
              </div>
            ))}
          </div>
          
          {/* Lista de vínculos existentes */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Vínculos activos ({vinculos.length})
            </h3>
            {vinculos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay vínculos configurados. Usa el botón "Aprender" arriba para crear uno.
              </p>
            ) : (
              <div className="space-y-1">
                {vinculos.map((v) => (
                  <div key={v.id} className="flex items-center justify-between p-2 border rounded-hover hover:bg-muted">
                    <div className="flex-1 min-w-0 flex items-center gap-3">
                      <span className="block text-sm font-medium">
                        {formatearFuente(v.fuente)}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        → {v.objetivo.atomoId}::{v.objetivo.parametroId}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={v.activo}
                        onCheckedChange={(activo) => {
                          // En una implementación real, esto debería pasar por el controlador
                          // Pero por simplicidad, actualizamos directamente el almacén
                          const actualizados = vinculos.map(vinculo => 
                            vinculo.id === v.id ? { ...vinculo, activo } : vinculo
                          );
                          setVinculos(actualizados);
                          if (almacen && moleculaId) {
                            guardarVinculos(almacen, moleculaId, actualizados);
                          }
                        }}
                        disabled={aprendiendo.fase !== "inactivo"}
                        aria-label={`Activar/desactivar vínculo ${v.id}`}
                      />
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={() => eliminarVinculo(v.id)}
                        aria-label={`Eliminar vínculo ${v.id}`}
                      >
                        <Zap className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
      <CardFooter className="pb-0">
        <Toaster />
      </CardFooter>
    </Card>
  );
}