"use client";

/** «Fusionar» de cada cerebro (CB1013B–D, cerebros-fusion-telepatia.md §4): vista previa, copia de seguridad antes de escribir y fusión real. */

import { useState } from "react";
import { Loader2, Merge } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Brain } from "@/lib/brains/brains";
import { planFusion, type PlanFusion } from "@/lib/cerebros/fusion";
import { pestanaDeCerebro } from "@/lib/cerebros/pestanas";
import {
    aplicarFusion,
    copiaDeSeguridad,
    descargarCopia,
    leerParaFusion,
    type CopiaDeSeguridad,
    type LecturaFusion,
    type ResultadoFusion,
} from "@/lib/cerebros/fusion-aplicar";

export interface FusionarDialogProps {
    open: boolean;
    onOpenChange: (abierto: boolean) => void;
    cerebro: Brain;
    cerebros: Brain[];
    onHecho?: () => void;
}

type Paso = "elegir" | "preparando" | "listo" | "aplicando" | "sin-copia" | "hecho";

const ETIQUETA_PESTANA = { privados: "Privado", publicos: "Público" } as const;

function fechaLegible(iso: string | undefined): string {
    if (!iso) return "sin medida";
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return "sin medida";
    return new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(new Date(t));
}

function kb(bytes: number): string {
    return `${(bytes / 1024).toFixed(1).replace(".", ",")} KB`;
}

