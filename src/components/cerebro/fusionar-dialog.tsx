"use client";

/** «Fusionar» de cada cerebro (CB1013B–D, cerebros-fusion-telepatia.md §4): vista previa, copia de seguridad antes de escribir y fusión real. */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Brain } from "@/lib/brains/brains";
import { planFusion, utf8ByteLength, type PlanFusion } from "@/lib/cerebros/fusion";
import {
    aplicarFusion,
    copiaDeSeguridad,
    descargarCopia,
    leerParaFusion,
    type CopiaDeSeguridad,
    type ResultadoFusion,
} from "@/lib/cerebros/fusion-aplicar";

export interface FusionarDialogProps {
    open: boolean;
    onOpenChange: (abierto: boolean) => void;
    cerebro: Brain;
    cerebros: Brain[];
    onHecho?: () => void;
}

type Paso = "elegir" | "preparando" | "listo" | "aplicando" | "hecho";

const LO_QUE_HACE = { copiar: "se copia", anexar: "se le añaden secciones", omitir: "igual en el destino, se omite" } as const;

export default function FusionarDialog({ open, onOpenChange, cerebro, cerebros, onHecho }: FusionarDialogProps) {
    const otros = cerebros.filter((b) => b.id !== cerebro.id);
    const [elegidos, setElegidos] = useState<string[]>([]);
    const [quitar, setQuitar] = useState(true);
    const [paso, setPaso] = useState<Paso>("elegir");
    const [plan, setPlan] = useState<PlanFusion | null>(null);
    const [copia, setCopia] = useState<CopiaDeSeguridad | null>(null);
    const [resultado, setResultado] = useState<ResultadoFusion | null>(null);
    const [motivo, setMotivo] = useState("");

    const nombreDe = (id: string) => otros.find((b) => b.id === id)?.name ?? id;

    async function preparar() {
        setMotivo("");
        setPaso("preparando");
        const lectura = await leerParaFusion(cerebro.id, elegidos);
        if (!lectura.ok) {
            setMotivo(lectura.motivo);
            setPaso("elegir");
            return;
        }
        const fecha = new Date().toISOString().slice(0, 10);
        setPlan(planFusion({ destino: lectura.destino, origenes: lectura.origenes, archivos: lectura.archivos, prefs: lectura.prefs, fecha }));
        setCopia(copiaDeSeguridad(lectura, fecha));
        setPaso("listo");
    }

    async function fundir() {
        if (!plan || !copia) return;
        setPaso("aplicando");
        if (!descargarCopia(copia)) {
            setMotivo("No se pudo descargar la copia de seguridad en este aparato; así no se escribe nada.");
            setPaso("elegir");
            return;
        }
        const r = await aplicarFusion(plan, { destino: cerebro, origenIds: elegidos, quitarOrigenes: quitar });
        setResultado(r);
        setPaso("hecho");
        if (r.ok) onHecho?.();
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Fusionar · «{cerebro.name}»</DialogTitle>
                    <DialogDescription>Mezcla en este cerebro las memorias y configuraciones de los cerebros que elijas.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 text-sm text-white/80">
                    <div className="space-y-2">
                        <p className="font-semibold text-white">Cerebros que se mezclan</p>
                        {otros.length === 0 ? (
                            <p className="text-white/55">No hay otros cerebros en esta cuenta: no hay nada que fusionar.</p>
                        ) : (
                            otros.map((b) => (
                                <label key={b.id} className="flex cursor-pointer items-start gap-2">
                                    <Checkbox
                                        checked={elegidos.includes(b.id)}
                                        onCheckedChange={(v) => setElegidos((a) => (v ? [...a, b.id] : a.filter((x) => x !== b.id)))}
                                        className="mt-1"
                                    />
                                    <span>
                                        {b.name}
                                        <span className="block text-xs text-white/50">{b.id}</span>
                                    </span>
                                </label>
                            ))
                        )}
                    </div>
                    {plan && (paso === "listo" || paso === "aplicando") && (
                        <div className="rounded-xl border border-white/15 bg-black/20 p-3">
                            <p className="font-semibold text-white">Lo que entrará en este cerebro</p>
                            <p className="mt-1 text-white/70">
                                {plan.resumen.archivosNuevos} memoria nueva · {plan.resumen.archivosAnexados} con secciones añadidas · {plan.resumen.archivosOmitidos} sin cambios · {plan.resumen.bytes} bytes que entran de {elegidos.length} {elegidos.length === 1 ? "cerebro" : "cerebros"}.
                            </p>
                            <ul className="mt-2 space-y-1 text-xs text-white/70">
                                {plan.archivos.map((a) => (
                                    <li key={a.name}>
                                        «{a.name}»: {LO_QUE_HACE[a.accion]} · {utf8ByteLength(a.contenido)} bytes en el destino, {a.bytesQueEntran} entran de {a.desde.map(nombreDe).join(", ") || "—"}.
                                    </li>
                                ))}
                            </ul>
                            <label className="mt-3 flex cursor-pointer items-start gap-2">
                                <Checkbox checked={quitar} onCheckedChange={(v) => setQuitar(v === true)} className="mt-1" />
                                <span>Quitar los cerebros fusionados cuando termine</span>
                            </label>
                            {quitar && <p className="mt-1 text-xs text-white/50">Los que tengan selecciones no se borran: el diálogo lo avisará.</p>}
                        </div>
                    )}
                    {motivo && <p className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-amber-200">{motivo}</p>}
                    {paso === "hecho" && resultado && (
                        <div className="rounded-xl border border-white/15 bg-black/20 p-3">
                            <p className="font-semibold text-white">
                                {resultado.ok
                                    ? `Fusión aplicada: ${resultado.archivosEscritos} memorias guardadas, ${resultado.bytes} bytes añadidos.`
                                    : `No se aplicó la fusión: ${resultado.error ?? "fallo sin motivo conocido"}.`}
                            </p>
                            {(resultado.origenesQuitados.length > 0 || resultado.origenesConservados.length > 0) && (
                                <ul className="mt-2 space-y-1 text-xs text-white/70">
                                    {resultado.origenesQuitados.map((id) => (
                                        <li key={id}>«{nombreDe(id)}» se borró después de fusionar.</li>
                                    ))}
                                    {resultado.origenesConservados.map((o) => (
                                        <li key={o.id}>«{nombreDe(o.id)}» se conserva: {o.motivo}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                        {(paso === "elegir" || paso === "preparando") && (
                            <Button className="h-auto cursor-pointer whitespace-normal" onClick={preparar} disabled={elegidos.length === 0 || paso === "preparando"}>
                                {paso === "preparando" ? "Leyendo los cerebros…" : "Ver lo que se fusionará"}
                            </Button>
                        )}
                        {(paso === "listo" || paso === "aplicando") && (
                            <Button className="h-auto cursor-pointer whitespace-normal" onClick={fundir} disabled={paso === "aplicando"}>
                                {paso === "aplicando" ? "Fusionando…" : "Fusionar (descarga primero la copia)"}
                            </Button>
                        )}
                        {(paso === "listo" || paso === "preparando") && (
                            <Button variant="ghost" className="h-auto cursor-pointer whitespace-normal" onClick={() => { setPlan(null); setCopia(null); setPaso("elegir"); }}>
                                Volver
                            </Button>
                        )}
                        {paso === "hecho" && (
                            <Button variant="ghost" className="h-auto cursor-pointer whitespace-normal" onClick={() => (resultado?.ok ? onOpenChange(false) : setPaso("elegir"))}>
                                {resultado?.ok ? "Cerrar" : "Volver"}
                            </Button>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
