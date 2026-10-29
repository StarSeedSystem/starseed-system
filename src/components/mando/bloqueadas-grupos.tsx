"use client";

/**
 * «Bloqueadas» en tres grupos (OPB1011, 2026-10-10 · `architecture/ninguna-tarea-se-desperdicia.md`).
 *
 * Alex: «hay demasiadas tareas bloqueadas en MetaGenesis». Eran 40 esperas normales de dos
 * cadenas mezcladas con los atascos de verdad. Aquí se separan:
 *   · En cadena — «N esperan a X, que va por Y»: se mueven solas cuando X llega a main.
 *   · Transformadas hoy — qué hizo el revisor automático con cada tarea quieta y por qué.
 *   · Necesitan a Alex — UNA pregunta con sus botones (rehacer / descartar).
 * Lo que queda («atascadas») sigue en `BloqueadasPanel`, con sus botones de siempre.
 *
 * (2026-10-20) Este componente es LA vista de «Bloqueadas»: lo pintan el medidor del pulso y la
 * sección «Bloqueadas y rechazadas» de Ramificación con el mismo detalle (`/api/mando/medidores?
 * clave=bloqueadas`), así que no pueden decir cosas distintas. Las cadenas salen a su propio
 * medidor («En cadena», `CadenasBloqueadas`) y entran las fallidas o rechazadas sin resolver.
 */

import { useCallback, useState } from "react";

import type { DetalleMedidor, FilaMedidor } from "@/lib/mando/medidores";
import {
    NOMBRE_ACCION,
    enReparacion,
    sujetoDeTransformada,
    type OpcionAlex,
    type ResumenBloqueadas,
} from "@/lib/mando/bloqueadas";
import { BloqueadasPanel, itemDesdeFilaMedidor } from "./bloqueadas-panel";
import { SeccionPlegable } from "./seccion-plegable";

const TEXTO_OPCION: Record<OpcionAlex, string> = {
    rehacer: "Rehacer con otro enfoque",
    descartar: "Descartar (rama guardada)",
};

function hora(t?: string): string {
    const m = /(\d{2}:\d{2})/.exec(String(t ?? ""));
    return m ? m[1] : "";
}

function Cifra({ valor, texto, tono }: { valor: number; texto: string; tono: string }) {
    return (
        <span className={`rounded-md border px-2 py-1 text-[11px] ${tono}`}>
            <b className="mr-1 text-[13px] tabular-nums">{valor}</b>
            {texto}
        </span>
    );
}

/** Una causa de bloqueo o rechazo, ya dicha para una persona. */
export interface CausaDeBloqueada {
    clave: string;
    titulo: string;
    /** La acción automática que la trata, si el sistema hace algo solo con ella. */
    accion?: string;
}

export interface GrupoPorCausa {
    causa: CausaDeBloqueada;
    filas: FilaMedidor[];
}

/**
 * (UIG1029C) La causa de una fila, en castellano y agrupable. Mira primero el estado
 * (rechazada, bloqueante, fallo…) y después el porqué, para que dos tareas con el mismo
 * atasco caigan en la MISMA sección aunque sus ids no se parezcan.
 */
export function causaDeFila(f: Pick<FilaMedidor, "estado" | "porque">): CausaDeBloqueada {
    const estado = String(f.estado ?? "").toLowerCase();
    const p = String(f.porque ?? "").toLowerCase();

    if (/rechazad/.test(estado)) return { clave: "rechazada", titulo: "Rechazadas por la revisión" };
    if (/bloqueante/.test(estado) || /necesita una persona|agotó los reintentos/.test(p)) {
        return { clave: "bloqueante", titulo: "Pegas bloqueantes de la revisión" };
    }
    if (/sin salida/.test(estado) || /sin salida/.test(p)) {
        return { clave: "sin-salida", titulo: "Bloqueadas sin salida" };
    }
    if (/puede desbloquearse/.test(p)) {
        return {
            clave: "desbloqueable",
            titulo: "Dependencia ya integrada: pueden desbloquearse",
            accion: "El revisor las desbloqueará en su próxima pasada",
        };
    }
    if (/^espera a|dependencia no integrada|siguen vivas|espera normal/.test(p)) {
        return {
            clave: "dependencia",
            titulo: "Esperando una dependencia viva",
            accion: "Se desbloquean solas cuando su dependencia llega a main",
        };
    }
    if (/sin motivo|nadie sabe|sin dependencia anotada/.test(p)) {
        return { clave: "sin-motivo", titulo: "Bloqueadas sin motivo anotado" };
    }
    if (/sin cambios/.test(estado)) return { clave: "sin-cambios", titulo: "Sin cambios al escribir" };
    if (/conflicto/.test(estado)) return { clave: "conflicto", titulo: "Conflictos al integrar" };
    if (/interrumpida/.test(estado)) return { clave: "interrumpida", titulo: "Interrumpidas al escribir" };
    if (/faltan/.test(estado)) return { clave: "faltan", titulo: "Les faltan piezas" };
    if (/fallo|falla/.test(estado)) return { clave: "fallo", titulo: "Fallos de ejecución" };
    return { clave: "otras", titulo: "Otras causas" };
}

