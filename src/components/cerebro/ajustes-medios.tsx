"use client";

import { useEffect, useState, useMemo } from "react";
import type { Brain } from "@/lib/brains/brains";
import { CAPACIDADES, APLICACION, type AjustesObjetivo } from "@/lib/cerebros/ajustes";
import { listNeurons, type Neuron } from "@/lib/neurons/neurons";
import { getMemoryDestinations, setMemoryDestinations } from "@/lib/brains/memory-destinations";
import { destinosDe } from "@/lib/malla/cristal/destinos-almacen";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MarcaAplicacion } from "@/components/cerebro/ajustes-seguridad";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AjustesMediosProps {
    valor: AjustesObjetivo;
    onCambio: (parcial: Partial<AjustesObjetivo>) => void;
    cerebro: Brain;
}

export function AjustesMedios({ valor, onCambio, cerebro }: AjustesMediosProps) {
    const [neuronas, setNeurons] = useState<Neuron[]>([]);
    
    useEffect(() => {
        listNeurons().then(setNeurons);
    }, []);

    const servidoresDisponibles = useMemo(() => {
        const base = [{ id: "auto", nombre: "Automático (mejor disponible)" }];
        
        // Servidores del cerebro
        (cerebro.servers || []).forEach(s => {
            base.push({ id: s.id, nombre: `Servidor: ${s.name}` });
        });

        // Neuronas
        neuronas.forEach(n => {
            base.push({ id: n.id, nombre: `Neurona: ${n.name}${n.isThisDevice ? ' (este aparato)' : ''}` });
        });

        return base;
    }, [cerebro.servers, neuronas]);

    const handleCapacidadChange = (cap: string, serverId: string) => {
        const caps = { ...(valor.medios.capacidades || {}) };
        if (serverId === "auto") {
            delete (caps as any)[cap];
        } else {
            (caps as any)[cap] = serverId;
        }
        onCambio({ medios: { ...valor.medios, capacidades: caps } });
    };

    const destinosMemoria = useMemo(() => {
        const d = getMemoryDestinations(cerebro);
        const base = [
            { id: "local", label: "Local", icon: "💻", enabled: d.local.enabled },
            { id: "starseed", label: "StarSeed", icon: "✨", enabled: d.starseed.enabled },
            { id: "p2p", label: "P2P (Syncthing)", icon: "🔄", enabled: d.p2p.enabled }
        ];
        
        d.external.forEach(ext => {
            base.push({ id: ext.id, label: ext.label, icon: "🌐", enabled: true });
        });

        return base;
    }, [cerebro]);

    // Simulación de destinosDe si encaja la firma para explicar el almacenamiento
    const explicacionDestinos = useMemo(() => {
        const disponibles = destinosMemoria.map(d => ({
            id: d.id,
            tipo: (d.id === "local" ? "aparato" : (d.id === "starseed" ? "servidor" : "servidor")) as any,
            motor: d.id,
            publico: false
        }));

        try {
            const resultado = destinosDe({ clase: 'privado' }, {
                politicaContexto: valor.medios.almacenamiento,
                disponibles: disponibles,
                motoresReales: ["local", "starseed", "p2p", ...disponibles.map(d => d.id)]
            });
            return resultado.guardar;
        } catch (e) {
            return [];
        }
    }, [destinosMemoria, valor.medios.almacenamiento]);

    const handleAlmacenamientoChange = async (nuevosDestinos: string[]) => {
        onCambio({ medios: { ...valor.medios, almacenamiento: nuevosDestinos } });
        // A nivel cerebro, se aplica de verdad con setMemoryDestinations
        try {
            const d = getMemoryDestinations(cerebro);
            const next: any = {
                local: { enabled: true },
                starseed: { enabled: d.starseed.enabled },
                external: d.external,
                p2p: { enabled: d.p2p.enabled, folderId: d.p2p.folderId, label: d.p2p.label }
            };
            
            if (!nuevosDestinos.includes("starseed")) next.starseed.enabled = false;
            if (!nuevosDestinos.includes("p2p")) next.p2p.enabled = false;
            
            const externalFiltrados = d.external.filter(e => nuevosDestinos.includes(e.id));
            next.external = externalFiltrados;
            
            await setMemoryDestinations(cerebro, next);
        } catch (e) {
            console.warn("No se pudo aplicar almacenamiento:", e);
        }
    };

    return (
        <div className="space-y-6 text-white">
            <section className="space-y-4">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">Capacidades</h3>
                    <MarcaAplicacion estado={APLICACION["medios.capacidades"]} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(CAPACIDADES).map(([id, label]) => (
                        <div key={id} className="space-y-1.5">
                            <label className="text-xs text-white/60 px-1">{label}</label>
                            <Select 
                                value={(valor.medios.capacidades as any)[id] || "auto"} 
                                onValueChange={(v) => handleCapacidadChange(id, v)}
                            >
                                <SelectTrigger className="bg-black/40 border-white/15 h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {servidoresDisponibles.map(s => (
                                        <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    ))}
                </div>
            </section>

            <section className="space-y-4 pt-4 border-t border-white/10">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">Almacenamiento</h3>
                    <MarcaAplicacion estado={APLICACION["medios.almacenamiento"]} />
                </div>
                <p className="text-xs text-white/60 leading-relaxed">
                    Elige los destinos donde se guardará la información de este cerebro.
                </p>
                <div className="flex flex-wrap gap-2">
                    {destinosMemoria.map(d => {
                        const activo = valor.medios.almacenamiento.includes(d.id);
                        return (
                            <Button
                                key={d.id}
                                variant={activo ? "default" : "outline"}
                                size="sm"
                                className={cn(
                                    "h-auto py-1.5 px-3 gap-2 whitespace-normal text-left",
                                    !d.enabled && "opacity-50 cursor-not-allowed"
                                )}
                                onClick={() => {
                                    if (!d.enabled) return;
                                    const next = activo 
                                        ? valor.medios.almacenamiento.filter(id => id !== d.id)
                                        : [...valor.medios.almacenamiento, d.id];
                                    handleAlmacenamientoChange(next);
                                }}
                            >
                                <span className="text-base">{d.icon}</span>
                                <span>{d.label}</span>
                            </Button>
                        );
                    })}
                </div>
                {explicacionDestinos.length > 0 && (
                    <div className="mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                        <p className="text-[11px] text-emerald-200/80 font-medium mb-1 uppercase tracking-wider">Flujo de datos:</p>
                        <ul className="text-xs text-emerald-100/70 space-y-1">
                            {explicacionDestinos.map(d => (
                                <li key={d.id}>• Sincronizando con {d.id === "local" ? "este aparato" : d.id}...</li>
                            ))}
                        </ul>
                    </div>
                )}
            </section>
        </div>
    );
}
