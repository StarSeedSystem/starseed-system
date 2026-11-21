"use client";

/**
 * Medidor Antigravity — pastilla del pulso de trabajo de MetaGenesis con la
 * cuota de los modelos de Antigravity (GEM1119D).
 *
 * Lee `/api/mando/medidores?clave=creditos-antigravity` y muestra:
 *  - Pastilla: estado global (verde/ámbar/rojo) y resumen.
 *  - Panel: una fila por modelo con llamadas, tokens, cuota, reserva, error,
 *    tiempo medio y papeles. Si no hay archivos, dice «sin medir aún».
 */

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Loader2, AlertCircle, CheckCircle, AlertTriangle } from "lucide-react";

import { PanelMedidor, PastillaMedidor, type TonoMedidor } from "@/components/mando/medidor-abrible";
import type { ClaveMedidor, DetalleMedidor, FilaMedidor } from "@/lib/mando/medidores";

export type TonoAntigravity = "normal" | "aviso" | "peligro" | "ok";

const NEON: Record<TonoAntigravity, string> = {
    normal: "mc-neon",
    aviso: "mc-neon--aviso",
    peligro: "mc-neon--peligro",
    ok: "mc-neon--ok",
};

const TEXTO: Record<TonoAntigravity, string> = {
    normal: "text-white/85",
    aviso: "text-amber-200",
    peligro: "text-rose-200",
    ok: "text-emerald-200",
};

const ICONO_ESTADO: Record<TonoAntigravity, React.ReactNode> = {
    ok: <CheckCircle className="h-3 w-3 text-emerald-300" aria-hidden />,
    aviso: <AlertTriangle className="h-3 w-3 text-amber-300" aria-hidden />,
    peligro: <AlertCircle className="h-3 w-3 text-rose-300" aria-hidden />,
    normal: <span className="h-3 w-3" aria-hidden />,
};

interface ModeloAntigravity {
    id: string;
    nombre: string;
    familia: string;
    nivel: string;
    llamadasHoy: number;
    tokensHoy: number;
    cuotaEstimada: number;
    reserva20: number;
    disponibleHoy: number;
    enReserva: boolean;
    ultimoErrorCuota: { texto: string; hora: string } | null;
    tiempoMedioTurnoSeg: number;
    papeles: string[];
    tono: TonoAntigravity;
}

interface DetalleAntigravity {
    modelos: ModeloAntigravity[];
    totalLlamadasHoy: number;
    totalTokensHoy: number;
    tonoGlobal: TonoAntigravity;
    sinMedir: boolean;
    mensajeSinMedir?: string;
}

function formatearNumero(n: number): string {
    return new Intl.NumberFormat("es-ES").format(n);
}

function formatearTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
}

function tonoDeModelo(m: ModeloAntigravity): TonoAntigravity {
    if (m.enReserva) return "aviso";
    if (m.cuotaEstimada > 0 && m.llamadasHoy >= m.cuotaEstimada) return "peligro";
    if (m.ultimoErrorCuota) return "peligro";
    return "ok";
}