/** Qué hace ya el sistema con esta fila, leído de su porqué (rehacer, escalera, revisor). */
export function accionQueLaTrata(f: Pick<FilaMedidor, "porque">): string | null {
    const p = String(f.porque ?? "");
    // La escalera también cuenta como «en reparación»: se mira antes para no perder el matiz.
    if (/escalera/i.test(p)) return "La lleva la escalera del director";
    if (enReparacion(f)) {
        const m = /^la rehace\s+([\w.-]+)/i.exec(p);
        return m ? `La rehace ${m[1]}` : "La rehace el director";
    }
    if (/puede desbloquearse/i.test(p)) return "El revisor la desbloqueará sola";
    return null;
}

/** Agrupa por causa; primero la que más tareas tiene (empate: orden alfabético estable). */
export function agruparPorCausa(filas: readonly FilaMedidor[]): GrupoPorCausa[] {
    const grupos = new Map<string, GrupoPorCausa>();
    for (const f of filas) {
        const causa = causaDeFila(f);
        const g = grupos.get(causa.clave) ?? { causa, filas: [] };
        g.filas.push(f);
        grupos.set(causa.clave, g);
    }
    return [...grupos.values()].sort(
        (a, b) => b.filas.length - a.filas.length || a.causa.titulo.localeCompare(b.causa.titulo, "es"),
    );
}

/** La acción automática del grupo: la primera que ya trata alguna fila, o la de la causa. */
export function accionDeGrupo(g: GrupoPorCausa): string | undefined {
    const tratadas = g.filas.map((f) => accionQueLaTrata(f)).filter((x): x is string => Boolean(x));
    if (tratadas.length === 0) return g.causa.accion;
    return tratadas.length > 1 ? `${tratadas[0]} (+${tratadas.length - 1} más)` : tratadas[0];
}

