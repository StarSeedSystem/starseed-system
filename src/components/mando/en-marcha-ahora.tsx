"use client";

/**
 * (2026-11-11, MED1111E) «Qué corre ahora y qué acaba de terminar», en un solo lugar y en este orden:
 * el carril del director de Claude, la puerta de integración y la publicación.
 *
 * Alex: «reporta los procesos activos, ya que en MetaGenesis siguen sin aparecer». Seis horas de agentes
 * de Claude y compuertas de integración, y Genesis decía «ningún proceso». Aquí se lee lo que esas dos
 * fuentes dejan (`carril-claude.ts`, `puerta-integracion.ts`) y se dice sin adornos: viva solo con
 * rastro reciente, «sin señal» si no, y con nada en marcha, lo último que terminó y cuándo.
 *
 * Sin `datos`, se lee solo de `/api/mando/medidores?clave=agentes` (la misma ruta de los medidores, que ya
 * trae `enMarcha`). En el teléfono todo envuelve: nada se recorta ni se corta con puntos suspensivos.
 */
import { useEffect, useState } from "react";

import { duracionCorta } from "@/lib/mando/carril-claude";
import { vistaEnMarcha, type EnMarcha } from "@/lib/mando/en-marcha";
import { textoPruebas } from "@/lib/mando/puerta-integracion";

type Tono = "vivo" | "aviso" | "rojo" | "verde" | "quieto";

const PUNTO: Record<Tono, string> = {
    vivo: "bg-emerald-400",
    verde: "bg-emerald-400",
    aviso: "bg-amber-400",
    rojo: "bg-red-400",
    quieto: "bg-zinc-600",
};

function Bloque({ n, titulo, tono, etiqueta, children, id }: { n: number; titulo: string; tono: Tono; etiqueta: string; children: React.ReactNode; id: string }) {
    return (
        <section className="rounded-lg border border-white/10 bg-black/20 p-3" data-testid={`en-marcha-${id}`} aria-label={titulo}>
            <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[11px] font-medium text-white/40">{n}</span>
                <span className={`h-2 w-2 shrink-0 rounded-full ${PUNTO[tono]}`} aria-hidden />
                <h4 className="text-sm font-semibold text-white">{titulo}</h4>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/70" data-testid={`en-marcha-${id}-estado`}>
                    {etiqueta}
                </span>
            </header>
            <div className="mt-2 space-y-2 text-xs text-white/70">{children}</div>
        </section>
    );
}

function Fila({ id, titulo, detalle }: { id: string; titulo: string; detalle?: string }) {
    return (
        <li className="rounded-md border border-white/5 bg-white/[0.03] px-2.5 py-2">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-mono text-[12px] font-semibold text-white/90">{id}</span>
                {detalle ? <span className="text-[11px] text-white/50">{detalle}</span> : null}
            </div>
            <p className="mt-0.5 break-words text-[12px] leading-snug text-white/75">{titulo}</p>
        </li>
    );
}