function PastillaAntigravity({
    abierto = false,
    alPulsar,
    datos,
    cargando,
}: {
    abierto?: boolean;
    alPulsar?: () => void;
    datos: DetalleAntigravity | null;
    cargando: boolean;
}) {
    if (cargando && !datos) {
        return (
            <button
                type="button"
                aria-expanded={abierto}
                aria-controls="panel-antigravity"
                onClick={alPulsar}
                className={`mc-cristal mc-centrado flex h-full min-h-[4.75rem] w-full flex-col items-center justify-center gap-0.5 px-3 py-2 mc-alzar cursor-pointer ${NEON.normal} ${
                    abierto ? "ring-1 ring-cyan-300/40" : ""
                }`}
            >
                <span className="text-[10px] uppercase tracking-wider text-white/45">Antigravity</span>
                <span className="text-lg font-semibold leading-tight text-white/85">
                    <Loader2 className="h-4 w-4 animate-spin inline-block" aria-hidden />
                </span>
                <ChevronDown
                    aria-hidden
                    className={`h-3 w-3 shrink-0 text-white/30 transition-transform duration-200 ${abierto ? "rotate-180" : ""}`}
                />
            </button>
        );
    }

    if (!datos || datos.sinMedir) {
        return (
            <button
                type="button"
                aria-expanded={abierto}
                aria-controls="panel-antigravity"
                onClick={alPulsar}
                className={`mc-cristal mc-centrado flex h-full min-h-[4.75rem] w-full flex-col items-center justify-center gap-0.5 px-3 py-2 mc-alzar cursor-pointer ${NEON.aviso} ${
                    abierto ? "ring-1 ring-cyan-300/40" : ""
                }`}
            >
                <span className="text-[10px] uppercase tracking-wider text-white/45">Antigravity</span>
                <span className="text-lg font-semibold leading-tight text-amber-200">sin medir aún</span>
                {datos?.mensajeSinMedir && (
                    <span className="line-clamp-2 text-[10px] leading-snug text-white/45">{datos.mensajeSinMedir}</span>
                )}
                <ChevronDown
                    aria-hidden
                    className={`h-3 w-3 shrink-0 text-white/30 transition-transform duration-200 ${abierto ? "rotate-180" : ""}`}
                />
            </button>
        );
    }

    const { tonoGlobal, totalLlamadasHoy, totalTokensHoy, modelos } = datos;
    const enReserva = modelos.some((m) => m.enReserva);
    const sinCuota = modelos.some((m) => m.cuotaEstimada > 0 && m.llamadasHoy >= m.cuotaEstimada);

    let valor = `${formatearNumero(totalLlamadasHoy)} llamadas · ${formatearTokens(totalTokensHoy)} tok`;
    if (enReserva) valor += " · reserva";
    if (sinCuota) valor += " · sin cuota";

    return (
        <button
            type="button"
            aria-expanded={abierto}
            aria-controls="panel-antigravity"
            onClick={alPulsar}
            className={`mc-cristal mc-centrado flex h-full min-h-[4.75rem] w-full flex-col items-center justify-center gap-0.5 px-3 py-2 mc-alzar cursor-pointer ${NEON[tonoGlobal]} ${
                abierto ? "ring-1 ring-cyan-300/40" : ""
            }`}
        >
            <span className="text-[10px] uppercase tracking-wider text-white/45">Antigravity</span>
            <span className={`inline-flex max-w-full items-center gap-1.5 truncate text-lg font-semibold leading-tight ${TEXTO[tonoGlobal]}`}>
                {ICONO_ESTADO[tonoGlobal]} {valor}
            </span>
            <span className="line-clamp-2 text-[10px] leading-snug text-white/45">
                {modelos.length} modelo{modelos.length !== 1 ? "s" : ""}
            </span>
            <ChevronDown
                aria-hidden
                className={`h-3 w-3 shrink-0 text-white/30 transition-transform duration-200 ${abierto ? "rotate-180" : ""}`}
            />
        </button>
    );
}

