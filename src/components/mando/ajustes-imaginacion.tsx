"use client";

// Ajustes de la imaginación (Ola 1021I · IMN1021I). Un solo componente en Ajustes y en el
// medidor «Imaginación». Contrato: architecture/imaginacion-autodesarrollo.md §4.
// Guarda con POST /api/mando/imaginacion (`accion: "ajustes"`), solo local.

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Moon, Plus, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AJUSTES_POR_DEFECTO, NOMBRE_FUENTE, validarAjustes, type AjustesAutodesarrollo, type FranjaHoraria, type FuentePropuesta } from "@/lib/mando/imaginacion-tipos";

const RUTA = "/api/mando/imaginacion";
const FUENTES: FuentePropuesta[] = ["diaria", "profunda", "astraura", "directores"];
const DIAS = ["D", "L", "M", "X", "J", "V", "S"];
const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const BOTON = "min-h-11 cursor-pointer rounded-lg border px-3";
const ACTIVO = "border-fuchsia-300/60 bg-fuchsia-500/15 text-fuchsia-100";
const INACTIVO = "border-white/15 text-white/70 hover:bg-white/10";
export type CambioImaginacion =
    | { tipo: "automatico"; valor: boolean } | { tipo: "rango"; campo: "min" | "max"; valor: number }
    | { tipo: "fuente"; fuente: FuentePropuesta } | { tipo: "modo"; modo: "inteligente" | "franjas" }
    | { tipo: "repartir"; valor: boolean } | { tipo: "profunda"; dias: number }
    | { tipo: "dia"; indice: number; dia: number } | { tipo: "franja"; indice: number; cambios: Partial<FranjaHoraria> }
    | { tipo: "anadir-franja" } | { tipo: "quitar-franja"; indice: number };

export const textoRango = (a: AjustesAutodesarrollo) =>
    `Tareas autodesarrolladas por ciclo: de ${a.rango.min} a ${a.rango.max}`;

/** Aplica un cambio del formulario sin mutar ni salirse de los límites. PURA. */
export function aplicarCambio(a: AjustesAutodesarrollo, c: CambioImaginacion): AjustesAutodesarrollo {
    const h = (cambios: Partial<AjustesAutodesarrollo["horario"]>) => ({ ...a, horario: { ...a.horario, ...cambios } });
    if (c.tipo === "automatico") return { ...a, automatico: c.valor };
    if (c.tipo === "rango") {
        const n = Math.max(0, Math.min(10, Math.round(c.valor)));
        return c.campo === "min"
            ? { ...a, rango: { ...a.rango, min: Math.min(n, a.rango.max) } }
            : { ...a, rango: { ...a.rango, max: Math.max(n, a.rango.min) } };
    }
    if (c.tipo === "fuente") return { ...a, fuentes: { ...a.fuentes, [c.fuente]: !a.fuentes[c.fuente] } };
    if (c.tipo === "modo") return h({ modo: c.modo });
    if (c.tipo === "repartir") return h({ repartir: c.valor });
    if (c.tipo === "profunda") return { ...a, profunda: { cada_dias: Math.max(0, Math.min(365, Math.round(c.dias))) } };
    if (c.tipo === "anadir-franja") return h({ franjas: [...a.horario.franjas, { dias: [0, 1, 2, 3, 4, 5, 6], desde: "02:00", hasta: "06:00" }] });
    if (c.tipo === "quitar-franja") return h({ franjas: a.horario.franjas.filter((_, i) => i !== c.indice) });
    const f = a.horario.franjas[c.indice];
    if (!f) return a;
    const dias = c.tipo === "dia"
        ? (f.dias.includes(c.dia) ? f.dias.filter((d) => d !== c.dia) : [...f.dias, c.dia].sort((x, y) => x - y))
        : f.dias;
    const cambios = c.tipo === "dia" ? { dias } : c.cambios;
    return h({ franjas: a.horario.franjas.map((x, i) => (i === c.indice ? { ...x, ...cambios } : x)) });
}

