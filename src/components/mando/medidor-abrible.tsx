"use client";

/**
 * Medidor abrible — la pastilla de la cabecera que ahora se abre (2026-09-15).
 *
 * Antes cada medidor decía un número y te dejaba solo: «23 bloqueadas» y a
 * buscarte la vida. Ahora se abre y enseña cuáles, por qué, y qué puedes hacer
 * con cada una.
 *
 * Decisiones que no son de gusto:
 *   · El detalle se pide SOLO al abrir. Ocho peticiones al montar la página es lo
 *     contrario de «que no ocupe muchos recursos».
 *   · Confirmación en dos pasos en el propio botón, nunca `window.confirm`: ese
 *     bloquea el hilo y congela todo el Mando mientras está abierto.
 *   · Un reintento sin describir el cambio no se puede enviar. Sería el mismo
 *     intento y fallaría exactamente igual.
 *   · Título, valor y botones CENTRADOS (lo pidió Alex). Las filas del panel van
 *     alineadas a la izquierda a propósito: son datos que se leen en columna y
 *     centrarlos los vuelve ilegibles. No lo «arregles».
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

import type { AccionMedidor, ClaveMedidor, DetalleMedidor, FilaMedidor } from "@/lib/mando/medidores";

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

/** Un botón de acción: rojo y a dos clics si borra; con campo si pide texto. */
function BotonAccion({
    accion,
    fila,
    alAccionar,
}: {
    accion: AccionMedidor;
    fila?: FilaMedidor;
    alAccionar: (a: AccionMedidor, f: FilaMedidor | undefined, texto: string) => Promise<void>;
}) {
    const [confirmando, setConfirmando] = useState(false);
    const [pidiendo, setPidiendo] = useState(false);
    const [texto, setTexto] = useState("");
    const [ocupado, setOcupado] = useState(false);

    const ejecutar = useCallback(async () => {
        setOcupado(true);
        try {
            await alAccionar(accion, fila, texto);
        } finally {
            setOcupado(false);
            setConfirmando(false);
            setPidiendo(false);
            setTexto("");
        }
    }, [accion, alAccionar, fila, texto]);

    if (accion.pideTexto && pidiendo) {
        return (
            <span className="inline-flex flex-wrap items-center gap-1.5">
                <input
                    autoFocus
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder={accion.pideTexto}
                    aria-label={accion.pideTexto}
                    className="min-w-56 flex-1 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-[11px] text-white/90 outline-none focus:border-cyan-300/50"
                />
                <button
                    type="button"
                    disabled={!texto.trim() || ocupado}
                    onClick={() => void ejecutar()}
                    className="mc-alzar cursor-pointer rounded-md border border-cyan-300/40 bg-cyan-400/10 px-2 py-1 text-[11px] text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    Enviar
                </button>
                <button
                    type="button"
                    onClick={() => setPidiendo(false)}
                    className="cursor-pointer rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/50"
                >
                    Cancelar
                </button>
            </span>
        );
    }

    const peligrosa = accion.destructiva;
    return (
        <button
            type="button"
            disabled={ocupado}
            onClick={() => {
                if (accion.pideTexto) return setPidiendo(true);
                if (peligrosa && !confirmando) return setConfirmando(true);
                void ejecutar();
            }}
            onBlur={() => setConfirmando(false)}
            className={`mc-alzar mc-centrado cursor-pointer rounded-md border px-2 py-1 text-[11px] ${
                peligrosa
                    ? confirmando
                        ? "border-rose-400/70 bg-rose-500/25 text-rose-100"
                        : "border-rose-400/30 bg-rose-500/10 text-rose-200"
                    : "border-white/15 bg-white/5 text-white/75"
            }`}
        >
            {ocupado ? "…" : confirmando ? "¿Seguro?" : accion.texto}
        </button>
    );
}

