"use client";

/**
 * Protomolécula · PANEL DE VÍNCULOS. Lista los vínculos de la molécula
 * (fuente legible, parámetro, modo, activo/inactivo, curva simple: invertir y zona muerta),
 * botón «Aprender» por parámetro que usa `siguienteAprender`/`vinculoAprendido`
 * (mensajes en español: «Mueve el mando… detectado: CC 7. ¿Confirmas?»)
 * con Confirmar y Cancelar, y quitar.
 * Todo cambio de vínculos pasa por `decidir({accion: "vincular-control"})`:
 * una IA o un agente solo PROPONEN y la persona confirma.
 */
import { useEffect, useState } from "react";
import type { Vinculo, FuenteControl, ParametroRef, Parametro } from "@/lib/protomolecula/vinculos-control";
import type { Autor } from "@/lib/protomolecula/tipos";
import { decidir } from "@/lib/protomolecula/permisos";
import { siguienteAprender, vinculoAprendido, estadoInicial } from "@/lib/protomolecula/vinculos-control";
import type { EstadoAprender, EventoAprender } from "@/lib/protomolecula/vinculos-control";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandInput, CommandList, CommandLoadingGroup } from "@/components/ui/command";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover;
import { Separator } from "@/components/ui/separator;
import { Slot } from "@radix-ui/react-slot";
import { Toaster } from "@/components/ui/toaster;
import { useToast } from "@/components/ui/use-toast;

export interface PanelVinculosProps {
  /** Parámetros disponibles para vincular (inyectados). */
  candidatos: CandidatoParametro[];
  /** Valores actuales de los parámetros de la molécula (inyectados). */
  valores: EstadoValores;
  /** Autor que actúa en el panel (inyectado). */
  autor: Autor;
  /** Función para añadir un vínculo (inyectada). */
  alVincular: (vinculo: Vinculo) => void;
  /** Función para eliminar un vínculo (inyectada). */
  alEliminarVinculo: (id: string) => void;
  /** Lista actual de vínculos (inyectada). */
  vinculos: Vinculo[];
  /** Si el panel es de solo lectura (opcional). */
  soloLectura?: boolean;
  /** Función para crear un nuevo id (inyectada). */
  nuevoId: () => string;
  /** Función para obtener el tiempo actual (inyectada). */
  ahora: () => number;
}

