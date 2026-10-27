"use client";

/** Pestaña Medios de los ajustes del cerebro: capacidades y almacenamiento. */
import React from "react";
import type { Brain } from "@/lib/brains/brains";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { getMemoryDestinations, setMemoryDestinations, type MemoryDestinationsConfig, type ExternalMemoryDestination } from "@/lib/brains/memory-destinations";
import { listNeurons, type Neuron } from "@/lib/neurons/neurons";
import { CAPACIDADES, type Capacidad, APLICACION, type AjustesCerebro, type AjustesObjetivo, ajustesEfectivos } from "@/lib/cerebros/ajustes";
import { destinosDe, type Dato, type DestinoAlmacen } from "@/lib/malla/cristal/destinos-almacen";

interface AjustesMediosProps {
    cerebro: Brain;
    ajustes: AjustesCerebro;
    objetivo: { tipo: "cerebro" | "memoria" | "carpeta"; id: string };
    onChange: (parcial: Partial<AjustesObjetivo>) => void;
}

function EtiquetaAplicacion(clave: keyof typeof APLICACION) {
    const estado = APLICACION[clave];
    return (
        <span className={cn(
            "text-[11px] px-2 py-0.5 rounded border",
            estado === "se-aplica" 
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" 
                : "bg-amber-500/15 text-amber-300 border-amber-500/30"
        )}>
            {estado === "se-aplica" ? "Se aplica ya" : "Solo se guarda por ahora"}
        </span>
    );
}

