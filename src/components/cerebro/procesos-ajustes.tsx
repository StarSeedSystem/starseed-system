"use client";

import { useState, useEffect, useCallback } from "react";
import {
  TipoProceso,
  ETIQUETA_TIPO,
  UmbralesProcesos,
} from "@/lib/cerebros/procesos";
import {
  leerPreferencias,
  guardarPreferencias,
  PREFERENCIAS_DEFECTO,
  limitesDeCerebro,
  guardarLimites,
} from "@/lib/cerebros/procesos-preferencias";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";

export function ProcesosAjustes({ brainId }: { brainId: string | null }) {
  const [preferencias, setPreferenciasState] = useState(() => leerPreferencias());
  const [limites, setLimitesState] = useState<{ cpuMaxPct: number | null; ramMaxMb: number | null } | null>(
    () => (brainId ? limitesDeCerebro(brainId) : null)
  );

  // Sincronizar con cambios en localStorage de otras pestañas
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "starseed.cerebros.procesos.v1" && e.newValue !== null) {
        try {
          const parsed = JSON.parse(e.newValue);
          setPreferenciasState(parsed);
        } catch {
          // Ignorar
        }
      }
      if (brainId && e.key === `starseed.brain.${brainId}.limites` && e.newValue !== null) {
        try {
          const parsed = JSON.parse(e.newValue);
          setLimitesState(parsed);
        } catch {
          // Ignorar
        }
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [brainId]);

  const guardarPreferenciasCallback = useCallback(() => {
    guardarPreferencias(preferencias);
  }, [preferencias]);

  const guardarLimitesCallback = useCallback(() => {
    if (brainId) {
      guardarLimites(brainId, limites ?? { cpuMaxPct: null, ramMaxMb: null });
    }
  }, [brainId, limites]);

  // Manejar cambios en los tipos (checkboxes)
  const toggleTipo = (tipo: TipoProceso) => {
    setPreferenciasState((prev) => {
      const yaExiste = prev.tipos.includes(tipo);
      return yaExiste
        ? { ...prev, tipos: prev.tipos.filter((t) => t !== tipo) }
        : { ...prev, tipos: [...prev.tipos, tipo] };
    });
  };

  // Manejar cambios en el intervalo
  const cambiarIntervalo = (valor: number) => {
    setPreferenciasState((prev) => ({ ...prev, intervaloSeg: valor }));
  };

  // Manejar cambios en los umbrales
  const cambiarUmbral = (
    campo: keyof UmbralesProcesos,
    valor: number
  ) => {
    setPreferenciasState((prev) => ({
      ...prev,
      umbrales: { ...prev.umbrales, [campo]: valor },
    }));
  };

  // Manejar cambios en los servidores ocultos
  const toggleOculto = (servidorId: string) => {
    setPreferenciasState((prev) => {
      const yaExiste = prev.ocultos.includes(servidorId);
      return yaExiste
        ? { ...prev, ocultos: prev.ocultos.filter((id) => id !== servidorId) }
        : { ...prev, ocultos: [...prev.ocultos, servidorId] };
    });
  };

  // Manejar cambios en los límites
  const cambiarLimiteCPU = (valor: number | null) => {
    setLimitesState((prev) => ({
      ...(prev ?? { cpuMaxPct: null, ramMaxMb: null }),
      cpuMaxPct: valor,
    }));
  };

  const cambiarLimiteRAM = (valor: number | null) => {
    setLimitesState((prev) => ({
      ...(prev ?? { cpuMaxPct: null, ramMaxMb: null }),
      ramMaxMb: valor,
    }));
  };

  return (
    <section className="space-y-6">
      <div className="border-t border-white/10 pt-4">
        <h3 className="text-base font-semibold text-white mb-4">
          Preferencias de procesos activos
        </h3>

        {/* Tipos visibles */}
        <div className="mb-4">
          <h4 className="text-sm font-medium text-white/80 mb-2">
            Tipos visibles
          </h4>
          <div className="flex flex-wrap gap-2">
            {[ "genesis", "poligenesis", "sueno", "imaginacion", "descarga", "instalacion", "actualizacion", "app-fondo", "servicio" ].map((tipo) => (
              <label key={tipo} className="flex items-center gap-2">
                <Checkbox
                  checked={preferencias.tipos.includes(tipo as TipoProceso)}
                  onChange={() => toggleTipo(tipo as TipoProceso)}
                  className="h-4 w-4"
                >
                  {ETIQUETA_TIPO[tipo as TipoProceso]}
                </Checkbox>
              </label>
            ))}
          </div>
        </div>

        {/* Intervalo de actualización */}
        <div className="mb-4">
          <h4 className="text-sm font-medium text-white/80 mb-2">
            Intervalo de actualización
          </h4>
          <p className="text-xs text-white/60 mb-1">
            Cada cuántos segundos se actualizan los datos (5-120 s, por defecto 15 s)
          </p>
          <div className="flex items-center gap-3">
            <Slider
              min={5}
              max={120}
              step={1}
              value={preferencias.intervaloSeg}
              onValueChange={(valor) => cambiarIntervalo(Number(valor))}
              className="w-40"
            >
              <span className="text-xs text-white/60">{preferencias.intervaloSeg} s</span>
            </Slider>
          </div>
        </div>

        {/* Umbrales de aviso */}
        <div className="mb-4">
          <h4 className="text-sm font-medium text-white/80 mb-2">
            Umbrales de aviso
          </h4>
          <p className="text-xs text-white/60 mb-1">
            Porcentaje a partir del cual se muestra un aviso (1-100)
          </p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <label className="block mb-1 font-medium text-white/80">
                CPU
              </label>
              <div className="flex items-center gap-2">
                <Slider
                  min={1}
                  max={100}
                  step={1}
                  value={preferencias.umbrales.cpu}
                  onValueChange={(valor) =>
                    cambiarUmbral("cpu", Number(valor))
                  }
                  className="w-24"
                >
                  <span className="text-xs text-white/60">
                    {preferencias.umbrales.cpu}%
                  </span>
                </Slider>
              </div>
            </div>
            <div>
              <label className="block mb-1 font-medium text-white/80">
                RAM
              </label>
              <div className="flex items-center gap-2">
                <Slider
                  min={1}
                  max={100}
                  step={1}
                  value={preferencias.umbrales.ram}
                  onValueChange={(valor) =>
                    cambiarUmbral("ram", Number(valor))
                  }
                  className="w-24"
                >
                  <span className="text-xs text-white/60">
                    {preferencias.umbrales.ram}%
                  </span>
                </Slider>
              </div>
            </div>
            <div>
              <label className="block mb-1 font-medium text-white/80">
                Disco
              </label>
              <div className="flex items-center gap-2">
                <Slider
                  min={1}
                  max={100}
                  step={1}
                  value={preferencias.umbrales.disco}
                  onValueChange={(valor) =>
                    cambiarUmbral("disco", Number(valor))
                  }
                  className="w-24"
                >
                  <span className="text-xs text-white/60">
                    {preferencias.umbrales.disco}%
                  </span>
                </Slider>
              </div>
            </div>
            <div>
              <label className="block mb-1 font-medium text-white/80">
                Batería
              </label>
              <div className="flex items-center gap-2">
                <Slider
                  min={1}
                  max={100}
                  step={1}
                  value={preferencias.umbrales.bateria}
                  onValueChange={(valor) =>
                    cambiarUmbral("bateria", Number(valor))
                  }
                  className="w-24"
                >
                  <span className="text-xs text-white/60">
                    {preferencias.umbrales.bateria}%
                  </span>
                </Slider>
              </div>
            </div>
          </div>
        </div>

        {/* Servidores ocultos */}
        <div className="mb-4">
          <h4 className="text-sm font-medium text-white/80 mb-2">
            Servidores ocultos
          </h4>
          <p className="text-xs text-white/60 mb-1">
            IDs de servidores que no se muestran en el panel de hardware
          </p>
          {/* Aquí debería haber una lista de servidores conocidos, pero por simplicidad,
          dejamos un campo de texto para añadir/quitar manualmente. */}
          <div className="flex flex-wrap gap-2">
            {preferencias.ocultos.map((id) => (
              <span
                key={id}
                className="flex items-center gap-1 rounded bg-white/10 px-2 py-1 text-xs"
              >
                {id}
                <button
                  onClick={() => toggleOculto(id)}
                  className="text-xs text-white/60 hover:text-white"
                  aria-label={`Quitar ${id} de ocultos`}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              type="text"
              placeholder="Añadir ID de servidor"
              className="input input-sm w-40"
              // En una implementación real, habría un botón para añadir
              // y validación. Por simplicidad, dejamos solo la visualización.
              readOnly
            />
          </div>
        </div>
      </div>

      {/* Límites por cerebro (solo si hay brainId) */}
      {brainId && (
        <div className="border-t border-white/10 pt-4">
          <h3 className="text-base font-semibold text-white mb-4">
            Límites por cerebro
          </h3>
          <p className="text-xs text-white/60 mb-4">
            Máximo de CPU y RAM que pueden usar las tareas de este cerebro.
            Guardado; lo aplicará el orquestador (hoy nadie lo aplica todavía).
          </p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <label className="block mb-1 font-medium text-white/80">
                CPU máxima (%)
              </label>
              <div className="flex items-center gap-2">
                <Slider
                  min={10}
                  max={100}
                  step={1}
                  value={limites?.cpuMaxPct ?? 100}
                  onValueChange={(valor) =>
                    cambiarLimiteCPU(Number(valor))
                  }
                  className="w-24"
                >
                  <span className="text-xs text-white/60">
                    {limites?.cpuMaxPct ?? 100}%
                  </span>
                </Slider>
              </div>
            </div>
            <div>
              <label className="block mb-1 font-medium text-white/80">
                RAM máxima (MB)
              </label>
              <div className="flex items-center gap-2">
                <Slider
                  min={100}
                  max={8192}
                  step={10}
                  value={limites?.ramMaxMb ?? 4096}
                  onValueChange={(valor) =>
                    cambiarLimiteRAM(Number(valor))
                  }
                  className="w-24"
                >
                  <span className="text-xs text-white/60">
                    {limites?.ramMaxMb ?? 4096} MB
                  </span>
                </Slider>
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={guardarLimitesCallback}
              className="btn btn-sm btn-primary"
              disabled={!brainId}
            >
              Guardar límites
            </button>
          </div>
        </div>
      )}
    </section>
  );
}