function cuentaSecciones(contenido: string): number {
    return (contenido.match(/^## Fusionado de «/gm) ?? []).length;
}

function seccionesAnadidas(contenido: string, previo: string | null): number {
    return Math.max(0, cuentaSecciones(contenido) - cuentaSecciones(previo ?? ""));
}

function totalIncludes(plan: PlanFusion): number {
    const i = plan.includes;
    const listas =
        i.vaults.length + i.backends.length + i.personalities.length + i.runtimes.length +
        i.tokens.length + i.memories.length + i.connections.length;
    const permisos = Array.isArray(i.permissions) ? i.permissions.length : Object.keys(i.permissions ?? {}).length;
    return listas + permisos;
}

export default function FusionarDialog({ open, onOpenChange, cerebro, cerebros, onHecho }: FusionarDialogProps) {
    const otros = cerebros.filter((b) => b.id !== cerebro.id);
    const [elegidos, setElegidos] = useState<string[]>([]);
    const [quitar, setQuitar] = useState(true);
    const [paso, setPaso] = useState<Paso>("elegir");
    const [plan, setPlan] = useState<PlanFusion | null>(null);
    const [copia, setCopia] = useState<CopiaDeSeguridad | null>(null);
    const [lectura, setLectura] = useState<LecturaFusion | null>(null);
    const [resultado, setResultado] = useState<ResultadoFusion | null>(null);
    const [motivo, setMotivo] = useState("");

    const nombreDe = (id: string) => otros.find((b) => b.id === id)?.name ?? id;
    const previoDe = (nombre: string): string | null => {
        if (!lectura || !lectura.ok) return null;
        return lectura.archivos.find((a) => a.brain_id === lectura.destino.id && a.name === nombre)?.content ?? null;
    };

    async function preparar() {
        setMotivo("");
        setResultado(null);
        setPaso("preparando");
        const datos = await leerParaFusion(cerebro.id, elegidos);
        if (!datos.ok) {
            setLectura(null);
            setPlan(null);
            setCopia(null);
            setMotivo(datos.motivo);
            setPaso("elegir");
            return;
        }
        const fecha = new Date().toISOString().slice(0, 10);
        setLectura(datos);
        setPlan(planFusion({ destino: datos.destino, origenes: datos.origenes, archivos: datos.archivos, prefs: datos.prefs, fecha }));
        setCopia(copiaDeSeguridad(datos, fecha));
        setPaso("listo");
    }

    async function aplicar() {
        if (!plan) return;
        setMotivo("");
        setPaso("aplicando");
        const r = await aplicarFusion(plan, { destino: cerebro, origenIds: elegidos, quitarOrigenes: quitar });
        setResultado(r);
        setPaso("hecho");
        if (!r.ok) {
            toast.error("No se aplicó la fusión", { description: r.error ?? "Fallo sin motivo conocido." });
            return;
        }
        const conservados = r.origenesConservados.map((o) => `«${nombreDe(o.id)}»: ${o.motivo}`).join(" · ");
        toast.success(`Fusión aplicada en «${cerebro.name}»`, {
            description: `${r.archivosEscritos} memorias guardadas · ${r.bytes} bytes añadidos.${conservados ? ` Se conservan: ${conservados}.` : ""}`,
        });
        onHecho?.();
        onOpenChange(false);
    }

    async function fundir() {
        if (!plan || !copia) return;
        setMotivo("");
        if (!descargarCopia(copia)) {
            setPaso("sin-copia");
            return;
        }
        await aplicar();
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Fusionar · «{cerebro.name}»</DialogTitle>
                    <DialogDescription>
                        Se mezclarán en «{cerebro.name}» todas sus memorias y configuraciones.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 text-sm text-white/80">
                    <div className="space-y-2">
                        <p className="font-semibold text-white">Cerebros que se mezclan</p>
                        {otros.length === 0 ? (
                            <p className="text-white/55">No hay otros cerebros en esta cuenta: no hay nada que fusionar.</p>
                        ) : (
                            otros.map((b) => (
                                <label key={b.id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2">
                                    <Checkbox
                                        checked={elegidos.includes(b.id)}
                                        onCheckedChange={(v) => setElegidos((a) => (v ? [...a, b.id] : a.filter((x) => x !== b.id)))}
                                        className="mt-1"
                                    />
                                    <span className="min-w-0">
                                        <span className="block font-medium text-white">{b.name}</span>
                                        <span className="block text-xs text-white/55">
                                            {ETIQUETA_PESTANA[pestanaDeCerebro(b)]} · creado el {fechaLegible(b.created_at)}
                                        </span>
                                    </span>
                                </label>
                            ))
                        )}
                    </div>
                    {plan && (paso === "listo" || paso === "aplicando" || paso === "sin-copia") && (
                        <div className="rounded-xl border border-white/15 bg-black/20 p-3">
                            <p className="font-semibold text-white">Vista previa de la fusión</p>
                            <p className="mt-1 text-white/70">
                                {plan.resumen.archivosNuevos} memoria nueva · {plan.resumen.archivosAnexados} con secciones añadidas · {plan.resumen.archivosOmitidos} sin cambios · {kb(plan.resumen.bytes)} que entran de {elegidos.length} {elegidos.length === 1 ? "cerebro" : "cerebros"}.
                            </p>
                            <div className="mt-2 overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="text-white/55">
                                        <tr>
                                            <th className="py-1 pr-2 font-medium">Archivo</th>
                                            <th className="py-1 pr-2 font-medium">Acción</th>
                                            <th className="py-1 font-medium">Entran</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {plan.archivos.map((a) => {
                                            const n = seccionesAnadidas(a.contenido, previoDe(a.name));
                                            const accion = a.accion === "copiar" ? "copiar" : a.accion === "omitir" ? "ya estaba" : `añadir ${n} ${n === 1 ? "sección" : "secciones"}`;
                                            return (
                                                <tr key={a.name} className="border-t border-white/10 align-top">
                                                    <td className="py-1 pr-2 break-words">
                                                        {a.name}
                                                        <span className="block text-white/45">{a.desde.map(nombreDe).join(", ") || "sin origen"}</span>
                                                    </td>
                                                    <td className="py-1 pr-2">{accion}</td>
                                                    <td className="py-1">{kb(a.bytesQueEntran)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <p className="mt-2 text-xs text-white/60">
                                Includes: {totalIncludes(plan)} · servidores: {plan.servers.length} · preferencias: {Object.keys(plan.prefs).length}
                            </p>
                            <label className="mt-3 flex cursor-pointer items-start gap-2">
                                <Checkbox
                                    checked={quitar}
                                    onCheckedChange={(v) => setQuitar(v === true)}
                                    className="mt-1"
                                    aria-label="Quitar los cerebros fusionados cuando termine"
                                />
                                <span>Quitar los cerebros fusionados después</span>
                            </label>
                            {quitar && <p className="mt-1 text-xs text-white/50">Los que tengan selecciones no se borran: el diálogo lo avisará.</p>}
                        </div>
                    )}
                    {motivo && <p className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-amber-200">{motivo}</p>}
                    {paso === "sin-copia" && (
                        <div className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-amber-100">
                            <p>No se pudo descargar la copia de seguridad en este aparato; así no se escribe nada.</p>
                            <p className="mt-1 text-xs text-amber-100/80">Si sigues sin copia, la fusión se aplicará igualmente y no habrá marcha atrás.</p>
                        </div>
                    )}
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
                    <div className="flex flex-wrap items-center gap-2">
                        {(paso === "elegir" || paso === "preparando") && (
                            <Button
                                className="h-auto cursor-pointer whitespace-normal"
                                onClick={preparar}
                                disabled={elegidos.length === 0 || paso === "preparando"}
                                aria-label="Ver lo que se fusionará"
                            >
                                {paso === "preparando" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                                {paso === "preparando" ? "Leyendo los cerebros…" : "Ver vista previa"}
                            </Button>
                        )}
                        {(paso === "listo" || paso === "aplicando") && (
                            <>
                                <Button className="h-auto cursor-pointer whitespace-normal" onClick={fundir} disabled={paso === "aplicando"}>
                                    {paso === "aplicando" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Merge className="h-4 w-4" aria-hidden />}
                                    {paso === "aplicando" ? "Fusionando…" : "Fusionar"}
                                </Button>
                                {paso === "listo" && <span className="text-xs text-white/55">Primero se descarga la copia de seguridad.</span>}
                            </>
                        )}
                        {paso === "sin-copia" && (
                            <Button className="h-auto cursor-pointer whitespace-normal" onClick={aplicar}>
                                <Merge className="h-4 w-4" aria-hidden />
                                Seguir sin copia descargada
                            </Button>
                        )}
                        {(paso === "listo" || paso === "preparando" || paso === "sin-copia") && (
                            <Button
                                variant="ghost"
                                className="h-auto cursor-pointer whitespace-normal"
                                onClick={() => { setPlan(null); setCopia(null); setLectura(null); setResultado(null); setMotivo(""); setPaso("elegir"); }}
                            >
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