export function BloqueadasGrupos({
    detalle,
    alHecho,
    alVer,
}: {
    detalle: DetalleMedidor;
    alHecho?: () => void;
    /** Si se da (Ramificación), el id de cada ficha abre la tarea en el árbol. */
    alVer?: (id: string) => void;
}) {
    const r: ResumenBloqueadas | undefined = detalle.bloqueadas;
    const [enviando, setEnviando] = useState<string | null>(null);
    const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

    const decidir = useCallback(
        async (id: string, opcion: OpcionAlex) => {
            setEnviando(`${id}:${opcion}`);
            setResultado(null);
            try {
                const res = await fetch("/api/mando/medidores", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ clave: "bloqueadas", accion: "decidir-bloqueada", id, opcion }),
                });
                const d = (await res.json().catch(() => ({}))) as { resumen?: string; error?: string };
                setResultado(
                    res.ok && !d.error
                        ? { ok: true, texto: d.resumen || "Hecho." }
                        : { ok: false, texto: d.error || `No respondió (${res.status}).` },
                );
            } catch {
                setResultado({ ok: false, texto: "La consola local no respondió." });
            } finally {
                setEnviando(null);
                alHecho?.();
            }
        },
        [alHecho],
    );

    const operativas = detalle.filas.filter((f) => !f.historica && f.grupo !== "cadena");
    const idsConocidos = detalle.filas.map((x) => x.id);
    // Las que ya tienen su pregunta a Alex no se repiten en las causas: se referencian arriba.
    const idsAlex = new Set((r?.preguntas ?? []).map((p) => p.id));
    const grupos = agruparPorCausa(operativas.filter((f) => !idsAlex.has(f.id)));
    const mayor = grupos.reduce((n, g) => Math.max(n, g.filas.length), 0);
    const testIdDeGrupo = (g: GrupoPorCausa) =>
        g.filas.every((f) => f.grupo === "sin-resolver")
            ? "bloqueadas-sin-resolver"
            : g.filas.every((f) => (f.grupo ?? "atascada") === "atascada")
              ? "bloqueadas-atascadas"
              : undefined;

    return (
        <section className="mt-2 grid gap-3 text-left" data-testid="bloqueadas-grupos">
            {r ? (
                <p className="flex flex-wrap items-center justify-center gap-1.5" data-testid="bloqueadas-cifras">
                    <Cifra valor={r.atascadas} texto="atascadas" tono="border-rose-400/30 bg-rose-500/10 text-rose-100" />
                    <Cifra valor={r.alex} texto="te necesitan" tono="border-amber-400/30 bg-amber-500/10 text-amber-100" />
                    <Cifra
                        valor={r.sinResolver ?? 0}
                        texto="fallidas o rechazadas sin resolver"
                        tono="border-orange-400/30 bg-orange-500/10 text-orange-100"
                    />
                    <Cifra
                        valor={r.transformadasHoy}
                        texto="transformadas hoy"
                        tono="border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                    />
                    <span className="w-full text-center text-[10px] text-white/40" data-testid="revisor-frescura">
                        {r.revisorAlDia
                            ? `Revisor automático: última pasada a las ${hora(r.revisorDesde)}${r.revisorMedio ? ` en ${r.revisorMedio}` : ""} (cada 5 min).`
                            : r.revisorDesde
                              ? `El revisor automático no pasa desde las ${hora(r.revisorDesde)}: lo vigila la autocuración.`
                              : "El revisor automático aún no ha pasado por esta máquina."}
                    </span>
                    {r.enCadena ? (
                        <span className="w-full text-center text-[10px] text-cyan-100/60" data-testid="bloqueadas-en-cadena-aparte">
                            Aparte, {r.enCadena} en cadena: esperan a otra tarea que avanza y se desbloquean solas
                            (medidor «En cadena»).
                        </span>
                    ) : null}
                </p>
            ) : null}

            {r && r.preguntas.length ? (
                <SeccionPlegable
                    id="bloqueadas-alex"
                    titulo="Necesitan a Alex · una decisión"
                    contador={`${r.preguntas.length}`}
                    resumen={`${r.preguntas.length} ${r.preguntas.length === 1 ? "tarea espera" : "tareas esperan"} tu decisión`}
                    abiertaPorDefecto
                >
                    <div data-testid="bloqueadas-alex">
                    <ul className="grid gap-1.5 md:grid-cols-2">
                        {r.preguntas.map((p) => (
                            <li key={p.id} className="rounded-lg border border-amber-400/25 bg-amber-500/[0.06] p-2.5">
                                <p className="text-[11px] font-medium text-amber-50">
                                    {p.id} · {p.titulo ?? ""}
                                </p>
                                <p className="mt-1 text-[11px] leading-relaxed text-white/70">{p.pregunta ?? p.motivo}</p>
                                <p className="mt-2 flex flex-wrap gap-1.5">
                                    {(p.opciones?.length ? p.opciones : ["rehacer", "descartar"])
                                        .filter((o): o is OpcionAlex => o === "rehacer" || o === "descartar")
                                        .map((o) => (
                                            <button
                                                key={o}
                                                type="button"
                                                disabled={enviando !== null}
                                                onClick={() => void decidir(p.id, o)}
                                                data-testid={`decidir-${p.id}-${o}`}
                                                className={`cursor-pointer rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${
                                                    o === "descartar"
                                                        ? "border-rose-400/40 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25"
                                                        : "border-emerald-400/40 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
                                                }`}
                                            >
                                                {enviando === `${p.id}:${o}` ? "Aplicando…" : TEXTO_OPCION[o]}
                                            </button>
                                        ))}
                                </p>
                            </li>
                        ))}
                    </ul>
                    </div>
                </SeccionPlegable>
            ) : null}

            {grupos.length ? (
                <div className="grid gap-2" data-testid="bloqueadas-por-causa">
                    {grupos.map((g) => {
                        const accion = accionDeGrupo(g);
                        return (
                            <div key={g.causa.clave} data-testid={testIdDeGrupo(g)}>
                                <SeccionPlegable
                                    id={`bloqueadas-causa-${g.causa.clave}`}
                                    titulo={g.causa.titulo}
                                    contador={`${g.filas.length}`}
                                    resumen={
                                        accion
                                            ? `${g.filas.length} en esta causa · ${accion}`
                                            : `${g.filas.length} en esta causa`
                                    }
                                    abiertaPorDefecto={g.filas.length === mayor}
                                    acciones={
                                        accion ? (
                                            <span
                                                className="rounded-md border border-cyan-300/25 bg-cyan-400/10 px-1.5 py-0.5 text-[10px] text-cyan-100/80"
                                                data-testid={`bloqueadas-accion-${g.causa.clave}`}
                                            >
                                                {accion}
                                            </span>
                                        ) : undefined
                                    }
                                >
                                    <BloqueadasPanel
                                        items={g.filas.map((f) => itemDesdeFilaMedidor(f, idsConocidos))}
                                        alVer={alVer}
                                        alHecho={alHecho}
                                    />
                                </SeccionPlegable>
                            </div>
                        );
                    })}
                </div>
            ) : null}

            {r && r.transformadas.length ? (
                <SeccionPlegable
                    id="bloqueadas-transformadas"
                    titulo="Transformadas hoy · qué se hizo y por qué"
                    contador={`${r.transformadas.length}`}
                    resumen={`${r.transformadas.length} ${r.transformadas.length === 1 ? "transformada hoy" : "transformadas hoy"}`}
                    abiertaPorDefecto
                >
                    <div data-testid="bloqueadas-transformadas">
                    <ul className="grid gap-1">
                        {r.transformadas.slice(0, 40).map((x, i) => (
                            <li
                                key={`${x.tid ?? ""}-${x.t ?? ""}-${i}`}
                                className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-[11px] leading-relaxed text-white/70"
                            >
                                <span className="mr-1.5 tabular-nums text-white/40">{hora(x.t)}</span>
                                <b className="text-white/85">{sujetoDeTransformada(x)}</b>{" "}
                                <span className="text-emerald-200">{NOMBRE_ACCION[x.accion ?? ""] ?? x.accion}</span>
                                {x.resultado && x.resultado !== "aplicada" ? (
                                    <span className="ml-1 text-amber-200/80">({x.resultado})</span>
                                ) : null}
                                <span className="text-white/50"> · {x.motivo}</span>
                            </li>
                        ))}
                    </ul>
                    </div>
                </SeccionPlegable>
            ) : null}

            {resultado ? (
                <p
                    role="status"
                    className={`text-center text-[11px] ${resultado.ok ? "text-emerald-300" : "text-rose-300"}`}
                    data-testid="bloqueadas-grupos-resultado"
                >
                    {resultado.texto}
                </p>
            ) : null}

        </section>
    );
}