function FilaModelo({ modelo }: { modelo: ModeloAntigravity }) {
    const { id, nombre, familia, nivel, llamadasHoy, tokensHoy, cuotaEstimada, reserva20, disponibleHoy, enReserva, ultimoErrorCuota, tiempoMedioTurnoSeg, papeles, tono } = modelo;

    const queda = cuotaEstimada > 0 ? Math.max(0, cuotaEstimada - llamadasHoy) : 0;
    const pctUsado = cuotaEstimada > 0 ? Math.round((llamadasHoy / cuotaEstimada) * 100) : 0;

    return (
        <li className="rounded-lg border border-white/10 bg-black/25 p-2 text-left">
            <p className="flex flex-wrap items-baseline gap-1.5">
                <span className="font-mono text-[11px] text-cyan-200/90">{nombre}</span>
                <span className={`rounded-full border px-1.5 text-[10px] ${
                    tono === "peligro" ? "border-rose-300/35 bg-rose-400/10 text-rose-200" :
                    tono === "aviso" ? "border-amber-300/35 bg-amber-400/10 text-amber-200" :
                    "border-emerald-300/30 bg-emerald-400/10 text-emerald-200"
                }`}>
                    {tono === "peligro" ? "sin cuota" : tono === "aviso" ? "en reserva" : "ok"}
                </span>
            </p>

            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10px] leading-relaxed">
                <dt className="text-white/40">Familia / nivel:</dt>
                <dd className="text-white/70">{familia} / {nivel}</dd>

                <dt className="text-white/40">Llamadas hoy:</dt>
                <dd className={`tabular-nums ${cuotaEstimada > 0 && pctUsado >= 80 ? "text-amber-200" : "text-white/85"}`}>
                    {formatearNumero(llamadasHoy)}{cuotaEstimada > 0 ? ` / ${formatearNumero(cuotaEstimada)} (${pctUsado} %)` : ""}
                </dd>

                <dt className="text-white/40">Tokens hoy:</dt>
                <dd className="text-white/70">{formatearTokens(tokensHoy)}</dd>

                <dt className="text-white/40">Cuota estimada:</dt>
                <dd className="text-white/70">{cuotaEstimada > 0 ? formatearNumero(cuotaEstimada) : "—"}</dd>

                <dt className="text-white/40">Reserva 20 %:</dt>
                <dd className="text-white/70">{reserva20 > 0 ? formatearNumero(reserva20) : "—"}</dd>

                <dt className="text-white/40">Disponible hoy:</dt>
                <dd className={`tabular-nums ${disponibleHoy <= 0 ? "text-rose-200" : "text-emerald-200"}`}>
                    {disponibleHoy > 0 ? formatearNumero(disponibleHoy) : "0"}
                </dd>

                <dt className="text-white/40">Tiempo medio/turno:</dt>
                <dd className="text-white/70">{tiempoMedioTurnoSeg > 0 ? `${tiempoMedioTurnoSeg.toFixed(1)} s` : "—"}</dd>

                {ultimoErrorCuota && (
                    <>
                        <dt className="text-white/40">Último error de cuota:</dt>
                        <dd className="text-rose-200 break-words">{ultimoErrorCuota.texto} <span className="text-white/40">({ultimoErrorCuota.hora})</span></dd>
                    </>
                )}

                {papeles.length > 0 && (
                    <>
                        <dt className="text-white/40">Papeles:</dt>
                        <dd className="text-white/70">{papeles.join(", ")}</dd>
                    </>
                )}
            </dl>

            {enReserva && (
                <p className="mt-1 text-[10px] text-amber-200" role="status">
                    ⚠ Este modelo está en su zona de reserva (últimas 24 h cerca del límite).
                </p>
            )}
        </li>
    );
}

