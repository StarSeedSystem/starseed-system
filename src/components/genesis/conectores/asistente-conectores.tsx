"use client";

/*
 * Asistente «Conectar Genesis» (Ola 1019G · tarea M, contrato
 * architecture/genesis-conectores-abiertos.md §3–6). Tres pasos: 1) lo local
 * (neuronas, servidores del cerebro, capa Astraura) con interruptores;
 * 2) lo gratis con «Vincular» al enlace oficial (pestaña nueva) y campo de
 * clave que se envía a la API y SE BORRA: nunca se guarda el valor, solo la
 * huella; 3) resumen por papel. Datos inyectables (sin red en pruebas);
 * lo no verificado → `null`.
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type PapelConector = "escritor" | "revisor" | "director" | "chat" | "voz" | "código" | "visión";

export interface RecursoLocal {
    id: string; nombre: string;
    tipo: "neurona" | "cerebro" | "astraura"; detalle: string | null;
    /** Potencia medida (tokens/s o aciertos); null si nadie la midió. */
    potencia: number | null;
}

/** Sugerencia gratis de un proveedor/servicio real de la flota o del contexto. */
export interface SugerenciaGratis {
    id: string; nombre: string; papeles: PapelConector[];
    enlaceAlta: string | null; enlaceClave: string | null; /** oficiales; null sin verificar */
    variableClave: string | null; limiteGratis: string | null; verificado: string | null; /** null si falta */
}

export interface TramoElegido { nombre: string; motivo: string; }

export type EnviarClave = (v: { proveedor: string; variable: string; clave: string }) => Promise<{ ok: boolean; huella: string | null; error: string | null }>;

/** Envía la clave a la bóveda del servidor; el valor se olvida en cuanto responde. */
export async function enviarClaveAServidor(v: { proveedor: string; variable: string; clave: string }) {
    try {
        const r = await fetch("/api/genesis/conectores/claves", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ proveedor: v.proveedor, variable: v.variable, clave: v.clave }),
        });
        const j = (await r.json()) as { ok?: boolean; huella?: string | null; error?: string };
        return { ok: r.ok && j.ok !== false, huella: j.huella ?? null, error: j.error ?? null };
    } catch {
        return { ok: false, huella: null, error: "No se pudo contactar con la bóveda del servidor." };
    }
}

/** Cadena de respaldo de un papel (contrato §2–§6): locales encendidos primero —
 * el más potente medido arriba— y luego lo gratis del papel. Lo sin verificar
 * se declara así; nunca se inventa. */
export function cadenaDelPapel(papel: PapelConector, localesEncendidos: RecursoLocal[], gratis: SugerenciaGratis[]): TramoElegido[] {
    const tramos: TramoElegido[] = [];
    const locales = [...localesEncendidos].sort((a, b) => (b.potencia ?? -1) - (a.potencia ?? -1));
    for (const l of locales) tramos.push({ nombre: l.nombre, motivo: "local del contexto, " + (l.potencia === null ? "potencia sin medir" : `${l.potencia} tokens/s medidos`) });
    for (const s of gratis.filter((g) => g.papeles.includes(papel))) tramos.push({ nombre: s.nombre, motivo: "gratis" + (s.limiteGratis ? ` — ${s.limiteGratis}` : " — límite sin verificar") });
    return tramos;
}

/** Entradas de la flota con datos verificados (`proveedores-catalogo.ts`); un límite sin confirmar va a `null`. */
export const SUGERIDAS_DEFECTO: SugerenciaGratis[] = [
    { id: "groq", nombre: "Groq", papeles: ["escritor", "código", "chat"], enlaceAlta: "https://console.groq.com", enlaceClave: "https://console.groq.com/keys", variableClave: "GROQ_API_KEY", limiteGratis: null, verificado: null },
    { id: "openrouter", nombre: "OpenRouter · :free", papeles: ["escritor", "revisor"], enlaceAlta: "https://openrouter.ai", enlaceClave: "https://openrouter.ai/keys", variableClave: "OPENROUTER_API_KEY", limiteGratis: "50 peticiones al día con modelos :free", verificado: "2026-09-05" },
];

