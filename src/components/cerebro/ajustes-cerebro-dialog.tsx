"use client";

/** Ajustes del cerebro (§8, CB1013S): «Aplicar a» (cerebro, memoria o carpeta) + pestañas Medios,
 * Seguridad y privacidad y Vinculación y sincronización. Los cambios viven en un config local
 * (conAjustes, con la herencia de ajustes.ts) y se escriben con saveBrain; los destinos de memoria
 * del nivel cerebro se aplican al momento con setMemoryDestinations. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { saveBrain, type Brain } from "@/lib/brains/brains";
import { normalizeMemoryDestinations, setMemoryDestinations } from "@/lib/brains/memory-destinations";
import { listMemoryFiles } from "@/lib/cerebro/memory-files";
import { listNeurons, type Neuron } from "@/lib/neurons/neurons";
import { ajustesEfectivos, conAjustes, leerAjustes, type AjustesObjetivo } from "@/lib/cerebros/ajustes";
import { destinosDeMemorias, opcionesDeMedio, parcheDestinos } from "@/lib/cerebros/medios-puras";
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

type Objetivo = { tipo: "cerebro" } | { tipo: "memoria" | "carpeta"; id: string };
function objetivoDe(valor: string): Objetivo {
    if (valor === "cerebro") return { tipo: "cerebro" };
    const [tipo, ...resto] = valor.split(":");
    const id = resto.join(":");
    return (tipo === "memoria" || tipo === "carpeta") && id ? { tipo, id } : { tipo: "cerebro" };
}
/** Ids de las raíces de memoria del cerebro, guardadas en starseed.brain.<id>.memoryRoots. */
function leerCarpetas(brainId: string): string[] {
    try {
        const ids = JSON.parse(window.localStorage.getItem(`starseed.brain.${brainId}.memoryRoots`) ?? "[]") as unknown;
        return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string" && x !== "") : [];
    } catch { return []; }
}
const SELECTOR = "h-9 rounded-md border border-white/15 bg-black/40 px-2 text-sm text-white cursor-pointer";
const PESTANAS = [["medios", "Medios"], ["seguridad", "Seguridad y privacidad"], ["sync", "Vinculación y sincronización"]] as const;
export default function AjustesCerebroDialog({ open, onOpenChange, cerebro, onHecho }: AjustesCerebroDialogProps) {
    const [config, setConfig] = useState<Record<string, unknown>>(() => ({ ...(cerebro.config ?? {}) }));
    const [objetivoValor, setObjetivoValor] = useState("cerebro");
    const [cargo, setCargo] = useState<{ memorias: string[]; carpetas: string[]; neuronas: Neuron[] }>({ memorias: [], carpetas: [], neuronas: [] });
    const [estado, setEstado] = useState<{ guardando: boolean; aviso: string }>({ guardando: false, aviso: "" });
    const objetivo = useMemo(() => objetivoDe(objetivoValor), [objetivoValor]);
    const ajustes = useMemo(() => leerAjustes({ scope: cerebro.scope, config }), [cerebro.scope, config]);
    const efectivo = useMemo(() => ajustesEfectivos(ajustes, objetivo), [ajustes, objetivo]);
    const destinos = useMemo(() => destinosDeMemorias(config.memoryDestinations), [config]);
    const opciones = useMemo(() => opcionesDeMedio(cerebro.servers, cargo.neuronas), [cerebro.servers, cargo.neuronas]);
    const nota = [cerebro.servers.length === 0 ? "Sin servidores aún." : "", cargo.neuronas.length === 0 ? "Buscando neuronas…" : "", cargo.memorias.length === 0 ? "Buscando memorias…" : "", cargo.carpetas.length === 0 ? "Sin carpetas vinculadas." : ""].filter(Boolean).join(" ");

    useEffect(() => {
        if (!open) return;
        setConfig({ ...(cerebro.config ?? {}) });
        setObjetivoValor("cerebro");
        setEstado({ guardando: false, aviso: "" });
        setCargo((c) => ({ ...c, carpetas: leerCarpetas(cerebro.id), memorias: [], neuronas: [] }));
        listMemoryFiles(cerebro.id).then((fs) => setCargo((c) => ({ ...c, memorias: [...new Set(fs.map((f) => f.name))] })));
        listNeurons().then((ns) => setCargo((c) => ({ ...c, neuronas: ns })));
    }, [open, cerebro]);

    const avisar = useCallback((parcial: Partial<AjustesObjetivo>) => {
        setEstado((e) => ({ ...e, aviso: "" }));
        setConfig((c) => conAjustes(c ?? {}, objetivo, parcial));
    }, [objetivo]);
    const aplicarDestinos = useCallback(async (ids: string[]) => {
        if (objetivo.tipo !== "cerebro") { avisar({ medios: { ...efectivo.medios, almacenamiento: ids } }); return; }
        const guardado = await setMemoryDestinations(cerebro, parcheDestinos(normalizeMemoryDestinations(config.memoryDestinations), ids));
        if (!guardado) { setEstado((e) => ({ ...e, aviso: "No se pudieron guardar los destinos de memoria. Prueba de nuevo." })); return; }
        setConfig((c) => ({ ...c, memoryDestinations: guardado.config.memoryDestinations }));
        onHecho?.();
    }, [cerebro, config, efectivo.medios, objetivo, avisar, onHecho]);
    const guardar = useCallback(async () => {
        setEstado({ guardando: true, aviso: "" });
        const guardado = await saveBrain({ ...cerebro, config });
        if (!guardado) { setEstado({ guardando: false, aviso: "No se pudieron guardar los ajustes. Prueba de nuevo." }); return; }
        setEstado({ guardando: false, aviso: "" });
        onHecho?.();
        onOpenChange(false);
    }, [cerebro, config, onHecho, onOpenChange]);
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
                <DialogHeader>
                    <DialogTitle>Ajustes del cerebro · «{cerebro.name}»</DialogTitle>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-white">
                        <label htmlFor="ajustes-aplicar-a" className="cursor-pointer">Aplicar a</label>
                        <select id="ajustes-aplicar-a" className={SELECTOR} value={objetivoValor} onChange={(e) => { setObjetivoValor(e.target.value); setEstado((e2) => ({ ...e2, aviso: "" })); }}>
                            <option value="cerebro">Cerebro completo</option>
                            {cargo.memorias.length > 0 && cargo.memorias.map((n) => <option key={`memoria:${n}`} value={`memoria:${n}`}>Memoria · {n}</option>)}
                            {cargo.carpetas.length > 0 && cargo.carpetas.map((id) => <option key={`carpeta:${id}`} value={`carpeta:${id}`}>Carpeta · {id}</option>)}
                        </select>
                        <span className="text-xs text-white/55">{objetivo.tipo === "cerebro" ? "Los ajustes van al cerebro entero." : "Solo lo distinto del cerebro se guarda aparte; al leer pisa lo del cerebro."}</span>
                    </div>
                </DialogHeader>
                <Tabs defaultValue="medios" className="min-h-0 flex-1 overflow-y-auto pr-1">
                    <TabsList className="flex w-full flex-wrap items-center">
                        {PESTANAS.map(([id, texto]) => <TabsTrigger key={id} value={id} className="cursor-pointer">{texto}</TabsTrigger>)}
                    </TabsList>
                    <TabsContent value="medios" className="mt-3"><AjustesMedios valor={efectivo} onCambio={avisar} nivel={objetivo.tipo} opciones={opciones} destinos={destinos} onElegidos={(ids) => void aplicarDestinos(ids)} /></TabsContent>
                    <TabsContent value="seguridad" className="mt-3"><AjustesSeguridad valor={efectivo} onCambio={avisar} nivel={objetivo.tipo} /></TabsContent>
                    <TabsContent value="sync" className="mt-3"><AjustesSync valor={efectivo} onCambio={avisar} cerebro={cerebro} /></TabsContent>
                </Tabs>
                {nota && <p className="mt-1 text-xs text-white/50">{nota}</p>}
                <DialogFooter className="border-t border-white/10 pt-2">
                    {estado.aviso ? <p className="flex-1 text-xs leading-relaxed text-amber-300">{estado.aviso}</p>
                        : <p className="flex-1 text-xs leading-relaxed text-white/50">Los destinos del cerebro entero se aplican al momento; el resto se confirma con «Guardar».</p>}
                    <Button type="button" className="cursor-pointer" disabled={estado.guardando} onClick={() => void guardar()}>{estado.guardando ? "Guardando…" : "Guardar"}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
