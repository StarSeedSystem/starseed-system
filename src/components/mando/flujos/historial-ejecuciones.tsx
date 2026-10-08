"use client";

/**
 * Historial de ejecuciones de un flujo (FLU1005Hc · contrato §3).
 *
 * Lee `GET /api/mando/flujos?ejecuciones=<id>` y enseña, por cada ejecución, la
 * entrada del disparador, el estado y —bajo cada nodo— su entrada y su salida,
 * igual que la vista de ejecuciones de n8n pero sobre nuestros JSON.
 */

import { useCallback, useEffect, useState } from "react";

export interface RegistroNodo {
    entrada: unknown[];
    salida: unknown[];
    error: string | null;
    ms: number | null;
}

export interface EjecucionUI {
    id: string;
    estado: string;
    entrada: unknown[];
    salida: unknown[];
    error: string | null;
    nodos: Record<string, RegistroNodo>;
}

function jsonLegible(valor: unknown): string {
    try {
        return JSON.stringify(valor, null, 2) ?? "";
    } catch {
        return String(valor);
    }
}

export function HistorialEjecuciones({ flujoId }: { flujoId: string | null }) {
    const [ejecuciones, setEjecuciones] = useState<EjecucionUI[]>([]);
    const [aviso, setAviso] = useState("");

    const cargar = useCallback(async () => {
        if (!flujoId) {
            setEjecuciones([]);
            return;
        }
        try {
            const res = await fetch(`/api/mando/flujos?ejecuciones=${encodeURIComponent(flujoId)}`, { cache: "no-store" });
            const datos: unknown = await res.json().catch(() => null);
            const cruda = datos && typeof datos === "object" ? (datos as Record<string, unknown>).ejecuciones : null;
            setEjecuciones(Array.isArray(cruda) ? (cruda as EjecucionUI[]) : []);
            setAviso("");
        } catch {
            setAviso("No se pudo cargar el historial.");
        }
    }, [flujoId]);

    useEffect(() => {
        void cargar();
    }, [cargar]);

    return (
        <section className="flex flex-col gap-2" aria-label="Historial de ejecuciones">
            <header className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Historial de ejecuciones</h3>
                {flujoId ? (
                    <button type="button" className="mc-cristal mc-alzar cursor-pointer rounded px-2 py-1 text-xs" onClick={() => void cargar()}>
                        Actualizar
                    </button>
                ) : null}
            </header>
            {aviso ? <p role="status" className="text-sm opacity-80">{aviso}</p> : null}
            {!flujoId ? (
                <p className="text-sm opacity-70">Guarda o abre un flujo para ver sus ejecuciones.</p>
            ) : ejecuciones.length === 0 ? (
                <p className="text-sm opacity-70">Aún no hay ejecuciones de este flujo.</p>
            ) : (
                <ul className="flex flex-col gap-2">
                    {ejecuciones.map((ejec) => (
                        <li key={ejec.id} className="mc-cristal rounded-md p-2 text-xs">
                            <details>
                                <summary className="cursor-pointer">
                                    <span className={`font-medium ${ejec.estado === "fallida" ? "text-violet-300" : "text-cyan-200"}`}>
                                        {ejec.estado}
                                    </span>{" "}
                                    · {ejec.id}
                                    {ejec.error ? <span className="opacity-80"> · {ejec.error}</span> : null}
                                </summary>
                                <div className="mt-2 flex flex-col gap-2">
                                    <div>
                                        <p className="font-medium">Entrada del disparador</p>
                                        <pre className="max-h-40 overflow-auto rounded bg-black/25 p-2">{jsonLegible(ejec.entrada)}</pre>
                                    </div>
                                    {Object.entries(ejec.nodos).map(([nid, reg]) => (
                                        <details key={nid} className="rounded border border-white/10 p-2">
                                            <summary className="cursor-pointer">
                                                {nid}{typeof reg.ms === "number" ? ` · ${reg.ms} ms` : ""}
                                                {reg.error ? <span className="text-violet-300"> · error: {reg.error}</span> : null}
                                            </summary>
                                            <div className="mt-1 grid gap-2 md:grid-cols-2">
                                                <div>
                                                    <p className="opacity-70">Entrada</p>
                                                    <pre className="max-h-40 overflow-auto rounded bg-black/25 p-2">{jsonLegible(reg.entrada)}</pre>
                                                </div>
                                                <div>
                                                    <p className="opacity-70">Salida</p>
                                                    <pre className="max-h-40 overflow-auto rounded bg-black/25 p-2">{jsonLegible(reg.salida)}</pre>
                                                </div>
                                            </div>
                                        </details>
                                    ))}
                                    <div>
                                        <p className="font-medium">Salida del flujo</p>
                                        <pre className="max-h-40 overflow-auto rounded bg-black/25 p-2">{jsonLegible(ejec.salida)}</pre>
                                    </div>
                                </div>
                            </details>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
