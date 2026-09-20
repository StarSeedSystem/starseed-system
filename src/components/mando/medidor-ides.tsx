"use client";

/**
 * Medidor de IDEs vinculados (Ola 335 · ID2).
 *
 * Una fila por IDE: nombre, punto de color por frescura (al día / atrasado /
 * nunca), la nota en español y el puntero de su contexto. Un IDE atrasado es la
 * causa real de regresiones —«arregla» pruebas hasta darle la razón a un fallo—,
 * así que el atraso se ve de un vistazo, no escondido en un tooltip.
 *
 * Se refresca solo cada 5 s y se PAUSA cuando la pestaña no se ve: en la Mac de
 * 8 GB una pestaña olvidada no tiene por qué pedir nada.
 */

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Loader2, RefreshCw } from "lucide-react";

interface FilaIde {
    id: string;
    titulo: string;
    estado: string;
    porque: string;
    puntero: string;
}
interface DetalleIdes {
    titulo: string;
    resumen: string;
    filas: FilaIde[];
    vacio?: string;
}

const PUNTO: Record<string, string> = {
    "al día": "bg-emerald-400",
    atrasado: "bg-amber-400",
    nunca: "bg-white/25",
};

export type TonoMedidor = "normal" | "aviso" | "peligro" | "ok";

const NEON: Record<TonoMedidor, string> = {
    normal: "mc-neon",
    aviso: "mc-neon--aviso",
    peligro: "mc-neon--peligro",
    ok: "mc-neon--ok",
};

const TEXTO: Record<TonoMedidor, string> = {
    normal: "text-white/85",
    aviso: "text-amber-200",
    peligro: "text-rose-200",
    ok: "text-emerald-200",
};

export function useDetalleIdes() {
    const [datos, setDatos] = useState<DetalleIdes | null>(null);
    const [cargando, setCargando] = useState(false);
    const [aviso, setAviso] = useState<string | null>(null);
    const [sincronizando, setSincronizando] = useState(false);

    const cargar = useCallback(async (primera = false) => {
        if (primera) setCargando(true);
        try {
            const r = await fetch("/api/mando/ides", { cache: "no-store" });
            const d = (await r.json()) as { detalle?: DetalleIdes };
            setDatos(d.detalle ?? null);
            setAviso(null);
        } catch {
            setAviso("No se pudo leer el estado de los IDE.");
        } finally {
            if (primera) setCargando(false);
        }
    }, []);

    useEffect(() => {
        void cargar(true);
        let id: number | null = null;
        const arrancar = () => {
            if (id === null && !document.hidden) id = window.setInterval(() => void cargar(), 5_000);
        };
        const parar = () => {
            if (id !== null) window.clearInterval(id);
            id = null;
        };
        const alCambiar = () => {
            if (document.hidden) parar();
            else {
                void cargar();
                arrancar();
            }
        };
        arrancar();
        document.addEventListener("visibilitychange", alCambiar);
        return () => {
            parar();
            document.removeEventListener("visibilitychange", alCambiar);
        };
    }, [cargar]);

    const sincronizar = useCallback(async () => {
        setSincronizando(true);
        try {
            const r = await fetch("/api/mando/ides", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accion: "sincronizar" }),
            });
            const d = (await r.json()) as { detalle?: DetalleIdes; error?: string };
            if (!r.ok) setAviso(d.error ?? "No se pudo sincronizar.");
            else {
                setDatos(d.detalle ?? null);
                setAviso("Relevo repartido a todos los IDE.");
            }
        } catch {
            setAviso("No se pudo sincronizar.");
        } finally {
            setSincronizando(false);
        }
    }, []);

    return { datos, cargando, aviso, sincronizando, cargar, sincronizar };
}

export function MedidorIdes() {
    const { datos, cargando, aviso, sincronizando, sincronizar } = useDetalleIdes();

    return (
        <section aria-label="IDEs vinculados" className="mc-cristal w-full p-3">
            <header className="mc-centrado flex flex-wrap items-baseline justify-center gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/70">
                    {datos?.titulo ?? "IDEs vinculados"}
                </h3>
                <span className="text-[11px] text-white/45">{datos?.resumen ?? ""}</span>
                <button
                    type="button"
                    disabled={sincronizando}
                    onClick={() => void sincronizar()}
                    className="mc-alzar mc-centrado cursor-pointer rounded-md border border-cyan-300/40 bg-cyan-400/10 px-2 py-1 text-[11px] text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {sincronizando ? (
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    ) : (
                        <RefreshCw className="h-3 w-3" aria-hidden />
                    )}
                    Sincronizar ahora
                </button>
            </header>

            {cargando && !datos ? (
                <p className="mt-2 flex items-center justify-center gap-2 text-[11px] text-white/50">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Leyendo…
                </p>
            ) : datos && datos.filas.length === 0 ? (
                <p className="mc-centrado mt-2 text-[11px] text-white/45">{datos.vacio}</p>
            ) : datos ? (
                <ul className="mt-2 grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
                    {datos.filas.map((f) => (
                        <li key={f.id} className="rounded-lg border border-white/10 bg-black/25 p-2 text-left">
                            <p className="flex items-center gap-1.5">
                                <span
                                    className={`h-2 w-2 shrink-0 rounded-full ${PUNTO[f.estado] ?? PUNTO.nunca}`}
                                    aria-label={f.estado}
                                    title={f.estado}
                                />
                                <span className="text-[12px] font-medium text-white/85">{f.titulo}</span>
                                <span className="rounded-full border border-white/10 px-1.5 text-[10px] text-white/45">
                                    {f.estado}
                                </span>
                            </p>
                            <p className="mt-0.5 text-[11px] leading-snug text-white/70">{f.porque}</p>
                            <p className="mt-0.5 font-mono text-[10px] text-white/35">{f.puntero}</p>
                        </li>
                    ))}
                </ul>
            ) : null}

            {aviso ? (
                <p className="mc-centrado mt-2 rounded-md border border-cyan-300/25 bg-cyan-400/10 px-2 py-1 text-[10px] text-cyan-100">
                    {aviso}
                </p>
            ) : null}
        </section>
    );
}