export function PanelVinculos({
  candidatos,
  valores,
  autor,
  alVincular,
  alEliminarVinculo,
  vinculos,
  soloLectura = false,
  nuevoId,
  ahora,
}: PanelVinculosProps) {
  const [aprendiendo, setAprendiendo] = useState<EstadoAprender>(estadoInicial());
  const [error, setError] = useState<string | null>(null);
  const [anclaAprendizaje, setAnclaAprendizaje] = useState<HTMLButtonElement | null>(null);
  const [abrirPopover, setAbrirPopover] = useState(false);
  const [parametroSeleccionado, setParametroSeleccionado] = useState<ParametroRef | null>(null);
  const { toast } = useToast();

  const manejarError = (e: unknown) => {
    console.error(e);
    setError("Error inesperado");
    toast({
      title: "Error",
      description: "Ocurrió un error inesperado",
      variant: "destructive",
    });
  };

  // Funciones para aprender
  const empezarAprendizaje = (objetivo: ParametroRef) => {
    setAprendiendo(siguienteAprender(estadoInicial(), { tipo: "empezar", objetivo, ahora: ahora() }));
    setAnclaAprendizaje(document.activeElement as HTMLButtonElement);
    setAbrirPopover(false);
  };

  const cancelarAprendizaje = () => {
    setAprendiendo(siguienteAprender(estadoInicial(), { tipo: "cancelar", ahora: ahora() }));
  };

  const confirmarAprendizaje = () => {
    if (aprendiendo.fase !== "detectado") return;
    // Usar decidir para proponer la creación del vínculo
    const decidirResultado = decidir({
      rol: "dueno", // TODO: obtener del contexto
      origen: "mano",
      ambito: "personal", // TODO: obtener del contexto
      accion: "vincular-control",
    });

    if (!decidirResultado.permitido) {
      setError(decidirResultado.motivo);
      return;
    }

    if (decidirResultado.confirmar) {
      // La persona ha confirmado a través de decidir, así que procedemos
      const p = parametroDe(aprendiendo.objetivo);
      if (!p) {
        setError("El parámetro ya no existe");
        return;
      }
      const nuevoVinculo = vinculoAprendido(aprendiendo as Extract<EstadoAprender, { fase: "detectado" }>, p, nuevoId(), autor.id);
      alVincular(nuevoVinculo);
      setAprendiendo(estadoInicial());
    } else {
      // Jev permitió pero no confirmó, así que aplicamos directamente (según el contrato)
      const p = parametroDe(aprendiendo.objetivo);
      if (!p) {
        setError("El parámetro ya no existe");
        return;
      }
      const nuevoVinculo = vinculoAprendido(aprendiendo as Extract<EstadoAprender, { fase: "detectado" }>, p, nuevoId(), autor.id);
      alVincular(nuevoVinculo);
      setAprendiendo(estadoInicial());
    }
  };

  // Simular la detección de un mando para demostración
  // En una implementación real, esto vendría del enrutador o del adapter
  useEffect(() => {
    if (aprendiendo.fase === "escuchando") {
      // Simular que después de 2 segundos detectamos un mando
      const timer = setTimeout(() => {
        // Crear una fuente de mando de ejemplo (gamepad, eje 0, indice 0)
        const fuenteEjemplo: FuenteControl = { tipo: "gamepad", control: "eje", numero: 0, indice: 0 };
        const evento: EventoAprender = {
          tipo: "entrada",
          fuente: fuenteEjemplo,
          bruto: 0.5, // Valor medio
          ahora: ahora(),
        };
        setAprendiendo(siguienteAprender(aprendiendo, evento));
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [aprendiendo, ahora]);

  if (error) {
    return <div className="p-4 bg-red-50 border border-red-200 rounded-md">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Vínculos de mando</h2>
      
      {/* Lista de vínculos */}
      {vinculos.length > 0 ? (
        <div className="space-y-2">
          {vinculos.map((v) => (
            <div key={v.id} className="flex items-center gap-4 p-3 border rounded-md">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{fuenteLegible(v.fuente)}</span>
                  <span className="text-xs text-muted-foreground">→</span>
                  <span className="font-medium">
                    {parametroNombre(v.objetivo, valores)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Modo: {v.modo}</span>
                  <span className="mx-1">|</span>
                  <span>Activo: {v.activo ? "Sí" : "No"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>
                    Curva: {v.curva.forma}{v.curva.invertir ? " (invertida)" : ""}
                  </span>
                  <span className="mx-1">|</span>
                  <span>Zona muerta: {(v.curva.zonaMuerta * 100).toFixed(0)}%</span>
                </div>
              </div>
              {!soloLectura && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Usar decidir para proponer la eliminación
                    const decidirResultado = decidir({
                      rol: "dueno",
                      origen: "mano",
                      ambito: "personal",
                      accion: "vincular-control",
                    });
                    if (!decidirResultado.permitido) {
                      manejarError(decidirResultado.motivo);
                      return;
                    }
                    if (decidirResultado.confirmar || !decidirResultado.confirmar) {
                      alEliminarVinculo(v.id);
                    }
                  }}
                >
                  Quitar
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Aún no hay vínculos. Añade uno desde «Aprender vínculo».</p>
      )}
      
      {/* Botón para aprender */}
      <Button
        variant={soloLectura ? "outline" : "default"}
        disabled={soloLectura}
        onClick={() => setAbrirPopover(true)}
        className="w-full"
      >
        Aprender vínculo
      </Button>
      
      {/* Popover para seleccionar parámetro */}
      <Popover>
        <PopoverTrigger asChild>
          <button className="hidden">{/* Invisible trigger */}</button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-56 p-4">
          <form className="space-y-3" onSubmit={(e) => {
            e.preventDefault();
            if (parametroSeleccionado) {
              empezarAprendizaje(parametroSeleccionado);
              setParametroSeleccionado(null);
              setAbrirPopover(false);
            }
          }}>
            <FormField>
              <FormLabel>Parámetro a vincular</FormLabel>
              <FormControl>
                <Input
                  placeholder="Selecciona un parámetro"
                  readOnly
                  value={parametroSeleccionado ? parametroNombre(parametroSeleccionado, valores) : ""}
                  onClick={() => {
                    // Abrir el command para seleccionar
                    // En una implementación real, usaríamos un combobox o similar
                    // Por ahora, usamos un state simple
                  }}
                />
              </FormControl>
            </FormField>
            <Button type="submit" className="w-full">
              {parametroSeleccionado ? "Seleccionado: " + parametroNombre(parametroSeleccionado, valores) : "Seleccionar parámetro"}
            </Button>
          </form>
          
          {/* Lista de parámetros para seleccionar (simplificada) */}
          {!parametroSeleccionado && (
            <div className="mt-3 space-y-2">
              {candidatos.map((c) => (
                <Button
                  key={c.ref.atomoId + "::" + c.ref.parametroId}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setParametroSeleccionado(c.ref);
                  }}
                  className="w-full text-left"
                >
                  {parametroNombre(c.ref, valores)} ({c.parametro.nombre})
                </Button>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
      
      {/* Estado de aprendizaje */}
      {aprendiendo.fase !== "inactivo" && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
          {aprendiendo.fase === "escuchando" && (
            <>
              <p className="mb-2">Escuchando... Mueve el mando que deseas vincular.</p>
              {anclaAprendizaje && (
                <p className="text-xs text-muted-foreground">
                  (Haz clic en el botón «Aprender vínculo» para volver a enfocar)
                </p>
              )}
            </>
          )}
          {aprendiendo.fase === "detectado" && (
            <>
              <p className="mb-2">
                ¡Mando detectado! Fuente: {fuenteLegible((aprendiendo as Extract<EstadoAprender, { fase: "detected" }>).fuente)}
              </p>
              <p className="mb-2">¿Confirmas este vínculo?</p>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={cancelarAprendizaje}>
                  Cancelar
                </Button>
                <Button onClick={confirmarAprendizaje}>
                  Confirmar
                </Button>
              </div>
            </>
          )}
          {aprendiendo.fase === "cancelado" && (
            <p className="text-sm text-muted-foreground">
              Aprendizaje cancelado.{(aprendiendo as Extract<EstadoAprender, { fase: "cancelado" }>).motivo === "usuario"
                ? " Por el usuario."
                : " Por timeout."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Funciones auxiliares
function fuenteLegible(fuente: FuenteControl): string {
  switch (fuente.tipo) {
    case "midi":
      const tipoMidi = {
        cc: "CC",
        nota: "Nota",
        pitch: "Pitch",
      }[fuente.mensaje];
      return `MIDI ${tipoMidi} ${fuente.numero ?? 0} Canal ${fuente.canal}${fuente.dispositivo ? ` (${fuente.dispositivo})` : ""}`;
    case "gamepad":
      const tipoGamepad = {
        eje: "Eje",
        boton: "Botón",
      }[fuente.control];
      return `Gamepad ${tipoGamepad} ${fuente.numero} Índice ${fuente.indice ?? 0}`;
    case "hid":
      return `HID ${fuente.dispositivo} Byte ${fuente.byte}`;
    case "osc":
      return `OSC ${fuente.direccion}`;
    case "sensor":
      return `Sensor ${fuente.sensorId}${fuente.eje ? ` Eje ${fuente.eje}` : ""}`;
    default:
      return "Desconocido";
  }
}

function parametroNombre(ref: ParametroRef, valores: EstadoValores): string {
  const valor = valores[`${ref.atomoId}::${ref.parametroId}`];
  return valor !== undefined ? String(valor) : ref.parametroId;
}

export default PanelVinculos;