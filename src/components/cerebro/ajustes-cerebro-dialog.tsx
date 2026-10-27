"use client";

import { useEffect, useState } from "react";
import type { Brain } from "@/lib/brains/brains";
import type { MemoryFile } from "@/lib/cerebro/memory-files";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AjustesMedios } from "@/components/cerebro/ajustes-medios";
import { AjustesSeguridad } from "@/components/cerebro/ajustes-seguridad";
import { AjustesSync } from "@/components/cerebro/ajustes-sync";
import { leerAjustes, conAjustes, type AjustesCerebro } from "@/lib/cerebros/ajustes";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { saveBrain } from "@/lib/brains/brains";
import { listMemoryFiles } from "@/lib/cerebro/memory-files";

export interface AjustesCerebroDialogProps {
    open: boolean;
    onOpenChange: (abierto: boolean) => void;
    cerebro: Brain;
    cerebros: Brain[];
    onHecho?: () => void;
}

export default function AjustesCerebroDialog({ open, onOpenChange, cerebro, onHecho }: AjustesCerebroDialogProps) {
    const [objetivo, setObjetivo] = useState<{ tipo: "cerebro" } | { tipo: "memoria" | "carpeta"; id: string }>({ tipo: "cerebro" });
    const [configLocal, setConfigLocal] = useState(cerebro.config || {});
    const [memorias, setMemorias] = useState<MemoryFile[]>([]);
    const [carpetas, setCarpetas] = useState<string[]>([]);

    useEffect(() => {
        listMemoryFiles(cerebro.id).then(setMemorias);
        // Carpetas: IDs de memoryRoots guardados en starseed.brain.<id>.memoryRoots
        try {
            const key = `starseed.brain.${cerebro.id}.memoryRoots`;
            const stored = localStorage.getItem(key);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) setCarpetas(parsed);
            }
        } catch { /* noop */ }
    }, [cerebro.id]);

    // Helper para obtener el nivel de ajuste actual
    const getNivel = () => {
        if (objetivo.tipo === "cerebro") return "cerebro";
        return objetivo.tipo === "memoria" ? "memoria" : "carpeta";
    };

    const ajustesActuales = leerAjustes({ ...cerebro, config: configLocal });
    const valor = objetivo.tipo === "cerebro" 
        ? ajustesActuales.cerebro 
        : (objetivo.tipo === "memoria" 
            ? { ...ajustesActuales.cerebro, ...(ajustesActuales.memorias[objetivo.id] ?? {}) }
            : { ...ajustesActuales.cerebro, ...(ajustesActuales.carpetas[objetivo.id] ?? {}) }
        );

    const onCambio = (parcial: any) => {
        const nuevoConfig = conAjustes(configLocal, objetivo, parcial);
        setConfigLocal(nuevoConfig);
    };

    const handleGuardar = async () => {
        const guardado = await saveBrain({ ...cerebro, config: configLocal });
        if (guardado) {
            toast.success("Ajustes guardados correctamente");
            onHecho?.();
            onOpenChange(false);
        } else {
            toast.error("No se pudieron guardar los ajustes");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Ajustes del cerebro · «{cerebro.name}»</DialogTitle>
                    <DialogDescription>Configura los medios, seguridad, privacidad, vinculación y sincronización.</DialogDescription>
                </DialogHeader>

                <div className="flex items-center gap-2 mb-4">
                    <span className="text-sm font-medium text-white/70">Aplicar a:</span>
                    <Select value={objetivo.tipo === "cerebro" ? "cerebro" : `${objetivo.tipo}:${objetivo.id}`} onValueChange={(v) => {
                        if (v === "cerebro") setObjetivo({ tipo: "cerebro" });
                        else {
                            const [tipo, id] = v.split(":");
                            setObjetivo({ tipo: tipo as "memoria" | "carpeta", id });
                        }
                    }}>
                        <SelectTrigger className="w-auto min-w-[200px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="cerebro">Cerebro completo</SelectItem>
                            {memorias.length > 0 && (
                                <>
                                    <SelectItem disabled value="sep-memorias">────── Memorias ──────</SelectItem>
                                    {memorias.map(m => (
                                        <SelectItem key={m.id} value={`memoria:${m.id}`}>{m.name}</SelectItem>
                                    ))}
                                </>
                            )}
                            {carpetas.length > 0 && (
                                <>
                                    <SelectItem disabled value="sep-carpetas">────── Carpetas ──────</SelectItem>
                                    {carpetas.map(id => (
                                        <SelectItem key={id} value={`carpeta:${id}`}>{id}</SelectItem>
                                    ))}
                                </>
                            )}
                        </SelectContent>
                    </Select>
                </div>

                <Tabs defaultValue="medios" className="flex-1 min-h-0 flex flex-col">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="medios">Medios</TabsTrigger>
                        <TabsTrigger value="seguridad">Seguridad y privacidad</TabsTrigger>
                        <TabsTrigger value="sync">Vinculación y sincronización</TabsTrigger>
                    </TabsList>
                    
                    <div className="flex-1 overflow-y-auto mt-4 pr-2">
                        <TabsContent value="medios">
                            <AjustesMedios valor={valor} onCambio={onCambio} cerebro={cerebro} />
                        </TabsContent>
                        <TabsContent value="seguridad">
                            <AjustesSeguridad valor={valor} onCambio={onCambio} nivel={getNivel()} />
                        </TabsContent>
                        <TabsContent value="sync">
                            <AjustesSync valor={valor} onCambio={onCambio} cerebro={{ config: configLocal }} />
                        </TabsContent>
                    </div>
                </Tabs>

                <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-white/10">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={handleGuardar}>Guardar cambios</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
