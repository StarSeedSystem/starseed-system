"use client";

/**
 * Diseñador de olas (Ola 241 · Puente de Mando · pestaña «Procesos»)
 * ─────────────────────────────────────────────────────────────────────────────
 * Lo que Flowise aportaba —un lienzo de nodos que se edita y luego se ejecuta por
 * API— traído a las colas del enjambre: aquí se crean, corrigen y asignan las tareas
 * de una ola (id, título, archivos, prompt, dependencias, modelo), se ve el árbol
 * resultante al momento, se guarda como `olas/cola-<nombre>.json` y se lanza en esta
 * Mac o en la nube. También importa una cola existente para rehacer lo que falló.
 *
 * Flowise se archivó el 2026-08-13 (EOL): no se integra como dependencia; se toma
 * su idea (nodos editables + ejecución) sobre nuestro propio orquestador.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Play, Plus, Save, Trash2, Wand2 } from "lucide-react";

import type { ColaCompleta, TareaCola } from "@/lib/mando/colas";
import type { RamaOla, RamaTarea } from "@/lib/mando/ramificacion";
import { ArbolOla } from "@/components/mando/ramificacion-agentes";

interface Aviso {
    tipo: "ok" | "error" | "info";
    texto: string;
}

/** Nivel de cada tarea del borrador (para el árbol de vista previa). */
function nivelesBorrador(tareas: TareaCola[]): Map<string, number> {
    const porId = new Map(tareas.map((t) => [t.id, t]));
    const memo = new Map<string, number>();
    const enCurso = new Set<string>();
    const nivel = (id: string): number => {
        const p = memo.get(id);
        if (p !== undefined) return p;
        if (enCurso.has(id)) return 0;
        enCurso.add(id);
        let n = 0;
        for (const d of porId.get(id)?.depende ?? []) if (porId.has(d)) n = Math.max(n, nivel(d) + 1);
        enCurso.delete(id);
        memo.set(id, n);
        return n;
    };
    for (const t of tareas) nivel(t.id);
    return memo;
}

/** El borrador como ola del árbol (todas pendientes). */
function ramaDelBorrador(nombre: string, tareas: TareaCola[]): RamaOla {
    const niv = nivelesBorrador(tareas);
    const ramas: RamaTarea[] = tareas.map((t) => ({
        id: t.id || "?",
        ola: nombre,
        titulo: t.titulo,
        dependencias: t.depende,
        estado: "pendiente",
        nivel: niv.get(t.id) ?? 0,
        donde: null,
        modelo: t.modelo ?? "",
        proveedor: t.modelo ? (t.modelo.startsWith("nvidia/") ? "nim" : t.modelo.split("/")[0] ?? "") : "",
        revisor: "",
        sha: "",
        nota: "",
        segundos: 0,
        modelosFallidos: [],
        pasos: [],
        eventos: [],
        vivo: null,
    }));
    return {
        id: nombre,
        numero: Number.parseInt(nombre, 10) || 0,
        tareas: ramas,
        total: ramas.length,
        hechas: 0,
        enCurso: 0,
        fallidas: 0,
        sinCambios: 0,
        pendientes: ramas.length,
        viva: false,
    };
}

function tareaVacia(n: number, ola: string): TareaCola {
    return { id: `T${n}`, ola, titulo: "", archivos: [], prompt: "", depende: [] };
}