export function EnMarchaAhoraVista({ datos, ahora }: { datos: EnMarcha | null | undefined; ahora: number }) {
    const v = vistaEnMarcha(datos, ahora);
    const { carril, puerta, publicacion } = v;
    const tonoCarril: Tono = carril.estado === "vivo" ? "vivo" : carril.estado === "sin-latido" ? "aviso" : "quieto";
    const etiquetaCarril =
        carril.estado === "vivo"
            ? `${carril.agentes.length} ${carril.agentes.length === 1 ? "agente vivo" : "agentes vivos"}`
            : carril.estado === "sin-latido"
              ? "sin latido"
              : carril.estado === "vacio"
                ? "nada abierto"
                : "sin registro";
    const tonoPuerta: Tono = puerta.estado === "corriendo" ? "vivo" : puerta.estado === "sin-senal" ? "aviso" : puerta.estado === "rojo" ? "rojo" : puerta.estado === "verde" ? "verde" : "quieto";
    const etiquetaPuerta = { corriendo: "en marcha", "sin-senal": "sin señal", verde: "terminó en verde", rojo: "terminó en rojo", "sin-datos": "sin datos" }[puerta.estado];
    const tonoPub: Tono = publicacion.estado === "publicando" ? "vivo" : publicacion.estado === "bloqueada" || publicacion.estado === "sin-senal" ? "aviso" : "quieto";
    const etiquetaPub = { publicando: "publicando", "en-reposo": "en reposo", bloqueada: "bloqueada", apagada: "apagada", "sin-senal": "sin señal", "sin-datos": "sin datos" }[publicacion.estado];

    return (
        <article className="rounded-xl border border-white/10 bg-black/30 p-3 sm:p-4" data-testid="en-marcha-ahora" data-algo-corre={v.algoCorre ? "si" : "no"}>
            <h3 className="text-sm font-semibold text-white">Qué corre ahora</h3>
            <p className="mt-1 break-words text-[13px] leading-snug text-white/85" data-testid="en-marcha-frase">
                {v.frase}
            </p>

            <div className="mt-3 space-y-2.5">
                <Bloque n={1} id="carril" titulo="Carril del director de Claude" tono={tonoCarril} etiqueta={etiquetaCarril}>
                    <p className="break-words" data-testid="en-marcha-carril-texto">
                        {carril.texto}
                    </p>
                    {carril.agentes.length ? (
                        <ul className="space-y-1.5" data-testid="en-marcha-agentes">
                            {carril.agentes.map((a) => (
                                <Fila key={a.id} id={a.id} titulo={a.titulo} detalle={`${a.ola ? `ola ${a.ola} · ` : ""}${a.minutos === null ? "sin hora de inicio" : `${duracionCorta(a.minutos)} en marcha`} · carril de Claude`} />
                            ))}
                        </ul>
                    ) : null}
                    {carril.sinLatido.length ? (
                        <ul className="space-y-1.5" data-testid="en-marcha-sin-latido">
                            {carril.sinLatido.map((a) => (
                                <Fila key={a.id} id={a.id} titulo={a.titulo} detalle={`sin latido desde hace ${duracionCorta(carril.latidoHaceMin ?? 0)} · no cuenta como viva`} />
                            ))}
                        </ul>
                    ) : null}
                    {carril.enCola.length ? (
                        <div data-testid="en-marcha-cola">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-white/40">En cola ({carril.enCola.length}) · aún no son agentes</p>
                            <ul className="mt-1 space-y-1">
                                {carril.enCola.map((t) => (
                                    <li key={t.id} className="break-words text-[12px] text-white/60">
                                        <span className="font-mono text-white/80">{t.id}</span> · {t.titulo}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}
                </Bloque>

                <Bloque n={2} id="puerta" titulo="Puerta de integración" tono={tonoPuerta} etiqueta={etiquetaPuerta}>
                    <p className="break-words" data-testid="en-marcha-puerta-texto">
                        {puerta.texto}
                    </p>
                    {puerta.estado === "corriendo" || puerta.estado === "sin-senal" ? (
                        <div>
                            <div className="flex gap-1" role="img" aria-label={`paso ${puerta.numeroPaso} de ${puerta.totalPasos}`}>
                                {Array.from({ length: puerta.totalPasos }, (_, i) => (
                                    <span key={i} className={`h-1.5 flex-1 rounded-full ${i + 1 < puerta.numeroPaso ? "bg-emerald-500/70" : i + 1 === puerta.numeroPaso ? (puerta.estado === "corriendo" ? "bg-emerald-300" : "bg-amber-400") : "bg-white/10"}`} />
                                ))}
                            </div>
                            <p className="mt-1 text-[11px] text-white/45">
                                {puerta.minutosTotales !== null ? `lleva ${duracionCorta(puerta.minutosTotales)} en total · ` : ""}
                                {puerta.origen === "log" ? "leído del log de la puerta" : "estado escrito por la puerta"}
                            </p>
                        </div>
                    ) : null}
                    {puerta.estado === "verde" || puerta.estado === "rojo" ? (
                        <p className="text-[11px] text-white/45" data-testid="en-marcha-puerta-resultado">
                            {puerta.estado === "rojo" ? `${textoPruebas(puerta.pruebas) || "sin cuentas de pruebas"} · ` : ""}
                            {puerta.origen === "log" ? "leído del log de la puerta" : "estado escrito por la puerta"}
                        </p>
                    ) : null}
                </Bloque>

                <Bloque n={3} id="publicacion" titulo="Publicación" tono={tonoPub} etiqueta={etiquetaPub}>
                    <p className="break-words" data-testid="en-marcha-publicacion-texto">
                        {publicacion.texto}
                    </p>
                </Bloque>
            </div>
        </article>
    );
}

/** Con `datos` los pinta; sin ellos, los lee de la ruta de medidores y se actualiza cada 20 s. */
export function EnMarchaAhora({ datos }: { datos?: EnMarcha | null }) {
    const [propios, setPropios] = useState<EnMarcha | null | undefined>(undefined);
    const [ahora, setAhora] = useState(() => Date.now());
    const [error, setError] = useState(false);

    useEffect(() => {
        const reloj = window.setInterval(() => setAhora(Date.now()), 30_000);
        return () => window.clearInterval(reloj);
    }, []);

    useEffect(() => {
        if (datos !== undefined) return;
        let vivo = true;
        const leer = async () => {
            try {
                const r = await fetch("/api/mando/medidores?clave=agentes", { cache: "no-store" });
                const d = (await r.json()) as { enMarcha?: EnMarcha | null };
                if (vivo) {
                    setPropios(d.enMarcha ?? null);
                    setError(false);
                }
            } catch {
                if (vivo) setError(true);
            }
        };
        void leer();
        const id = window.setInterval(() => void leer(), 20_000);
        return () => {
            vivo = false;
            window.clearInterval(id);
        };
    }, [datos]);

    const elegidos = datos !== undefined ? datos : propios;
    if (datos === undefined && propios === undefined && !error) {
        return <p className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/50">Leyendo qué corre ahora…</p>;
    }
    if (error && propios === undefined) {
        return <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-100">No se pudo leer qué corre ahora: no se enseña ninguna cifra inventada.</p>;
    }
    return <EnMarchaAhoraVista datos={elegidos} ahora={ahora} />;
}