export function AsistenteConectores({
    locales = [], gratis = SUGERIDAS_DEFECTO, papeles = ["escritor", "revisor", "chat"],
    enviarClave = enviarClaveAServidor,
}: { locales?: RecursoLocal[]; gratis?: SugerenciaGratis[]; papeles?: PapelConector[]; enviarClave?: EnviarClave }) {
    const [paso, setPaso] = useState(1);
    const [encendidos, setEncendidos] = useState<string[]>([]);
    const [campo, setCampo] = useState<Record<string, string>>({});
    const [finales, setFinales] = useState<Record<string, { huella: string | null; fallo: string | null }>>({});
    const [enviando, setEnviando] = useState<string | null>(null);
    const on = (id: string) => encendidos.includes(id);
    const guardar = async (s: SugerenciaGratis) => {
        const clave = campo[s.id];
        if (!s.variableClave || !clave) return;
        setEnviando(s.id);
        const r = await enviarClave({ proveedor: s.id, variable: s.variableClave, clave });
        setCampo((c) => ({ ...c, [s.id]: "" })); // la clave se borra del campo SIEMPRE
        setFinales((f) => ({ ...f, [s.id]: r.ok ? { huella: r.huella ?? "guardada", fallo: null } : { huella: f[s.id]?.huella ?? null, fallo: r.error ?? "La bóveda rechazó la clave." } }));
        setEnviando(null);
    };

    return (
        <section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
            <div role="tablist" aria-label="Pasos del asistente" className="flex flex-wrap gap-2">
                {[{ n: 1, t: "Lo local del contexto" }, { n: 2, t: "Lo gratis por vincular" }, { n: 3, t: "Resumen por papel" }].map((p) => (<button key={p.n} type="button" role="tab" aria-selected={paso === p.n} data-testid={`conector-paso-${p.n}`} onClick={() => setPaso(p.n)} className={cn("cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors duration-200", paso === p.n ? "border-emerald-300/60 bg-emerald-500/15 text-white" : "border-white/15 text-white/60 hover:text-white")}>{p.n}. {p.t}</button>))}
            </div>
            {paso === 1 && (<ul data-testid="conector-locales" className="space-y-2">
                {locales.length === 0 && <li className="text-xs text-white/50">Sin neuronas, servidores del cerebro ni capa de Astraura detectados en este contexto.</li>}
                {locales.map((l) => (<li key={l.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2"><p className="text-sm">{l.nombre} <span className="text-xs text-white/50">{l.tipo} · {l.detalle ?? "sin detalle"} · {l.potencia === null ? "potencia sin medir" : `${l.potencia} tokens/s`}</span></p><button type="button" role="switch" aria-checked={on(l.id)} data-testid={`local-${l.id}`} onClick={() => setEncendidos((e) => on(l.id) ? e.filter((x) => x !== l.id) : [...e, l.id])} className={cn("shrink-0 cursor-pointer rounded-full border px-3 py-1 text-xs", on(l.id) ? "border-emerald-300/60 bg-emerald-500/15 text-white" : "border-white/15 text-white/60 hover:text-white")}>{on(l.id) ? "Encendido" : "Apagado"}</button></li>))}
            </ul>)}
            {paso === 2 && (<ul data-testid="conector-gratis" className="space-y-2">
                {gratis.map((s) => (<li key={s.id} className="space-y-2 rounded-xl border border-white/10 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2"><p className="text-sm">{s.nombre}</p><span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] text-white/60">{s.limiteGratis ?? "límite sin verificar"}</span>{s.verificado && <span className="text-[10px] text-white/40">verificado {s.verificado}</span>}{s.enlaceAlta && <button type="button" data-testid={`alta-${s.id}`} onClick={() => window.open(s.enlaceAlta as string, "_blank", "noopener,noreferrer")} className="cursor-pointer text-xs text-emerald-200 underline decoration-dotted">Alta</button>}{s.enlaceClave && <button type="button" data-testid={`vincular-${s.id}`} onClick={() => window.open(s.enlaceClave as string, "_blank", "noopener,noreferrer")} className="cursor-pointer rounded-full border border-emerald-300/40 px-2 py-0.5 text-xs text-emerald-100 hover:bg-emerald-500/10">Vincular</button>}</div>
                    {s.variableClave && (<div className="flex gap-2">
                        <input type="password" value={campo[s.id] ?? ""} onChange={(e) => setCampo((c) => ({ ...c, [s.id]: e.target.value }))} placeholder={`Pega la clave (${s.variableClave})`} data-testid={`clave-${s.id}`} aria-label={`Clave de ${s.nombre}`} className="w-full rounded-lg border border-white/15 bg-black/20 px-2 py-1 text-sm outline-none focus:border-emerald-300/40" />
                        <button type="button" data-testid={`guardar-${s.id}`} disabled={!campo[s.id] || enviando === s.id} onClick={() => void guardar(s)} className="shrink-0 cursor-pointer rounded-full border border-white/15 px-3 py-1 text-xs hover:text-white disabled:opacity-40">{enviando === s.id ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : "Guardar"}</button>
                    </div>)}
                    {finales[s.id]?.huella && <p className="text-xs text-emerald-200" data-testid={`huella-${s.id}`}>Clave en la bóveda · huella {finales[s.id].huella}</p>}
                    {finales[s.id]?.fallo && <p className="text-xs text-amber-100">{finales[s.id].fallo}</p>}
                </li>))}
            </ul>)}
            {paso === 3 && (<div data-testid="conector-resumen" className="space-y-3">
                {papeles.map((p) => (<div key={p}>
                    <p className="text-xs font-medium text-white/80">{p}</p>
                    <ol data-testid={`cadena-${p}`} className="mt-1 space-y-1">
                        {cadenaDelPapel(p, locales.filter((l) => on(l.id)), gratis).map((t, i) => (<li key={`${p}-${i}`} className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white/70">{i + 1}. {t.nombre} — {t.motivo}</li>))}
                    </ol>
                </div>))}
            </div>)}
        </section>
    );
}