function SelectorCapacidad({ 
    capacidad, 
    cerebro, 
    neuronas, 
    valorActual, 
    onChange,
    aplicacionClave 
}: { 
    capacidad: Capacidad; 
    cerebro: Brain; 
    neuronas: Neuron[]; 
    valorActual: string; 
    onChange: (cap: Capacidad, valor: string) => void;
    aplicacionClave: keyof typeof APLICACION;
}) {
    const opciones = React.useMemo(() => {
        const ops = [
            { value: "auto", label: "Auto (el sistema elige)" },
        ];
        for (const s of cerebro.servers || []) {
            ops.push({ value: `server:${s.id}`, label: `Servidor: ${s.name} (${s.kind})` });
        }
        for (const n of neuronas) {
            if (n.capabilities?.ollama || n.capabilities?.lmstudio || n.capabilities?.webgpu) {
                ops.push({ value: `neurona:${n.id}`, label: `Neurona: ${n.name}` });
            }
        }
        return ops;
    }, [cerebro.servers, neuronas]);

    return (
        <div className="grid gap-2 md:grid-cols-[1fr_auto] items-center">
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium text-white/90 min-w-[100px]">{CAPACIDADES[capacidad]}</Label>
                    <EtiquetaAplicacion clave={aplicacionClave} />
                </div>
                <Select value={valorActual} onValueChange={(v) => onChange(capacidad, v)}>
                    <SelectTrigger className="w-full md:w-[280px]">
                        <SelectValue placeholder="Auto" />
                    </SelectTrigger>
                    <SelectContent>
                        {opciones.map((op) => (
                            <SelectItem key={op.value} value={op.value}>
                                {op.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}

function SeccionAlmacenamiento({ 
    cerebro, 
    ajustes, 
    objetivo, 
    onChange 
}: { 
    cerebro: Brain; 
    ajustes: AjustesCerebro; 
    objetivo: { tipo: "cerebro" | "memoria" | "carpeta"; id: string };
    onChange: (parcial: Partial<AjustesObjetivo>) => void;
}) {
    const [destinos, setDestinos] = React.useState<MemoryDestinationsConfig>(() => getMemoryDestinations(cerebro));
    const [neuronas, setNeuronas] = React.useState<Neuron[]>([]);

    React.useEffect(() => {
        listNeurons().then(setNeuronas);
    }, []);

    const efectivos = ajustesEfectivos(ajustes, objetivo);
    const almacenamientoActual = efectivos.medios?.almacenamiento ?? [];

    const handleToggleDestino = async (key: keyof MemoryDestinationsConfig, value: unknown) => {
        const nuevo = { ...destinos, [key]: value } as MemoryDestinationsConfig;
        setDestinos(nuevo);
        
        if (objetivo.tipo === "cerebro") {
            const actualizado = await setMemoryDestinations(cerebro, { [key]: value });
            if (actualizado) {
                onChange({ medios: { ...efectivos.medios, almacenamiento: getMemoryDestinations(actualizado).external.map(e => e.id) } });
            }
        } else {
            const idsExternos = nuevo.external.map(e => e.id);
            onChange({ medios: { ...efectivos.medios, almacenamiento: idsExternos } });
        }
    };

    const destinosExplicados = React.useMemo(() => {
        const disponibles: DestinoAlmacen[] = [
            { id: "local", tipo: "aparato", motor: "local", publico: false },
            { id: "starseed", tipo: "cerebro", motor: "starseed", publico: false },
        ];
        for (const ext of destinos.external) {
            disponibles.push({ id: ext.id, tipo: "servidor", motor: "external", publico: true, cerebroId: cerebro.id });
        }
        if (destinos.p2p.enabled) {
            disponibles.push({ id: "p2p", tipo: "aparato", motor: "p2p-syncthing", publico: false });
        }

        const motoresReales = ["local", "starseed", "external", "p2p-syncthing"];
        const dato: Dato = { clase: "privado" };
        const { guardar, descartados } = destinosDe(dato, {
            politicaContexto: disponibles.map(d => d.id),
            disponibles,
            motoresReales,
        });

        return { guardar, descartados };
    }, [destinos, cerebro.id]);

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <Label className="text-sm font-medium text-white/90">Almacenamiento</Label>
                <EtiquetaAplicacion clave="medios.almacenamiento" />
            </div>

            <div className="space-y-3 pl-4 border-l border-white/10">
                <div className="flex items-center gap-2">
                    <Switch
                        checked={destinos.starseed.enabled}
                        onCheckedChange={(c) => handleToggleDestino("starseed", { enabled: c })}
                    />
                    <div className="flex-1">
                        <p className="text-sm font-medium text-white/90">Servidor StarSeed</p>
                        <p className="text-xs text-white/50">
                            {destinosExplicados.guardar.some(d => d.id === "starseed") 
                                ? "Datos → StarSeed (manifiesto en entity_state, RLS por propietario)"
                                : "No disponible: " + (destinosExplicados.descartados.find(d => d.id === "starseed")?.motivo ?? "sin motor")}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Switch
                        checked={destinos.p2p.enabled}
                        onCheckedChange={(c) => handleToggleDestino("p2p", { ...destinos.p2p, enabled: c })}
                    />
                    <div className="flex-1">
                        <p className="text-sm font-medium text-white/90">P2P (Syncthing propio)</p>
                        <p className="text-xs text-white/50">
                            {destinosExplicados.guardar.some(d => d.id === "p2p") 
                                ? `Datos → Syncthing (folder: ${destinos.p2p.folderId ?? "por configurar"})`
                                : "No disponible: " + (destinosExplicados.descartados.find(d => d.id === "p2p")?.motivo ?? "sin motor")}
                        </p>
                    </div>
                </div>

                {destinos.external.map((ext, idx) => (
                    <div key={ext.id} className="flex items-center gap-2">
                        <Switch
                            checked={almacenamientoActual.includes(ext.id)}
                            onCheckedChange={(c) => {
                                const nuevos = c 
                                    ? [...almacenamientoActual, ext.id] 
                                    : almacenamientoActual.filter(id => id !== ext.id);
                                onChange({ medios: { ...efectivos.medios, almacenamiento: nuevos } });
                            }}
                        />
                        <div className="flex-1">
                            <p className="text-sm font-medium text-white/90">{ext.label}</p>
                            <p className="text-xs text-white/50">
                                {destinosExplicados.guardar.some(d => d.id === ext.id)
                                    ? `Datos → Servidor externo (${ext.url})`
                                    : "No disponible: " + (destinosExplicados.descartados.find(d => d.id === ext.id)?.motivo ?? "sin motor")}
                            </p>
                        </div>
                    </div>
                ))}

                <div className="flex items-center gap-2 text-white/60">
                    <span className="text-xs">Local (este equipo) — siempre activo</span>
                </div>
            </div>
        </div>
    );
}

export function AjustesMedios({ cerebro, ajustes, objetivo, onChange }: AjustesMediosProps) {
    const [neuronas, setNeuronas] = React.useState<Neuron[]>([]);
    const [capacidades, setCapacidades] = React.useState<Partial<Record<Capacidad, string>>>({});

    React.useEffect(() => {
        listNeurons().then(setNeuronas);
    }, []);

    React.useEffect(() => {
        const efectivos = ajustesEfectivos(ajustes, objetivo);
        setCapacidades(efectivos.medios?.capacidades ?? {});
    }, [ajustes, objetivo]);

    const handleCapacidadChange = (cap: Capacidad, valor: string) => {
        const nuevas = { ...capacidades, [cap]: valor };
        setCapacidades(nuevas);
        const efectivos = ajustesEfectivos(ajustes, objetivo);
        onChange({ medios: { capacidades: nuevas, almacenamiento: efectivos.medios?.almacenamiento ?? [] } });
    };

    return (
        <div className="space-y-6">
            <section className="space-y-3">
                <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wide">Capacidades</h3>
                <p className="text-xs text-white/50">
                    Para cada capacidad, elige qué servidor o neurona la ejecuta. «Auto» deja que el sistema decida según disponibilidad.
                </p>
                <div className="space-y-3">
                    {(Object.keys(CAPACIDADES) as Capacidad[]).map((cap) => (
                        <SelectorCapacidad
                            key={cap}
                            capacidad={cap}
                            cerebro={cerebro}
                            neuronas={neuronas}
                            valorActual={capacidades[cap] ?? "auto"}
                            onChange={handleCapacidadChange}
                            aplicacionClave="medios.capacidades"
                        />
                    ))}
                </div>
            </section>

            <Separator />

            <section className="space-y-3">
                <SeccionAlmacenamiento
                    cerebro={cerebro}
                    ajustes={ajustes}
                    objetivo={objetivo}
                    onChange={onChange}
                />
            </section>
        </div>
    );
}