/**
 * (2026-10-20) El medidor «En cadena»: las esperas normales, agrupadas por la tarea a la que
 * esperan. No llevan botones: se desbloquean solas cuando su dependencia llega a main.
 */
export function CadenasBloqueadas({ detalle }: { detalle: DetalleMedidor }) {
    const r = detalle.bloqueadas;
    const titulos = new Map(detalle.filas.map((f) => [f.id, f.titulo]));
    if (!r?.cadenas.length) {
        return <p className="mc-centrado mt-2 text-[11px] leading-relaxed text-white/45">{detalle.vacio}</p>;
    }
    return (
        <div className="mt-2 text-left" data-testid="bloqueadas-cadenas">
            <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-cyan-200/80">
                En cadena · esperan a otra que avanza
            </h4>
            <ul className="grid gap-1.5 md:grid-cols-2">
                {r.cadenas.map((c) => (
                    <li key={c.raiz} className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                        <details>
                            <summary className="cursor-pointer select-none text-[11px] text-white/80">
                                <b className="tabular-nums">{c.n ?? c.esperan.length}</b> esperan a{" "}
                                <b className="text-cyan-100">{c.raiz}</b>
                                {c.titulo_raiz && c.titulo_raiz !== c.raiz ? ` · ${c.titulo_raiz}` : ""}
                                {c.va_por ? <span className="text-white/50">, que va por: {c.va_por}</span> : null}
                            </summary>
                            <ul className="mt-1.5 grid gap-0.5 text-[10px] leading-relaxed text-white/50">
                                {c.esperan.map((id) => (
                                    <li key={id}>
                                        <span className="font-mono text-white/70">{id}</span>
                                        {titulos.get(id) && titulos.get(id) !== id ? ` · ${titulos.get(id)}` : ""}
                                    </li>
                                ))}
                            </ul>
                        </details>
                    </li>
                ))}
            </ul>
        </div>
    );
}
