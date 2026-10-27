"use client";

/** Ajustes del cerebro: diálogo con pestañas Medios, Seguridad y privacidad, Vinculación y sincronización. */
import React from "react";
import type { Brain } from "@/lib/brains/brains";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { saveBrain } from "@/lib/brains/brains";
import { conAjustes, leerAjustes, type AjustesCerebro, type AjustesObjetivo, AJUSTES_POR_DEFECTO } from "@/lib/cerebros/ajustes";
import { AjustesMedios } from "@/components/cerebro/ajustes-medios";
import { AjustesSeguridad } from "@/components/cerebro/ajustes-seguridad";
import { AjustesSync } from "@/components/cerebro/ajustes-sync";

export interface AjustesCerebroDialogProps {
    open: boolean;
    onOpenChange: (abierto: boolean) => void;
    cerebro: Brain;
    cerebros: Brain[];
    onHecho?: () => void;
}

type ObjetivoTipo = "cerebro" | "memoria" | "carpeta";

interface ObjetivoSeleccionado {
    tipo: ObjetivoTipo;
    id: string;
    nombre: string;
}

export default function AjustesCerebroDialog({ open, onOpenChange, cerebro, cerebros, onHecho }: AjustesCerebroDialogProps) {
    const ajustes = leerAjustes(cerebro);

    const [objetivo, setObjetivo] = React.useState<ObjetivoSeleccionado>({ tipo: "cerebro", id: "", nombre: "Cerebro completo" });
    const [pestanaActiva, setPestanaActiva] = React.useState("medios");
    const [ajustesLocales, setAjustesLocales] = React.useState<AjustesCerebro>(ajustes);

    React.useEffect(() => {
        setAjustesLocales(ajustes);
    }, [ajustes]);

    const memorias = React.useMemo(() => {
        if (!cerebro.id) return [];
        return ajustesLocales.memorias ? Object.keys(ajustesLocales.memorias) : [];
    }, [ajustesLocales.memorias]);

    const carpetas = React.useMemo(() => {
        if (!cerebro.id) return [];
        return ajustesLocales.carpetas ? Object.keys(ajustesLocales.carpetas) : [];
    }, [ajustesLocales.carpetas]);

    const handleGuardar = async () => {
        try {
            const objetivoConfig: { tipo: "cerebro" } | { tipo: "memoria" | "carpeta"; id: string } =
                objetivo.tipo === "cerebro"
                    ? { tipo: "cerebro" }
                    : { tipo: objetivo.tipo, id: objetivo.id };

            const ajustesObjetivo = objetivo.tipo === "cerebro"
                ? ajustesLocales.cerebro
                : objetivo.tipo === "memoria"
                    ? ajustesLocales.memorias?.[objetivo.id] ?? {}
                    : ajustesLocales.carpetas?.[objetivo.id] ?? {};

            const nuevoConfig = conAjustes(cerebro.config ?? {}, objetivoConfig, ajustesObjetivo);

            const guardado = await saveBrain({ ...cerebro, config: nuevoConfig });
            if (guardado && onHecho) onHecho();
            onOpenChange(false);
        } catch (e) {
            console.error("Error guardando ajustes:", e);
        }
    };

    const handleCambio = (parcial: Partial<AjustesObjetivo>) => {
        setAjustesLocales((prev) => {
            const nuevo = { ...prev };
            switch (objetivo.tipo) {
                case "cerebro":
                    nuevo.cerebro = { ...nuevo.cerebro, ...parcial };
                    break;
                case "memoria":
                    nuevo.memorias = {
                        ...nuevo.memorias,
                        [objetivo.id]: { ...nuevo.memorias?.[objetivo.id], ...parcial },
                    };
                    break;
                case "carpeta":
                    nuevo.carpetas = {
                        ...nuevo.carpetas,
                        [objetivo.id]: { ...nuevo.carpetas?.[objetivo.id], ...parcial },
                    };
                    break;
            }
            return nuevo;
        });
    };

    const opcionesObjetivo = React.useMemo(() => {
        const ops: { value: string; label: string }[] = [
            { value: "cerebro", label: "Cerebro completo" },
        ];
        for (const m of memorias) {
            ops.push({ value: `memoria:${m}`, label: `Memoria: ${m}` });
        }
        for (const c of carpetas) {
            ops.push({ value: `carpeta:${c}`, label: `Carpeta: ${c}` });
        }
        return ops;
    }, [memorias, carpetas]);

    const handleObjetivoChange = (value: string) => {
        if (value === "cerebro") {
            setObjetivo({ tipo: "cerebro", id: "", nombre: "Cerebro completo" });
        } else {
            const [tipo, id] = value.split(":");
            setObjetivo({ tipo: tipo as ObjetivoTipo, id, nombre: `${tipo === "memoria" ? "Memoria" : "Carpeta"}: ${id}` });
        }
    };

    if (!open) return null;

    const ajustesObjetivo = objetivo.tipo === "cerebro"
        ? ajustesLocales.cerebro
        : objetivo.tipo === "memoria"
            ? ajustesLocales.memorias?.[objetivo.id] ?? AJUSTES_POR_DEFECTO
            : ajustesLocales.carpetas?.[objetivo.id] ?? AJUSTES_POR_DEFECTO;

    const configCerebro = {
        memoryDestinations: cerebro.config?.memoryDestinations,
        telepatia: cerebro.config?.telepatia,
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden">
                <DialogHeader>
                    <DialogTitle className="text-lg">Ajustes del cerebro · «{cerebro.name}»</DialogTitle>
                    <DialogDescription>
                        Configura medios, seguridad, privacidad, vinculación y sincronización para el cerebro completo, una memoria o una carpeta.
                    </DialogDescription>
                </DialogHeader>

                <div className="mt-4 mb-4">
                    <Label htmlFor="aplicar-a" className="block text-sm font-medium text-white/70 mb-2">
                        Aplicar a
                    </Label>
                    <Select value={objetivo.tipo === "cerebro" ? "cerebro" : `${objetivo.tipo}:${objetivo.id}`} onValueChange={handleObjetivoChange}>
                        <SelectTrigger id="aplicar-a" className="w-full">
                            <SelectValue placeholder="Seleccionar ámbito" />
                        </SelectTrigger>
                        <SelectContent>
                            {opcionesObjetivo.map((op) => (
                                <SelectItem key={op.value} value={op.value}>
                                    {op.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <Tabs value={pestanaActiva} onValueChange={setPestanaActiva} className="w-full">
                    <TabsList className="grid w-full grid-cols-3 bg-black/20 p-1 rounded-xl border border-white/10">
                        <TabsTrigger value="medios" className="text-xs">Medios</TabsTrigger>
                        <TabsTrigger value="seguridad" className="text-xs">Seguridad y privacidad</TabsTrigger>
                        <TabsTrigger value="sync" className="text-xs">Vinculación y sincronización</TabsTrigger>
                    </TabsList>

                    <TabsContent value="medios" className="mt-4 max-h-[50vh] overflow-y-auto">
                        <AjustesMedios
                            cerebro={cerebro}
                            ajustes={ajustesLocales}
                            objetivo={objetivo}
                            onChange={handleCambio}
                        />
                    </TabsContent>

                    <TabsContent value="seguridad" className="mt-4 max-h-[50vh] overflow-y-auto">
                        <AjustesSeguridad
                            valor={ajustesObjetivo}
                            onCambio={handleCambio}
                            nivel={objetivo.tipo}
                        />
                    </TabsContent>

                    <TabsContent value="sync" className="mt-4 max-h-[50vh] overflow-y-auto">
                        <AjustesSync
                            valor={{ sync: ajustesObjetivo.sync ?? AJUSTES_POR_DEFECTO.sync }}
                            onCambio={handleCambio}
                            cerebro={configCerebro}
                        />
                    </TabsContent>
                </Tabs>

                <DialogFooter className="mt-6 border-t border-white/10 pt-4">
                    <div className="flex w-full justify-end gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={handleGuardar}>Guardar</Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}