export function MedidorAbrible({
    clave,
    titulo,
    valor,
    detalle,
    tono = "normal",
    alAccionar,
    alIrA,
}: {
    clave: ClaveMedidor;
    titulo: string;
    valor: string;
    /** Texto pequeño bajo el valor. */
    detalle?: string;
    tono?: TonoMedidor;
    /** Ejecuta una acción; devuelve un mensaje para enseñar bajo el panel. */
    alAccionar?: (clave: ClaveMedidor, a: AccionMedidor, f: FilaMedidor | undefined, texto: string) => Promise<string>;
    alIrA?: (destino: string) => void;
}) {
    const [abierto, setAbierto] = useState(false);
    const [datos, setDatos] = useState<DetalleMedidor | null>(null);
    const [cargando, setCargando] = useState(false);
    const [aviso, setAviso] = useState<string | null>(null);
    const boton = useRef<HTMLButtonElement | null>(null);
    const idPanel = `medidor-${clave}`;

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            const r = await fetch(`/api/mando/medidores?clave=${encodeURIComponent(clave)}`, { cache: "no-store" });
            const d = (await r.json()) as { detalle?: DetalleMedidor };
            setDatos(d.detalle ?? null);
        } catch {
            setAviso("No se pudo leer el detalle.");
        } finally {
            setCargando(false);
        }
    }, [clave]);

    useEffect(() => {
        if (abierto && !datos) void cargar();
    }, [abierto, datos, cargar]);

    // Escape cierra y devuelve el foco a la pastilla: si no, el foco se queda
    // perdido en el panel y con el teclado no hay forma de volver.
    useEffect(() => {
        if (!abierto) return;
        const alPulsar = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setAbierto(false);
                boton.current?.focus();
            }
        };
        window.addEventListener("keydown", alPulsar);
        return () => window.removeEventListener("keydown", alPulsar);
    }, [abierto]);

    const ejecutar = useCallback(
        async (a: AccionMedidor, f: FilaMedidor | undefined, texto: string) => {
            if (a.clase === "ir-a") {
                if (a.destino) alIrA?.(a.destino);
                return;
            }
            if (!alAccionar) return;
            const mensaje = await alAccionar(clave, a, f, texto);
            setAviso(mensaje);
            setDatos(null); // que se relea: el estado acaba de cambiar
            void cargar();
        },
        [alAccionar, alIrA, clave, cargar],
    );

    return (
        <li className="min-w-32">
            <button
                ref={boton}
                type="button"
                aria-expanded={abierto}
                aria-controls={idPanel}
                onClick={() => setAbierto((a) => !a)}
                className={`mc-cristal mc-alzar mc-centrado flex w-full cursor-pointer flex-col gap-0.5 px-3 py-2 ${NEON[tono]}`}
            >
                <span className="text-[10px] uppercase tracking-wider text-white/45">{titulo}</span>
                <span className={`text-lg font-semibold leading-tight ${TEXTO[tono]}`}>{valor}</span>
                {detalle ? <span className="text-[10px] leading-snug text-white/45">{detalle}</span> : null}
                <ChevronDown
                    aria-hidden
                    className={`h-3 w-3 text-white/35 transition-transform duration-200 ${abierto ? "rotate-180" : ""}`}
                />
            </button>

            {abierto ? (
                <div
                    id={idPanel}
                    role="region"
                    aria-label={`Detalle de ${titulo}`}
                    className="mc-cristal mc-desplegar mt-1.5 w-[min(30rem,86vw)] p-3 text-left"
                >
                    {cargando && !datos ? (
                        <p className="flex items-center gap-2 text-[11px] text-white/50">
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                            Leyendo…
                        </p>
                    ) : null}

                    {datos ? (
                        <>
                            <p className="mc-centrado text-[11px] text-white/60">{datos.resumen}</p>

                            {datos.filas.length === 0 ? (
                                <p className="mt-2 text-[11px] leading-relaxed text-white/45">{datos.vacio}</p>
                            ) : (
                                <ul className="mt-2 space-y-1.5">
                                    {datos.filas.map((f) => (
                                        <li key={f.id} className="rounded-lg border border-white/10 bg-black/25 p-2">
                                            <p className="flex flex-wrap items-baseline gap-1.5">
                                                <span className="font-mono text-[11px] text-cyan-200/90">{f.id}</span>
                                                <span className="text-[11px] text-white/80">{f.titulo}</span>
                                                {f.estado ? (
                                                    <span className="rounded-full border border-white/10 px-1.5 text-[10px] text-white/45">
                                                        {f.estado}
                                                    </span>
                                                ) : null}
                                            </p>
                                            {f.porque ? (
                                                <p className="mt-0.5 text-[10px] leading-relaxed text-white/50">{f.porque}</p>
                                            ) : null}
                                            {f.quien || f.desde ? (
                                                <p className="mt-0.5 text-[10px] text-white/35">
                                                    {[f.quien, f.desde].filter(Boolean).join(" · ")}
                                                </p>
                                            ) : null}
                                            {f.acciones.length ? (
                                                <p className="mt-1.5 flex flex-wrap gap-1.5">
                                                    {f.acciones.map((a) => (
                                                        <BotonAccion
                                                            key={`${f.id}-${a.clase}`}
                                                            accion={a}
                                                            fila={f}
                                                            alAccionar={ejecutar}
                                                        />
                                                    ))}
                                                </p>
                                            ) : null}
                                        </li>
                                    ))}
                                </ul>
                            )}

                            {datos.acciones.length ? (
                                <p className="mc-centrado mt-2.5 flex flex-wrap justify-center gap-1.5 border-t border-white/10 pt-2.5">
                                    {datos.acciones.map((a) => (
                                        <BotonAccion key={a.clase} accion={a} alAccionar={ejecutar} />
                                    ))}
                                </p>
                            ) : null}
                        </>
                    ) : null}

                    {aviso ? (
                        <p className="mt-2 rounded-md border border-cyan-300/25 bg-cyan-400/10 px-2 py-1 text-[10px] text-cyan-100">
                            {aviso}
                        </p>
                    ) : null}
                </div>
            ) : null}
        </li>
    );
}