export function useDetalleAntigravity() {
    const [datos, setDatos] = useState<DetalleAntigravity | null>(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const cargar = useCallback(async (primera = false) => {
        if (primera) setCargando(true);
        try {
            const r = await fetch("/api/mando/medidores?clave=creditos-antigravity", { cache: "no-store" });
            const d = (await r.json()) as { detalle?: DetalleMedidor };
            if (!r.ok) throw new Error("No se pudo leer el medidor Antigravity");
            const detalle = d.detalle;
            if (!detalle) {
                setDatos({ modelos: [], totalLlamadasHoy: 0, totalTokensHoy: 0, tonoGlobal: "aviso", sinMedir: true, mensajeSinMedir: "Sin datos del servidor" });
                return;
            }
            // Convertir DetalleMedidor a DetalleAntigravity
            const filas = detalle.filas ?? [];
            const modelos: ModeloAntigravity[] = filas.map((f) => {
                const ficha = f.ficha ?? [];
                const get = (etiqueta: string) => ficha.find((x) => x.etiqueta === etiqueta)?.valor ?? "";
                return {
                    id: f.id,
                    nombre: f.titulo,
                    familia: get("Familia") || f.id.split("-").slice(0, -1).join("-"),
                    nivel: get("Nivel") || f.id.split("-").pop() || "",
                    llamadasHoy: Number(get("Llamadas hoy")?.split(" / ")[0]?.replace(/\D/g, "") || "0"),
                    tokensHoy: Number(get("Tokens hoy")?.replace(/\D/g, "") || "0"),
                    cuotaEstimada: Number(get("Cuota estimada")?.replace(/\D/g, "") || "0"),
                    reserva20: Number(get("Reserva 20 %")?.replace(/\D/g, "") || "0"),
                    disponibleHoy: Number(get("Disponible hoy")?.replace(/\D/g, "") || "0"),
                    enReserva: f.estado === "en reserva" || f.estado === "aviso",
                    ultimoErrorCuota: get("Último error de cuota") ? { texto: get("Último error de cuota").split(" (")[0], hora: get("Último error de cuota").split(" (")[1]?.replace(")", "") || "" } : null,
                    tiempoMedioTurnoSeg: Number(get("Tiempo medio/turno")?.replace(" s", "") || "0"),
                    papeles: get("Papeles")?.split(", ").filter(Boolean) || [],
                    tono: (f.estado === "sin cuota" || f.estado === "peligro") ? "peligro" : f.estado === "en reserva" || f.estado === "aviso" ? "aviso" : "ok",
                };
            });
            const totalLlamadasHoy = modelos.reduce((s, m) => s + m.llamadasHoy, 0);
            const totalTokensHoy = modelos.reduce((s, m) => s + m.tokensHoy, 0);
            const tonoGlobal = modelos.some((m) => m.tono === "peligro") ? "peligro" :
                              modelos.some((m) => m.tono === "aviso") ? "aviso" :
                              modelos.length > 0 ? "ok" : "aviso";
            const sinMedir = filas.length === 0;
            setDatos({ modelos, totalLlamadasHoy, totalTokensHoy, tonoGlobal, sinMedir, mensajeSinMedir: sinMedir ? "Sin modelos medidos todavía. Ejecuta `python3 scripts/puente/antigravity_flota.py modelos` para poblar el catálogo." : undefined });
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Error desconocido");
            setDatos({ modelos: [], totalLlamadasHoy: 0, totalTokensHoy: 0, tonoGlobal: "aviso", sinMedir: true, mensajeSinMedir: "No se pudo leer el medidor" });
        } finally {
            if (primera) setCargando(false);
        }
    }, []);

    useEffect(() => {
        void cargar(true);
        const id = window.setInterval(() => void cargar(), 30_000);
        return () => window.clearInterval(id);
    }, [cargar]);

    return { datos, cargando, error, recargar: cargar };
}

export function MedidorAntigravity() {
    const { datos, cargando, error, recargar } = useDetalleAntigravity();

    return (
        <section aria-label="Antigravity" className="mc-cristal w-full p-3">
            <header className="mc-centrado flex flex-wrap items-baseline justify-center gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/70">
                    {datos?.modelos.length ? `Antigravity (${datos.modelos.length} modelos)` : "Antigravity"}
                </h3>
                <span className="text-[11px] text-white/45">
                    {datos?.sinMedir ? "sin medir aún" : datos ? `${formatearNumero(datos.totalLlamadasHoy)} llamadas · ${formatearTokens(datos.totalTokensHoy)} tok` : "cargando…"}
                </span>
                <button
                    type="button"
                    onClick={() => void recargar()}
                    className="mc-alzar mc-centrado cursor-pointer rounded-md border border-cyan-300/40 bg-cyan-400/10 px-2 py-1 text-[11px] text-cyan-100"
                >
                    Recargar
                </button>
            </header>

            {cargando && !datos ? (
                <p className="mt-2 flex items-center justify-center gap-2 text-[11px] text-white/50">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Leyendo…
                </p>
            ) : datos?.sinMedir ? (
                <p className="mc-centrado mt-2 text-[11px] text-white/45">{datos.mensajeSinMedir ?? "Sin modelos medidos todavía"}</p>
            ) : datos && datos.modelos.length === 0 ? (
                <p className="mc-centrado mt-2 text-[11px] text-white/45">{datos.mensajeSinMedir ?? "Sin modelos medidos todavía"}</p>
            ) : datos ? (
                <ul className="mt-2 grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
                    {datos.modelos.map((m) => (
                        <FilaModelo key={m.id} modelo={m} />
                    ))}
                </ul>
            ) : null}

            {error && (
                <p className="mc-centrado mt-2 rounded-md border border-rose-300/30 bg-rose-400/10 px-2 py-1.5 text-[11px] leading-snug text-rose-100">
                    {error}
                </p>
            )}
        </section>
    );
}

export function PastillaAntigravityWrapper({
    abierto = false,
    alPulsar,
}: {
    abierto?: boolean;
    alPulsar?: () => void;
}) {
    const { datos, cargando } = useDetalleAntigravity();
    return <PastillaAntigravity abierto={abierto} alPulsar={alPulsar} datos={datos} cargando={cargando} />;
}

export function PanelAntigravity({ alCerrar }: { alCerrar: () => void }) {
    const { datos, cargando, error, recargar } = useDetalleAntigravity();

    useEffect(() => {
        const alPulsar = (e: KeyboardEvent) => {
            if (e.key === "Escape") alCerrar();
        };
        window.addEventListener("keydown", alPulsar);
        return () => window.removeEventListener("keydown", alPulsar);
    }, [alCerrar]);

    return (
        <section
            id="panel-antigravity"
            role="region"
            aria-label="Detalle de Antigravity"
            className="mc-cristal mc-desplegar mt-2 w-full p-3"
        >
            <header className="mc-centrado flex flex-wrap items-baseline justify-center gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/70">
                    {datos?.modelos.length ? `Antigravity (${datos.modelos.length} modelos)` : "Antigravity"}
                </h3>
                <span className="text-[11px] text-white/45">
                    {datos?.sinMedir ? "sin medir aún" : datos ? `${formatearNumero(datos.totalLlamadasHoy)} llamadas · ${formatearTokens(datos.totalTokensHoy)} tok` : "cargando…"}
                </span>
                <button
                    type="button"
                    onClick={() => void recargar()}
                    className="mc-alzar mc-centrado cursor-pointer rounded-md border border-cyan-300/40 bg-cyan-400/10 px-2 py-1 text-[11px] text-cyan-100"
                >
                    Recargar
                </button>
                <button
                    type="button"
                    onClick={alCerrar}
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
            ) : datos?.sinMedir ? (
                <p className="mc-centrado mt-2 text-[11px] text-white/45">{datos.mensajeSinMedir ?? "Sin modelos medidos todavía. Ejecuta `python3 scripts/puente/antigravity_flota.py modelos` para poblar el catálogo."}</p>
            ) : datos && datos.modelos.length === 0 ? (
                <p className="mc-centrado mt-2 text-[11px] text-white/45">Catálogo vacío. Ejecuta `python3 scripts/puente/antigravity_flota.py modelos` para poblarlo.</p>
            ) : datos ? (
                <ul className="mt-2 grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
                    {datos.modelos.map((m) => (
                        <FilaModelo key={m.id} modelo={m} />
                    ))}
                </ul>
            ) : null}

            {error && (
                <p className="mc-centrado mt-2 rounded-md border border-rose-300/30 bg-rose-400/10 px-2 py-1.5 text-[11px] leading-snug text-rose-100">
                    {error}
                </p>
            )}
        </section>
    );
}