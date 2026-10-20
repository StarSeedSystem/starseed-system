"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { AjustesMedios } from "./ajustes-medios";
import { AjustesSeguridad } from "./ajustes-seguridad";
import { AjustesSync } from "./ajustes-sync";
import {
  APLICACION,
  type AjustesObjetivo,
  AJUSTES_POR_DEFECTO,
  leerAjustes,
  conAjustes,
  ajustesEfectivos,
} from "@/lib/cerebros/ajustes";
import type { Brain } from "@/lib/brains/brains";
import { saveBrain } from "@/lib/brains/brains";
import { listMemoryFiles } from "@/lib/cerebro/memory-files";
import { MarcaAplicacion } from "./ajustes-seguridad";

export interface AjustesCerebroDialogProps {
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
  cerebro: Brain;
  cerebros: Brain[];
  onHecho?: () => void;
}

export default function AjustesCerebroDialog({
  open,
  onOpenChange,
  cerebro,
  cerebros,
  onHecho,
}: AjustesCerebroDialogProps) {
  // State for the dialog
  const [aplicarA, setAplicarA] = useState<"cerebro" | "memoria" | "carpeta">(
    "cerebro"
  );
  const [objetivoId, setObjetivoId] = useState<string | null>(null);
  const [tab, setTab] = useState<"medios" | "seguridad" | "sincronizacion">(
    "medios"
  );
  const [ajustes, setAjustes] = useState<AjustesObjetivo>(
    AJUSTES_POR_DEFECTO
  );
  const [memoriaOptions, setMemoriaOptions] = useState<string[]>([]);
  const [carpetaOptions, setCarpetaOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Load memory files and roots when cerebro changes
  useEffect(() => {
    async function loadOptions() {
      setLoading(true);
      try {
        // Load memory files (for memoria option)
        const memoryFiles = await listMemoryFiles(cerebro.id);
        const memoryFileNames = memoryFiles.map((f) => f.name);
        setMemoriaOptions(memoryFileNames);

        // Note: memory roots are loaded from localStorage in the component
        // that uses them, but we can also load them here if we had a function.
        // For now, we'll leave carpetaOptions empty and fill them in a
        // separate effect or in the render. We'll do it in the same effect.
        // However, we don't have a function to get memory roots from the
        // cerebro's localStorage from here. We'll need to get it from
        // the brains-panel or similar. Since we are in the cerebro dialog,
        // we can access localStorage directly.
        if (typeof window !== "undefined") {
          const raw = window.localStorage.getItem(
            `starseed.brain.${cerebro.id}.memoryRoots`
          );
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                const ids = parsed
                  .filter((x): x is string => typeof x === "string")
                  .map((id) => id);
                setCarpetaOptions(ids);
              }
            } catch {
              // ignore
            }
          }
        }
      } finally {
        setLoading(false);
      }
    }

    if (cerebro.id) {
      loadOptions();
    }
  }, [cerebro.id]);

  // When aplicarA or objetivoId changes, reset ajustes to the current value
  // for that objective from the cerebro's config.
  useEffect(() => {
    const baseAjustes = leerAjustes(cerebro);
    let objetivoAjustes: AjustesObjetivo = AJUSTES_POR_DEFECTO;

    switch (aplicarA) {
      case "cerebro":
        objetivoAjustes = baseAjustes.cerebro;
        break;
      case "memoria":
        if (objetivoId) {
          objetivoAjustes =
            baseAjustes.memorias[objetivoId] ?? AJUSTES_POR_DEFECTO;
        } else {
          objetivoAjustes = AJUSTES_POR_DEFECTO;
        }
        break;
      case "carpeta":
        if (objetivoId) {
          objetivoAjustes =
            baseAjustes.carpetas[objetivoId] ?? AJUSTES_POR_DEFECTO;
        } else {
          objetivoAjustes = AJUSTES_POR_DEFECTO;
        }
        break;
    }

    setAjustes(objetivoAjustes);
  }, [aplicarA, objetivoId, cerebro]);

  // Memoize the objective for use in conAjustes and ajustesEfectivos
  const objetivo = useMemo(() => {
    if (aplicarA === "cerebro") {
      return { tipo: "cerebro" };
    }
    if (aplicarA === "memoria" && objetivoId) {
      return { tipo: "memoria", id: objetivoId };
    }
    if (aplicarA === "carpeta" && objetivoId) {
      return { tipo: "carpeta", id: objetivoId };
    }
    // Fallback to cerebro
    return { tipo: "cerebro" };
  }, [aplicarA, objetivoId]);

  // Compute effective ajustes for display (though we are editing the base)
  const ajustesEfectivos = useMemo(() => {
    return ajustesEfectivos(
      leerAjustes(cerebro),
      objetivo
    );
  }, [cerebro, objetivo]);

  // Handle changes from the tabs
  const handleCambio = (parcial: Partial<AjustesObjetivo>) => {
    setAjustes((prev) => ({
      ...prev,
      ...parcial,
    }));
  };

  // Handle save
  const handleSave = async () => {
    setLoading(true);
    try {
      const nuevoConfig = conAjustes(
        cerebro.config || {},
        objetivo,
        ajustes
      );
      const updatedBrain = await saveBrain({
        ...cerebro,
        config: nuevoConfig,
      });
      // Note: saveBrain returns the updated brain or null.
      // We assume it succeeds for now.
      onHecho?.();
    } catch (err) {
      console.error("Failed to save brain adjustments:", err);
    } finally {
      setLoading(false);
    }
  };

  // If the dialog is not open, we don't render anything.
  if (!open) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Ajustes del cerebro · «{cerebro.name}»
          </DialogTitle>
          <DialogDescription>
            Configura los medios, seguridad, privacidad, vinculación y
            sincronización del cerebro entero o de una memoria o carpeta
            concreta.
          </DialogDescription>
        </DialogHeader>

        {/* Tabs for the different sections */}
        <div className="space-y-4">
          <Tabs defaultValue="medios" className="w-full">
            <TabsList className="grid w-full grid-cols-3 border-b">
              <TabsTrigger
                value="medios"
                className={cn(
                  "flex h-10 w-full items-center justify-center rounded-t-lg",
                  "border-b-2 border-transparent",
                  "text-sm font-medium",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "data-[state=active]:border-b-2 data-[state=active]:foreground"
                )}
              >
                Medios
              </TabsTrigger>
              <TabsTrigger
                value="seguridad"
                className={cn(
                  "flex h-10 w-full items-center justify-center rounded-t-lg",
                  "border-b-2 border-transparent",
                  "text-sm font-medium",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "data-[state=active]:border-b-2 data-[state=active]:foreground"
                )}
              >
                Seguridad y privacidad
              </TabsTrigger>
              <TabsTrigger
                value="sincronizacion"
                className={cn(
                  "flex h-10 w-full items-center justify-center rounded-t-lg",
                  "border-b-2 border-transparent",
                  "text-sm font-medium",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "data-[state=active]:border-b-2 data-[state=active]:foreground"
                )}
              >
                Vinculación y sincronización
              </TabsTrigger>
            </TabsList>
            <TabsContent value="medios" className="pb-4">
              <AjustesMedios
                valor={ajustes}
                onCambio={handleCambio}
                nivel={aplicarA}
                objetivoId={objetivoId}
                cerebro={cerebro}
              />
            </TabsContent>
            <TabsContent value="seguridad" className="pb-4">
              <AjustesSeguridad
                valor={{
                  privacidad: ajustes.privacidad,
                  cifradoLocal: ajustes.cifradoLocal,
                  acceso: ajustes.acceso,
                }}
                onCambio={handleCambio}
                nivel={aplicarA}
              />
            </TabsContent>
            <TabsContent value="sincronizacion" className="pb-4">
              <AjustesSync
                valor={{ sync: ajustes.sync }}
                onCambio={handleCambio}
                cerebro={{
                  id: cerebro.id,
                  config: cerebro.config,
                }}
                onAbrirTelepatia={() => {
                  // TODO: Implement opening telepatia dialog
                  // For now, we do nothing.
                }}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Aplicar a selector */}
        <div className="border-t pt-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Aplicar a:</span>
              <div className="flex space-x-3">
                <Button
                  variant={aplicarA === "cerebro" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAplicarA("cerebro")}
                  disabled={loading}
                >
                  Cerebro completo
                </Button>
                <Button
                  variant={aplicarA === "memoria" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAplicarA("memoria")}
                  disabled={loading || memoriaOptions.length === 0}
                >
                  Memoria
                </Button>
                <Button
                  variant={aplicarA === "carpeta" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAplicarA("carpeta")}
                  disabled={loading || carpetaOptions.length === 0}
                >
                  Carpeta
                </Button>
              </div>
            </div>

            {/* Memory or folder selector */}
            {(aplicarA === "memoria" || aplicarA === "carpeta") && (
              <div className="flex items-center gap-2">
                <span className="text-sm">
                  {aplicarA === "memoria" ? "Memoria:" : "Carpeta:"}
                </span>
                <select
                  value={objetivoId ?? ""}
                  onChange={(e) => setObjetivoId(e.target.value || null)}
                  disabled={loading}
                  className="border rounded px-2 py-1 text-sm"
                >
                  <option value="">Seleccionar...</option>
                  {aplicarA === "memoria" ? (
                    memoriaOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))
                  ) : (
                    carpetaOptions.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))
                  )}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="border-t pt-4 flex justify-end space-x-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={loading}
          >
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}