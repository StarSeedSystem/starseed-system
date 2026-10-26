"use client";

/** «Fusionar» de cada cerebro (§4): vista previa con medidas reales, copia de seguridad y solo entonces escribe. */

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Brain } from "@/lib/brains/brains";
import { planFusion, type PlanFusion } from "@/lib/cerebros/fusion";
import { pestanaDeCerebro } from "@/lib/cerebros/pestanas";
import { aplicarFusion, copiaDeSeguridad, descargarCopia, leerParaFusion, type CopiaDeSeguridad } from "@/lib/cerebros/fusion-aplicar";

export interface FusionarDialogProps { open: boolean; onOpenChange: (abierto: boolean) => void; cerebro: Brain; cerebros: Brain[]; onHecho?: () => void; }
type Paso = "elegir" | "preparando" | "listo" | "aplicando";
const LISTAS = ["vaults", "backends", "personalities", "runtimes", "tokens", "memories", "connections"] as const;
const kb = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`);
const fechaDe = (iso?: string | null) => { const t = iso ? Date.parse(iso) : NaN; return Number.isNaN(t) ? "sin fecha" : new Date(t).toLocaleDateString("es", { dateStyle: "medium" }); };
function accionEnPalabras(a: PlanFusion["archivos"][number]): string {
    if (a.accion !== "anexar") return a.accion === "copiar" ? "copiar" : "ya estaba";
    const n = (a.contenido.match(/^## Fusionado de /gm) ?? []).length;
    return n === 0 ? "ya estaba" : `añadir ${n} ${n === 1 ? "sección" : "secciones"}`;
}
function cuentas(plan: PlanFusion): { includes: number; servidores: number; preferencias: number } {
    let includes = Array.isArray(plan.includes.permissions) ? plan.includes.permissions.length : 0;
    for (const clave of LISTAS) includes += plan.includes[clave].length;
    return { includes, servidores: plan.servers.length, preferencias: Object.keys(plan.prefs).length };
}
export default function FusionarDialog({ open, onOpenChange, cerebro, cerebros, onHecho }: FusionarDialogProps) {
    const otros = cerebros.filter((b) => b.id !== cerebro.id);
    const [elegidos, setElegidos] = useState<string[]>([]);
    const [quitar, setQuitar] = useState(true);
    const [paso, setPaso] = useState<Paso>("elegir");
    const [plan, setPlan] = useState<PlanFusion | null>(null);
    const [copia, setCopia] = useState<CopiaDeSeguridad | null>(null);
    const [error, setError] = useState("");
    const [sinCopia, setSinCopia] = useState(false);
    const c = plan ? cuentas(plan) : null;
    const nombreDe = (id: string) => otros.find((b) => b.id === id)?.name ?? id;
    function reiniciar() {
        setElegidos([]); setQuitar(true); setPaso("elegir"); setPlan(null); setCopia(null); setError(""); setSinCopia(false);
    }
    async function preparar() {
        setError(""); setPaso("preparando");
        const lectura = await leerParaFusion(cerebro.id, elegidos);
        if (!lectura.ok) { setError(lectura.motivo); setPaso("elegir"); return; }
        const hoy = new Date().toISOString().slice(0, 10);
        setPlan(planFusion({ destino: lectura.destino, origenes: lectura.origenes, archivos: lectura.archivos, prefs: lectura.prefs, fecha: hoy }));
        setCopia(copiaDeSeguridad(lectura, hoy)); setPaso("listo");
    }

    async function fundir(forzar = false) {
        if (!plan || !copia) return;
        setError("");
        if (!forzar && !descargarCopia(copia)) {
            setSinCopia(true); setError("No se pudo descargar la copia de seguridad en este aparato. No se ha escrito nada.");
            return;
        }
        setSinCopia(false); setPaso("aplicando");
        const r = await aplicarFusion(plan, { destino: cerebro, origenIds: elegidos, quitarOrigenes: quitar });
        if (!r.ok) {
            setError(r.error ?? "No se aplicó la fusión."); setPaso("listo");
            toast.error("No se pudo fusionar", { description: r.error ?? "Fallo sin motivo conocido." });
            return;
        }
        const conservados = r.origenesConservados.map((o) => `«${nombreDe(o.id)}»: ${o.motivo}`).join(" · ");
        toast.success(`Fusión aplicada: ${r.archivosEscritos} ${r.archivosEscritos === 1 ? "memoria guardada" : "memorias guardadas"}, ${kb(r.bytes)} añadidos.`, {
            description: conservados || "Ningún origen quedó por conservar.",
        });
        onHecho?.(); reiniciar(); onOpenChange(false);
    }

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) reiniciar(); onOpenChange(v); }}>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Fusionar · «{cerebro.name}»</DialogTitle>
                    <DialogDescription>Se mezclarán en «{cerebro.name}» todas sus memorias y configuraciones.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 text-sm text-white/80">
                    <div className="space-y-2">
                        {otros.length === 0 ? <p className="text-white/55">No hay otros cerebros en esta cuenta: no hay nada que fusionar.</p> : otros.map((b) => (
                            <label key={b.id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 p-2">
                                <Checkbox checked={elegidos.includes(b.id)} onCheckedChange={(v) => setElegidos((a) => (v ? [...a, b.id] : a.filter((x) => x !== b.id)))} className="mt-1" />
                                <span className="min-w-0 flex-1"><span className="block font-medium text-white">{b.name}</span><span className="block text-xs text-white/55">{pestanaDeCerebro(b) === "publicos" ? "Público" : "Privado"} · creado el {fechaDe(b.created_at)}</span></span>
                            </label>
                        ))}
                    </div>
                    {plan && c && paso !== "elegir" && paso !== "preparando" && (
                        <div className="space-y-2 rounded-xl border border-white/15 bg-black/20 p-3">
                            <p className="font-semibold text-white">Vista previa: lo que entrará en «{cerebro.name}»</p>
                            <p className="text-white/70">{plan.resumen.archivosNuevos} memoria nueva · {plan.resumen.archivosAnexados} con secciones añadidas · {plan.resumen.archivosOmitidos} ya estaban · {kb(plan.resumen.bytes)} entran.</p>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead><tr><th className="py-1 pr-2">Archivo</th><th className="py-1 pr-2">Qué pasa</th><th className="py-1 pr-2">Entra</th><th className="py-1">Desde</th></tr></thead>
                                    <tbody>{plan.archivos.map((a) => <tr key={a.name} className="border-t border-white/10"><td className="break-words py-1 pr-2">{a.name}</td><td className="py-1 pr-2">{accionEnPalabras(a)}</td><td className="whitespace-nowrap py-1 pr-2">{kb(a.bytesQueEntran)}</td><td className="break-words py-1">{a.desde.map(nombreDe).join(", ") || "—"}</td></tr>)}</tbody>
                                </table>
                            </div>
                            <p className="text-white/70">Includes: {c.includes} · Servidores: {c.servidores} · Preferencias: {c.preferencias}</p>
                            <label className="flex cursor-pointer items-start gap-2">
                                <Checkbox checked={quitar} onCheckedChange={(v) => setQuitar(v === true)} className="mt-1" />
                                <span>Quitar los cerebros fusionados después</span>
                            </label>
                        </div>
                    )}
                    {error && <p role="alert" className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-amber-200">{error}</p>}
                    <div className="flex flex-wrap gap-2">
                        {(paso === "elegir" || paso === "preparando") && <Button className="h-auto cursor-pointer whitespace-normal" onClick={() => void preparar()} disabled={elegidos.length === 0 || paso === "preparando"}>{paso === "preparando" ? "Leyendo los cerebros…" : "Ver vista previa"}</Button>}
                        {(paso === "listo" || paso === "aplicando") && <>
                            <Button className="h-auto cursor-pointer whitespace-normal" onClick={() => void fundir()} disabled={paso === "aplicando"}>{paso === "aplicando" ? "Fusionando…" : "Fusionar"}</Button>
                            {sinCopia && <Button variant="outline" className="h-auto cursor-pointer whitespace-normal" onClick={() => void fundir(true)}>Seguir sin copia descargada</Button>}
                            <Button variant="ghost" className="h-auto cursor-pointer whitespace-normal" disabled={paso === "aplicando"} onClick={() => { setPlan(null); setCopia(null); setError(""); setSinCopia(false); setPaso("elegir"); }}>Volver</Button>
                        </>}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