export function DisenadorOla({ onCerrar }: { onCerrar: () => void }) {
    const [colas, setColas] = useState<ColaCompleta[]>([]);
    const [modelos, setModelos] = useState<string[]>([]);
    const [lanzadorNube, setLanzadorNube] = useState(false);
    const [nombre, setNombre] = useState("");
    const [tareas, setTareas] = useState<TareaCola[]>([]);
    const [sel, setSel] = useState(0);
    const [workers, setWorkers] = useState(2);
    const [donde, setDonde] = useState<"mac" | "nube">("nube");
    const [sobrescribir, setSobrescribir] = useState(false);
    const [aviso, setAviso] = useState<Aviso | null>(null);
    const [guardada, setGuardada] = useState(false);
    const [ocupado, setOcupado] = useState(false);
    const [importar, setImportar] = useState("");

    useEffect(() => {
        void (async () => {
            try {
                const r = await fetch("/api/mando/colas", { cache: "no-store" });
                if (!r.ok) return;
                const d = (await r.json()) as { colas?: ColaCompleta[]; modelos?: string[]; lanzadorNube?: boolean };
                setColas(d.colas ?? []);
                setModelos(d.modelos ?? []);
                setLanzadorNube(Boolean(d.lanzadorNube));
                // Nombre sugerido: el siguiente número de ola.
                const mayor = (d.colas ?? []).reduce((m, c) => Math.max(m, Number.parseInt(c.nombre, 10) || 0), 0);
                setNombre((prev) => prev || `${mayor + 1}-nueva`);
            } catch {
                // sin colas: el diseñador arranca vacío
            }
        })();
    }, []);

    const etiquetaOla = useMemo(() => {
        const [num, ...resto] = nombre.split("-");
        return `Ola ${num} · ${resto.join(" ")}`.trim();
    }, [nombre]);

    const actual = tareas[sel] ?? null;

    const cambiar = useCallback((cambio: Partial<TareaCola>) => {
        setGuardada(false);
        setTareas((prev) => prev.map((t, i) => (i === sel ? { ...t, ...cambio } : t)));
    }, [sel]);

    const añadir = () => {
        setGuardada(false);
        setTareas((prev) => [...prev, tareaVacia(prev.length + 1, etiquetaOla)]);
        setSel(tareas.length);
    };

    const quitar = (i: number) => {
        setGuardada(false);
        const id = tareas[i]?.id;
        setTareas((prev) => prev.filter((_, j) => j !== i).map((t) => ({ ...t, depende: t.depende.filter((d) => d !== id) })));
        setSel(0);
    };

    const importarCola = (nombreCola: string) => {
        const c = colas.find((x) => x.nombre === nombreCola);
        if (!c) return;
        setTareas(c.tareas.map((t) => ({ ...t })));
        setSel(0);
        setGuardada(false);
        setAviso({ tipo: "info", texto: `Importadas ${c.tareas.length} tareas de cola-${c.nombre}. Cambia el nombre si no quieres sobrescribirla.` });
    };

    const enviar = async (accion: "validar" | "guardar" | "lanzar") => {
        setOcupado(true);
        setAviso(null);
        try {
            const cuerpo: Record<string, unknown> = { accion, nombre, tareas, sobrescribir, workers, donde };
            const r = await fetch("/api/mando/colas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
            const d = (await r.json()) as { ok?: boolean; errores?: string[]; error?: string; archivo?: string; pid?: number };
            if (accion === "validar") {
                setAviso(d.ok ? { tipo: "ok", texto: "La cola es válida." } : { tipo: "error", texto: (d.errores ?? []).join(" · ") });
            } else if (accion === "guardar") {
                if (d.ok) {
                    setGuardada(true);
                    setAviso({ tipo: "ok", texto: `Guardada como ${d.archivo}.` });
                    setColas((prev) => [{ nombre, archivo: d.archivo ?? "", tareas, modificada: new Date().toISOString() }, ...prev.filter((c) => c.nombre !== nombre)]);
                } else {
                    setAviso({ tipo: "error", texto: (d.errores ?? [d.error ?? "No se pudo guardar."]).join(" · ") });
                }
            } else if (d.ok) {
                setAviso({
                    tipo: "ok",
                    texto: donde === "mac"
                        ? `Orquestador lanzado en esta Mac (pid ${d.pid ?? "?"}). En un minuto aparece en la ramificación.`
                        : "Orden firmada publicada en el bus: el lanzador de la nube la recoge en menos de un minuto.",
                });
            } else {
                setAviso({ tipo: "error", texto: d.error ?? (d.errores ?? []).join(" · ") ?? "No se pudo lanzar." });
            }
        } catch {
            setAviso({ tipo: "error", texto: "No se pudo hablar con el mando." });
        } finally {
            setOcupado(false);
        }
    };

    const vista = useMemo(() => ramaDelBorrador(etiquetaOla || nombre, tareas), [etiquetaOla, nombre, tareas]);

    return (
        <section className="rounded-xl border border-violet-400/30 bg-black/40 p-4 backdrop-blur">
            <header className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                        <Wand2 className="h-4 w-4 text-violet-300" aria-hidden />
                        Diseñador de olas
                    </h3>
                    <p className="text-[11px] text-white/50">
                        Crea o corrige las tareas de una ola, asigna dependencias y modelo, guárdala como cola y lánzala en esta Mac o en la nube.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <select
                        value={importar}
                        onChange={(e) => {
                            setImportar(e.target.value);
                            if (e.target.value) importarCola(e.target.value);
                        }}
                        className="cursor-pointer rounded-md border border-white/10 bg-black/40 px-2 py-1 text-white/80"
                        aria-label="Importar una cola existente"
                    >
                        <option value="">Importar cola…</option>
                        {colas.map((c) => (
                            <option key={c.nombre} value={c.nombre}>
                                {c.nombre} · {c.tareas.length} tareas
                            </option>
                        ))}
                    </select>
                    <button type="button" onClick={añadir} className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-white/80 hover:bg-white/5">
                        <Plus className="h-3 w-3" aria-hidden /> Tarea
                    </button>
                    <button type="button" onClick={onCerrar} className="cursor-pointer rounded-md border border-white/10 px-2 py-1 text-white/60 hover:bg-white/5">
                        Cerrar
                    </button>
                </div>
            </header>

            <div className="mt-3 grid gap-3 lg:grid-cols-[220px_1fr]">
                <div className="space-y-1">
                    {tareas.length === 0 ? (
                        <p className="text-xs text-white/40">Sin tareas. Añade una o importa una cola.</p>
                    ) : (
                        tareas.map((t, i) => (
                            <button
                                key={`${t.id}-${i}`}
                                type="button"
                                onClick={() => setSel(i)}
                                className={`flex w-full cursor-pointer items-start justify-between gap-2 rounded-lg border px-2 py-1.5 text-left text-xs ${
                                    i === sel ? "border-violet-400/50 bg-violet-500/10 text-white" : "border-white/10 text-white/70 hover:bg-white/5"
                                }`}
                            >
                                <span>
                                    <span className="font-mono font-semibold">{t.id || "?"}</span>{" "}
                                    <span className="text-white/60">{t.titulo.slice(0, 40) || "(sin título)"}</span>
                                    {t.depende.length ? <span className="block text-[10px] text-white/40">← {t.depende.join(", ")}</span> : null}
                                </span>
                                <span
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        quitar(i);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.stopPropagation();
                                            quitar(i);
                                        }
                                    }}
                                    className="cursor-pointer rounded p-0.5 text-white/40 hover:text-rose-300"
                                    aria-label={`Quitar ${t.id}`}
                                >
                                    <Trash2 className="h-3 w-3" aria-hidden />
                                </span>
                            </button>
                        ))
                    )}
                </div>

                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    {actual ? (
                        <div className="grid gap-2 text-xs">
                            <div className="grid gap-2 sm:grid-cols-[110px_1fr_220px]">
                                <label className="grid gap-1 text-white/60">
                                    Id
                                    <input value={actual.id} onChange={(e) => cambiar({ id: e.target.value.toUpperCase() })} className="rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-white" />
                                </label>
                                <label className="grid gap-1 text-white/60">
                                    Título
                                    <input value={actual.titulo} onChange={(e) => cambiar({ titulo: e.target.value })} className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-white" />
                                </label>
                                <label className="grid gap-1 text-white/60">
                                    Modelo (opcional)
                                    <select value={actual.modelo ?? ""} onChange={(e) => cambiar({ modelo: e.target.value || undefined })} className="cursor-pointer rounded-md border border-white/10 bg-black/40 px-2 py-1 text-white">
                                        <option value="">Rotación automática</option>
                                        {modelos.map((m) => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                            <label className="grid gap-1 text-white/60">
                                Archivos (separados por coma, rutas relativas al repositorio)
                                <input
                                    value={actual.archivos.join(", ")}
                                    onChange={(e) => cambiar({ archivos: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })}
                                    className="rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-white"
                                />
                            </label>
                            <label className="grid gap-1 text-white/60">
                                Prompt del agente
                                <textarea
                                    value={actual.prompt}
                                    onChange={(e) => cambiar({ prompt: e.target.value })}
                                    rows={7}
                                    className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-white"
                                />
                            </label>
                            <div className="grid gap-1 text-white/60">
                                Depende de
                                <div className="flex flex-wrap gap-1.5">
                                    {tareas.filter((t) => t.id !== actual.id && t.id).length === 0 ? (
                                        <span className="text-white/35">(no hay otras tareas)</span>
                                    ) : (
                                        tareas
                                            .filter((t) => t.id !== actual.id && t.id)
                                            .map((t) => {
                                                const marcada = actual.depende.includes(t.id);
                                                return (
                                                    <button
                                                        key={t.id}
                                                        type="button"
                                                        onClick={() =>
                                                            cambiar({ depende: marcada ? actual.depende.filter((d) => d !== t.id) : [...actual.depende, t.id] })
                                                        }
                                                        className={`cursor-pointer rounded-md border px-2 py-0.5 font-mono ${
                                                            marcada ? "border-violet-400/60 bg-violet-500/20 text-white" : "border-white/10 text-white/60 hover:bg-white/5"
                                                        }`}
                                                        aria-pressed={marcada}
                                                    >
                                                        {t.id}
                                                    </button>
                                                );
                                            })
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <p className="text-xs text-white/40">Selecciona una tarea para editarla.</p>
                    )}
                </div>
            </div>

            {tareas.length > 0 ? (
                <div className="mt-3">
                    <p className="mb-1 text-[11px] uppercase tracking-wide text-white/40">Vista previa del árbol</p>
                    <ArbolOla ola={vista} seleccion={actual?.id ?? null} onSeleccionar={(id) => setSel(Math.max(0, tareas.findIndex((t) => t.id === id)))} />
                </div>
            ) : null}

            <footer className="mt-3 flex flex-wrap items-end gap-2 text-xs">
                <label className="grid gap-1 text-white/60">
                    Nombre de la cola
                    <input value={nombre} onChange={(e) => { setNombre(e.target.value); setGuardada(false); }} className="w-56 rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-white" placeholder="241-nombre-corto" />
                </label>
                <label className="grid gap-1 text-white/60">
                    Trabajadores
                    <input type="number" min={1} max={4} value={workers} onChange={(e) => setWorkers(Number(e.target.value) || 1)} className="w-20 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-white" />
                </label>
                <label className="grid gap-1 text-white/60">
                    Dónde
                    <select value={donde} onChange={(e) => setDonde(e.target.value === "mac" ? "mac" : "nube")} className="cursor-pointer rounded-md border border-white/10 bg-black/40 px-2 py-1 text-white">
                        <option value="nube">Nube (contenedor){lanzadorNube ? "" : " · sin firma configurada"}</option>
                        <option value="mac">Esta Mac</option>
                    </select>
                </label>
                <label className="flex items-center gap-1 text-white/60">
                    <input type="checkbox" checked={sobrescribir} onChange={(e) => setSobrescribir(e.target.checked)} className="cursor-pointer" />
                    sobrescribir si existe
                </label>
                <div className="ml-auto flex flex-wrap gap-1.5">
                    <button type="button" disabled={ocupado} onClick={() => void enviar("validar")} className="cursor-pointer rounded-md border border-white/10 px-2 py-1 text-white/80 hover:bg-white/5 disabled:opacity-50">
                        Validar
                    </button>
                    <button type="button" disabled={ocupado} onClick={() => void enviar("guardar")} className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-emerald-400/40 px-2 py-1 text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-50">
                        <Save className="h-3 w-3" aria-hidden /> Guardar cola
                    </button>
                    <button
                        type="button"
                        disabled={ocupado || !guardada}
                        title={guardada ? "Lanzar el orquestador con esta cola" : "Guarda la cola antes de lanzarla"}
                        onClick={() => void enviar("lanzar")}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-sky-400/40 px-2 py-1 text-sky-200 hover:bg-sky-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Play className="h-3 w-3" aria-hidden /> Lanzar {donde === "mac" ? "aquí" : "en la nube"}
                    </button>
                </div>
            </footer>
            {aviso ? (
                <p className={`mt-2 rounded-lg border px-3 py-2 text-xs ${aviso.tipo === "ok" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : aviso.tipo === "error" ? "border-rose-400/30 bg-rose-500/10 text-rose-100" : "border-white/10 bg-white/5 text-white/80"}`}>
                    {aviso.texto}
                </p>
            ) : null}
        </section>
    );
}