export function PastillaIdes() {
    const { datos, cargando, aviso, sincronizando, sincronizar } = useDetalleIdes();
    const [abierto, setAbierto] = useState(false);

    useEffect(() => {
        if (!abierto) return;
        const alPulsar = (e: KeyboardEvent) => {
            if (e.key === "Escape") setAbierto(false);
        };
        window.addEventListener("keydown", alPulsar);
        return () => window.removeEventListener("keydown", alPulsar);
    }, [abierto]);

    const total = datos?.filas.length ?? 0;
    const alDia = datos?.filas.filter((f) => f.estado === "al día").length ?? 0;
    const atrasados = datos?.filas.filter((f) => f.estado === "atrasado").length ?? 0;
    const peligroCount =
        datos?.filas.filter(
            (f) => f.estado === "peligro" || f.estado === "error" || f.estado === "fallo" || f.estado === "rojo",
        ).length ?? 0;

    let tono: TonoMedidor = "normal";
    if (peligroCount > 0) tono = "peligro";
    else if (atrasados > 0) tono = "aviso";
    else if (alDia > 0) tono = "ok";

    let valor = "—";
    if (cargando && !datos) {
        valor = "…";
    } else if (datos) {
        if (atrasados > 0) {
            valor = `${alDia} al día · ${atrasados} atrasado${atrasados > 1 ? "s" : ""}`;
        } else if (alDia > 0) {
            valor = `${alDia} al día`;
        } else if (total > 0) {
            valor = `${total} IDEs`;
        } else {
            valor = "0 IDEs";
        }
    }

    return (
        <li className={abierto ? "col-span-full" : ""}>
            <button
                type="button"
                aria-expanded={abierto}
                aria-controls="panel-ides"
                onClick={() => setAbierto((a) => !a)}
                className={`mc-cristal mc-centrado flex h-full min-h-[4.75rem] w-full flex-col items-center justify-center gap-0.5 px-3 py-2 mc-alzar cursor-pointer ${
                    abierto ? "ring-1 ring-cyan-300/40 " : ""
                }${NEON[tono]}`}
            >
                <span className="text-[10px] uppercase tracking-wider text-white/45">IDEs</span>
                <span className={`text-lg font-semibold leading-tight ${TEXTO[tono]}`}>{valor}</span>
                {datos?.resumen ? (
                    <span className="line-clamp-2 text-[10px] leading-snug text-white/45">{datos.resumen}</span>
                ) : null}
                <ChevronDown
                    aria-hidden
                    className={`h-3 w-3 shrink-0 text-white/30 transition-transform duration-200 ${
                        abierto ? "rotate-180" : ""
                    }`}
                />
            </button>

            {abierto ? (
                <section id="panel-ides" aria-label="IDEs vinculados" className="mc-cristal mc-desplegar mt-2 w-full p-3">
                    <header className="mc-centrado flex flex-wrap items-baseline justify-center gap-2">
                        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/70">
                            {datos?.titulo ?? "IDEs vinculados"}
                        </h3>
                        <span className="text-[11px] text-white/45">{datos?.resumen ?? ""}</span>
                        <button
                            type="button"
                            disabled={sincronizando}
                            onClick={() => void sincronizar()}
                            className="mc-alzar mc-centrado cursor-pointer rounded-md border border-cyan-300/40 bg-cyan-400/10 px-2 py-1 text-[11px] text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {sincronizando ? (
                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                            ) : (
                                <RefreshCw className="h-3 w-3" aria-hidden />
                            )}
                            Sincronizar ahora
                        </button>
                        <button
                            type="button"
                            onClick={() => setAbierto(false)}
                            aria-label="Cerrar"
                            className="ml-2 cursor-pointer rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-white/50"
                        >
                            ✕
                        </button>
                    </header>

                    {cargando && !datos ? (
                        <p className="mt-2 flex items-center justify-center gap-2 text-[11px] text-white/50">
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Leyendo…
                        </p>
                    ) : datos && datos.filas.length === 0 ? (
                        <p className="mc-centrado mt-2 text-[11px] text-white/45">{datos.vacio}</p>
                    ) : datos ? (
                        <ul className="mt-2 grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
                            {datos.filas.map((f) => (
                                <li key={f.id} className="rounded-lg border border-white/10 bg-black/25 p-2 text-left">
                                    <p className="flex items-center gap-1.5">
                                        <span
                                            className={`h-2 w-2 shrink-0 rounded-full ${PUNTO[f.estado] ?? PUNTO.nunca}`}
                                            aria-label={f.estado}
                                            title={f.estado}
                                        />
                                        <span className="text-[12px] font-medium text-white/85">{f.titulo}</span>
                                        <span className="rounded-full border border-white/10 px-1.5 text-[10px] text-white/45">
                                            {f.estado}
                                        </span>
                                    </p>
                                    <p className="mt-0.5 text-[11px] leading-snug text-white/70">{f.porque}</p>
                                    <p className="mt-0.5 font-mono text-[10px] text-white/35">{f.puntero}</p>
                                </li>
                            ))}
                        </ul>
                    ) : null}

                    {aviso ? (
                        <p className="mc-centrado mt-2 rounded-md border border-cyan-300/25 bg-cyan-400/10 px-2 py-1 text-[10px] text-cyan-100">
                            {aviso}
                        </p>
                    ) : null}
                </section>
            ) : null}
        </li>
    );
}