export function AjustesImaginacion() {
    const [ajustes, setAjustes] = useState<AjustesAutodesarrollo>(AJUSTES_POR_DEFECTO);
    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState(false);
    const [aviso, setAviso] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);
    const cambiar = useCallback((c: CambioImaginacion) => setAjustes((a) => aplicarCambio(a, c)), []);

    useEffect(() => {
        let vivo = true;
        fetch(RUTA, { cache: "no-store" })
            .then(async (r) => (r.ok ? ((await r.json()) as { ajustes?: unknown }) : null))
            .then((d) => { if (vivo && d?.ajustes) setAjustes(validarAjustes(d.ajustes)); })
            .catch(() => { if (vivo) setAviso({ tono: "error", texto: "No se pudieron leer los ajustes (la consola local no respondió)." }); })
            .finally(() => { if (vivo) setCargando(false); });
        return () => { vivo = false; };
    }, []);

    const guardar = useCallback(async () => {
        setGuardando(true);
        setAviso(null);
        try {
            const r = await fetch(RUTA, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "ajustes", ajustes }) });
            const d = (await r.json().catch(() => null)) as { ok?: boolean; ajustes?: unknown; error?: string } | null;
            if (!r.ok || !d?.ok) { setAviso({ tono: "error", texto: d?.error ?? `No se pudo guardar (HTTP ${r.status}).` }); return; }
            if (d.ajustes) setAjustes(validarAjustes(d.ajustes));
            setAviso({ tono: "ok", texto: "Ajustes guardados: el director los aplica en su próximo ciclo." });
        } catch {
            setAviso({ tono: "error", texto: "No se pudo guardar (la consola local no respondió)." });
        } finally { setGuardando(false); }
    }, [ajustes]);

    const campo = "h-11 rounded-lg border border-white/10 bg-black/40 px-2 text-white outline-none";
    return (
        <article data-testid="ajustes-imaginacion" className="rounded-xl border border-white/10 bg-black/30 p-4">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><Sparkles className="h-4 w-4 text-fuchsia-300" aria-hidden />Imaginación</h3>
                    <p className="mt-0.5 text-xs text-white/50">Cuánto se autodesarrolla solo, de dónde salen las propuestas y cuándo se lanzan.</p>
                </div>
                <div className="flex min-h-11 items-center gap-2">
                    {guardando && <Loader2 className="h-4 w-4 animate-spin text-white/50" aria-hidden />}
                    <Label htmlFor="switch-imaginacion-automatico" className="cursor-pointer text-xs text-white/80">Automático</Label>
                    <Switch id="switch-imaginacion-automatico" checked={ajustes.automatico} onCheckedChange={(v) => cambiar({ tipo: "automatico", valor: v })} disabled={guardando} aria-label="Automático" />
                </div>
            </header>
            {cargando ? <p className="mt-3 text-xs text-white/50">Leyendo los ajustes…</p> : (
                <div className="mt-3 space-y-4 text-xs text-white/70">
                    <p>{textoRango(ajustes)}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {(["min", "max"] as const).map((c) => (
                            <label key={c} className="flex min-h-11 items-center gap-2">
                                <span className="w-14 shrink-0">{c === "min" ? "Mínimo" : "Máximo"}</span>
                                <input type="range" min={0} max={10} step={1} value={ajustes.rango[c]} onChange={(e) => cambiar({ tipo: "rango", campo: c, valor: Number(e.target.value) })} className="h-11 min-w-0 flex-1 cursor-pointer accent-fuchsia-300" aria-label={c === "min" ? "Mínimo de tareas por ciclo" : "Máximo de tareas por ciclo"} />
                                <output className="w-6 text-right font-mono text-white/90">{ajustes.rango[c]}</output>
                            </label>
                        ))}
                    </div>
                    <ul className="space-y-1.5">
                        {FUENTES.map((f) => (
                            <li key={f} className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3">
                                <Label htmlFor={`switch-fuente-${f}`} className="cursor-pointer">{NOMBRE_FUENTE[f]}</Label>
                                <Switch id={`switch-fuente-${f}`} checked={ajustes.fuentes[f]} onCheckedChange={() => cambiar({ tipo: "fuente", fuente: f })} disabled={guardando} aria-label={NOMBRE_FUENTE[f]} />
                            </li>
                        ))}
                    </ul>
                    <div className="space-y-2">
                        <div className="flex min-h-11 items-center justify-between gap-2">
                            <span className="font-semibold text-white">Horario</span>
                            <div role="radiogroup" aria-label="Horario" className="flex gap-2">
                                {(["inteligente", "franjas"] as const).map((m) => (
                                    <button key={m} type="button" role="radio" aria-checked={ajustes.horario.modo === m} onClick={() => cambiar({ tipo: "modo", modo: m })} className={`${BOTON} ${ajustes.horario.modo === m ? ACTIVO : INACTIVO}`}>{m === "inteligente" ? "Inteligente" : "Por franjas"}</button>
                                ))}
                            </div>
                        </div>
                        <p className="text-white/50">{ajustes.horario.modo === "inteligente" ? "Cuando hay capacidad libre (Mac, A1 o nube); prefiere la noche." : "Solo dentro de las franjas que elijas."}</p>
                        {ajustes.horario.modo === "franjas" && (
                            <ul className="space-y-2" aria-label="Franjas horarias">
                                {ajustes.horario.franjas.map((f, i) => (
                                    <li key={`franja-${i}`} className="rounded-lg border border-white/10 bg-white/5 p-2">
                                        <div className="flex flex-wrap gap-1">
                                            {DIAS.map((l, d) => (
                                                <button key={d} type="button" aria-pressed={f.dias.includes(d)} aria-label={DIAS_LARGOS[d]} onClick={() => cambiar({ tipo: "dia", indice: i, dia: d })} className={`h-11 w-11 cursor-pointer rounded-lg border text-xs ${f.dias.includes(d) ? ACTIVO : INACTIVO}`}>{l}</button>
                                            ))}
                                        </div>
                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                            <label className="flex min-h-11 items-center gap-1">Desde<input type="time" value={f.desde} onChange={(e) => cambiar({ tipo: "franja", indice: i, cambios: { desde: e.target.value } })} className={campo} aria-label={`Desde de la franja ${i + 1}`} /></label>
                                            <label className="flex min-h-11 items-center gap-1">Hasta<input type="time" value={f.hasta} onChange={(e) => cambiar({ tipo: "franja", indice: i, cambios: { hasta: e.target.value } })} className={campo} aria-label={`Hasta de la franja ${i + 1}`} /></label>
                                            <button type="button" onClick={() => cambiar({ tipo: "quitar-franja", indice: i })} className="ml-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border border-white/15 text-white/60 hover:bg-red-500/20 hover:text-red-200" aria-label={`Quitar franja ${i + 1}`}><Trash2 className="h-4 w-4" aria-hidden /></button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {ajustes.horario.modo === "franjas" && <Button type="button" variant="outline" size="sm" onClick={() => cambiar({ tipo: "anadir-franja" })} className="min-h-11 cursor-pointer"><Plus className="h-4 w-4" />Añadir franja</Button>}
                        <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3">
                            <Label htmlFor="switch-repartir" className="cursor-pointer">Repartir entre franjas</Label>
                            <Switch id="switch-repartir" checked={ajustes.horario.repartir} onCheckedChange={(v) => cambiar({ tipo: "repartir", valor: v })} disabled={guardando} aria-label="Repartir entre franjas" />
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <Moon className="h-4 w-4 text-sky-300" aria-hidden />
                        <Label htmlFor="input-profunda" className="cursor-pointer">Imaginación profunda cada N días (0 = nunca)</Label>
                        <input id="input-profunda" type="number" min={0} max={365} value={ajustes.profunda.cada_dias} onChange={(e) => cambiar({ tipo: "profunda", dias: Number(e.target.value) || 0 })} className={`${campo} w-20 text-center font-mono`} aria-label="Imaginación profunda cada N días" />
                    </div>
                    <p role="note" className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />Lo importante siempre espera tu visto bueno: ningún ajuste salta esa regla.</p>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" size="sm" onClick={() => void guardar()} disabled={guardando || cargando} className="min-h-11 cursor-pointer">{guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Guardar ajustes</Button>
                        {aviso && <p role={aviso.tono === "error" ? "alert" : "status"} className={aviso.tono === "error" ? "text-red-300" : "text-emerald-300"}>{aviso.texto}</p>}
                    </div>
                </div>
            )}
        </article>
    );
}
