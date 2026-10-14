"use client";

import { useState, useEffect } from "react";
import {
  Checkbox,
  CheckboxItem,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Input,
  InputGroup,
  InputAddon,
} from "@/components/ui/input";
import { Slider, SliderThumb, SliderTrack, SliderValue } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ETIQUETA_TIPO,
  TipoProceso,
} from "@/lib/cerebros/procesos";
import {
  leerPreferencias,
  normalizarPreferencias,
  guardarPreferencias,
  limitesDeCerebro,
  guardarLimites,
} from "@/lib/cerebros/procesos-preferencias";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ProcesosAjustesProps {
  brainId: string | null;
}

export function ProcesosAjustes({ brainId }: ProcesosAjustesProps) {
  const [preferencias, setPreferencias] = useState(() =>
    brainId ? leerPreferencias(brainId) : {
      tipos: Object.values(ETIQUETA_TIPO) as TipoProceso[],
      intervaloSeg: 15,
      umbrales: { cpu: 85, ram: 90, disco: 90, bateria: 20 },
      ocultos: [],
    }
  );

  const [limites, setLimites] = useState<{
    cpuMaxPct: number | null;
    ramMaxMb: number | null;
  } | null>(null);

  // Cargar preferencias cuando cambie el brainId
  useEffect(() => {
    if (brainId) {
      setPreferencias(leerPreferencias(brainId));
      setLimites(limitesDeCerebro(brainId));
    }
  }, [brainId]);

  // Guardar preferencias cuando cambien
  useEffect(() => {
    if (brainId) {
      guardarPreferencias(brainId, preferencias);
    }
  }, [brainId, preferencias]);

  // Guardar límites cuando cambien
  useEffect(() => {
    if (brainId) {
      guardarLimites(brainId, limites ?? { cpuMaxPct: null, ramMaxMb: null });
    }
  }, [brainId, limites]);

  const handleTiposChange = (nuevosTipos: TipoProceso[]) => {
    setPreferencias((prev) => ({ ...prev, tipos: nuevosTipos }));
  };

  const handleIntervaloChange = (valor: number) => {
    setPreferencias((prev) => ({ ...prev, intervaloSeg: valor }));
  };

  const handleUmbralChange = (
    tipo: keyof typeof preferencias.umbrales,
    valor: number
  ) => {
    setPreferencias((prev) => ({
      ...prev,
      umbrales: { ...prev.umbrales, [tipo]: valor },
    }));
  };

  const handleOcultosChange = (nuevosOcultos: string[]) => {
    setPreferencias((prev) => ({ ...prev, ocultos: nuevosOcultos }));
  };

  if (!brainId) {
    return (
      <div className="space-y-4 p-6">
        <h3 className="text-lg font-semibold text-white/90">
          Selecciona un cerebro para ver sus ajustes de procesos activos
        </h3>
        <p className="text-sm text-white/60">
          Los ajustes de procesos activos solo están disponibles cuando hay
          un cerebro seleccionado.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-white/90">
          Ajustes de procesos activos
        </h2>
        <p className="text-sm text-white/60">
          Configura qué tipos de procesos aparecen, con qué frecuencia se
          miden el hardware y los umbrales de aviso.
        </p>
      </div>

      {/* Tipos visibles */}
      <FormField>
        <FormLabel>Tipos visibles</FormLabel>
        <FormDescription>
          Selecciona qué tipos de procesos activos quieres que se muestren
          en el panel de procesos.
        </FormDescription>
        <div className="space-y-2">
          {Object.entries(ETIQUETA_TIPO).map(([valor, etiqueta]) => (
            <FormControl key={valor} renderItem={({ children }) => (
              <CheckboxItem
                checked={preferencias.tipos.includes(valor as TipoProceso)}
                onCheckedChange={(checked) => {
                  if (checked) {
                    handleTiposChange([
                      ...preferencias.tipos,
                      valor as TipoProceso,
                    ]);
                  } else {
                    handleTiposChange(
                      preferencias.tipos.filter((t) => t !== valor)
                    );
                  }
                }}
              >
                {children}
              </CheckboxItem>
            )}>
              <FormItem>
                <FormLabel>{etiqueta}</FormLabel>
              </FormItem>
            </FormControl>
          ))}
        </div>
      </FormField>

      {/* Intervalo de medición */}
      <FormField>
        <FormLabel>Intervalo de medición</FormLabel>
        <FormDescription>
          Cada cuántos segundos se mide el hardware de los servidores
          vinculados (solo cuando la pestaña de procesos está visible).
        </FormDescription>
        <div className="space-y-3">
          <div className="flex items-baseline gap-3">
            <span className="text-xs text-white/50">5s</span>
            <Slider
              min={5}
              max={120}
              step={1}
              defaultValue={preferencias.intervaloSeg}
              onValueChange={handleIntervaloChange}
              className="h-2 w-full"
            >
              <SliderTrack className="bg-white/20">
                <SliderFill className="bg-white/60" />
              </SliderTrack>
              <SliderThumb className="bg-white/80 hover:bg-white/90 ring-2 ring-white/20" />
            </Slider>
            <span className="text-xs text-white/50">120s</span>
          </div>
          <div className="flex justify-between text-xs text-white/60">
            <span>Cada {preferencias.intervaloSeg} segundos</span>
            <span>
              ({preferencias.intervaloSeg === 15 ? "por defecto" : "personalizado"})
            </span>
          </div>
        </div>
      </FormField>

      {/* Umbrales de aviso */}
      <FormField>
        <FormLabel>Umbrales de aviso</FormLabel>
        <FormDescription>
          Porcentaje por encima del cual se muestra un aviso para cada
          recurso (batería por debajo y solo si no carga).
        </FormDescription>
        <div className="space-y-4">
          {[["cpu", "CPU"], ["ram", "RAM"], ["disco", "Disco"], ["bateria", "Batería"]].map(
            ([clave, etiqueta]) => (
              <FormControl key={clave}>
                <FormItem>
                  <FormLabel>{etiqueta}</FormLabel>
                </FormItem>
                <div className="flex items-baseline gap-3 mt-2">
                  <span className="text-xs text-white/50">1%</span>
                  <Slider
                    min={1}
                    max={100}
                    step={1}
                    defaultValue={preferencias.umbrales[clave as keyof typeof preferencias.umbrales]}
                    onValueChange={(valor) =>
                      handleUmbralChange(clave as keyof typeof preferencias.umbrales, valor)
                    }
                    className="h-2 w-full"
                  >
                    <SliderTrack className="bg-white/20">
                      <SliderFill className="bg-white/60" />
                    </SliderTrack>
                    <SliderThumb className="bg-white/80 hover:bg-white/90 ring-2 ring-white/20" />
                  </Slider>
                  <span className="text-xs text-white/50">100%</span>
                </div>
                <div className="flex justify-between text-xs text-white/60 mt-1">
                  <span>{preferencias.umbrales[clave as keyof typeof preferencias.umbrales]}%</span>
                  <span>
                    ({preferencias.umbrales[clave as keyof typeof preferencias.umbrales] ===
                    ({ cpu: 85, ram: 90, disco: 90, bateria: 20 } as typeof preferencias.umbrales)[clave as keyof typeof preferencias.umbrales]
                      ? "por defecto"
                      : "personalizado"})
                  </span>
                </div>
              </FormControl>
            )
          )}
        </div>
      </FormField>

      {/* Servidores ocultos (placeholder para futura implementación) */}
      <FormField>
        <FormLabel>Servidores ocultos</FormLabel>
        <FormDescription>
          Lista de IDs de servidores que no se mostrarán en el panel de
          procesos activos (funcionalidad futura).
        </FormDescription>
        <p className="text-sm text-white/50 italic">
          Esta funcionalidad estará disponible en una futura actualización.
        </p>
        <div className="mt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // Placeholder para futura implementación
              alert("Funcionalidad de servidores ocultos aún no implementada");
            }}
          >
            Gestionar servidores ocultos
          </Button>
        </div>
      </FormField>

      {/* Límites por cerebro (solo si hay cerebro seleccionado) */}
      {brainId && (
        <FormField>
          <FormLabel>Límites por cerebro</FormLabel>
          <FormDescription>
            Máximo porcentaje de CPU y megabytes de RAM que pueden usar
            las tareas de este cerebro. Estos límites se guardarán pero
            hoy nadie los aplica (el orquestador los aplicará en el futuro).
          </FormDescription>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FormLabel>CPU máxima</FormLabel>
                <div className="flex items-baseline gap-3 mt-2">
                  <span className="text-xs text-white/50">0%</span>
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    defaultValue={limites?.cpuMaxPct ?? 100}
                    onValueChange={(valor) =>
                      setLimites((prev) => ({
                        ...(prev ?? { cpuMaxPct: null, ramMaxMb: null }),
                        cpuMaxPct: valor,
                      }))
                    }
                    className="h-2 w-full"
                  >
                    <SliderTrack className="bg-white/20">
                      <SliderFill className="bg-white/60" />
                    </SliderTrack>
                    <SliderThumb className="bg-white/80 hover:bg-white/90 ring-2 ring-white/20" />
                  </Slider>
                  <span className="text-xs text-white/50">100%</span>
                </div>
                <div className="flex justify-between text-xs text-white/60 mt-1">
                  <span>
                    {(limites?.cpuMaxPct ?? 100) === null ? "sin límite" : `${limites?.cpuMaxPct}%`}
                  </span>
                  <span>
                    ({(limites?.cpuMaxPct ?? 100) === 100 ? "por defecto" : "personalizado"})
                  </span>
                </div>
              </div>
              <div>
                <FormLabel>RAM máxima</FormLabel>
                <div className="flex items-baseline gap-3 mt-2">
                  <span className="text-xs text-white/50">0 MB</span>
                  <Slider
                    min={0}
                    max={32768} // 32 GB máximo razonable
                    step={1}
                    defaultValue={limites?.ramMaxMb ?? 8192} // 8 GB por defecto
                    onValueChange={(valor) =>
                      setLimites((prev) => ({
                        ...(prev ?? { cpuMaxPct: null, ramMaxMb: null }),
                        ramMaxMb: valor,
                      }))
                    }
                    className="h-2 w-full"
                  >
                    <SliderTrack className="bg-white/20">
                      <SliderFill className="bg-white/60" />
                    </SliderTrack>
                    <SliderThumb className="bg-white/80 hover:bg-white/90 ring-2 ring-white/20" />
                  </Slider>
                  <span className="text-xs text-white/50">32768 MB</span>
                </div>
                <div className="flex justify-between text-xs text-white/60 mt-1">
                  <span>
                    {(limites?.ramMaxMb ?? 8192) === null
                      ? "sin límite"
                      : `${limites?.ramMaxMb} MB`}
                  </span>
                  <span>
                    ({(limites?.ramMaxMb ?? 8192) === 8192
                      ? "por defecto"
                      : "personalizado"})
                  </span>
                </div>
              </div>
            </div>
            <p className="text-xs text-white/40 italic mt-2">
              Guardado; lo aplicará el orquestador (hoy nadie lo aplica todavía)
            </p>
          </div>
        </FormField>
      )}

      {/* Botón de restauración de valores por defecto */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setPreferencias({
              tipos: Object.values(ETIQUETA_TIPO) as TipoProceso[],
              intervaloSeg: 15,
              umbrales: { cpu: 85, ram: 90, disco: 90, bateria: 20 },
              ocultos: [],
            });
            setLimites({ cpuMaxPct: 100, ramMaxMb: 8192 });
          }}
        >
          Restaurar valores por defecto
        </Button>
      </div>
    </div>
  );
}

// Componente auxiliar para el relleno del Slider
function SliderFill({
  className,
  ...props
}: React.ComponentProps<"div"> & { className?: string }) {
  return <div className={cn("h-full", className)} {...props} />;
}