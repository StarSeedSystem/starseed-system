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
import { NOMBRE_ACCION, sujetoDeTransformada, type OpcionAlex, type ResumenBloqueadas, type TransformadaRevisor } from "@/lib/mando/bloqueadas";
import { BloqueadasPanel, itemDesdeFilaMedidor } from "./bloqueadas-panel";
import { SeccionPlegable } from "./seccion-plegable";

const TEXTO_OPCION: Record<OpcionAlex, string> = {
    rehacer: "Rehacer con otro enfoque",
    descartar: "Descartar (rama guardada)",
};

export interface CausaBloqueada {
    clave: string;
    titulo: string;
    filas: FilaMedidor[];
    /** La acción automática que ya la está tratando, si la hay. */
    accion?: string;
}

function hora(t?: string): string {
    const m = /(\d{2}:\d{2})/.exec(String(t ?? ""));
    return m ? m[1] : "";
}

/** La causa de una fila, agrupable aunque cambien ids o cifras. La clave sirve de id. */
export function causaDeFila(f: Pick<FilaMedidor, "estado" | "porque">): { clave: string; titulo: string } {
    const estado = String(f.estado ?? "").trim();
    const bruto = String(f.porque ?? "").replace(/\s+/g, " ").trim();
    const sinCausa = estado.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "sin-estado";
    if (!bruto) return { clave: `sin-causa-${sinCausa}`, titulo: estado ? `${estado}: sin causa anotada` : "Causa sin anotar" };
    const reglas: Array<[RegExp, string, string]> = [
        [/^la rehace\b/i, "reparacion-en-marcha", "Ya con una reparación automática en marcha"],
        [/^la escalera del director\b/i, "escalera-director", "La escalera del director la está reintentando"],
        [/no existen?|NO EXISTE/i, "dependencia-fantasma", "Espera a tareas que no existen"],
        [/no se van? a integrar/i, "dependencia-muerta", "Espera a tareas que no se van a integrar solas"],
        [/necesita una persona/i, "necesita-persona", "Necesita una persona"],
        [/no toc[oó]|sin cambios|no cambi[oó]/i, "sin-cambios", "El intento no tocó sus archivos"],
    ];
    for (const [patron, clave, titulo] of reglas) if (patron.test(bruto)) return { clave, titulo };
    const titulo = bruto.split(/(?:\s·|\s—|:\s)/)[0]?.trim() || bruto;
    return { clave: titulo.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "causa", titulo };
}

/** La reparación que ya trata una fila: sucesora, escalera o acción del revisor. */
export function accionAutomaticaDeFila(
    f: Pick<FilaMedidor, "id" | "porque" | "ficha">,
    transformadas: readonly TransformadaRevisor[] = [],
): string | null {
    const porque = String(f.porque ?? "").trim();
    const rehace = /^la rehace\s+([^\s(]+)(?:\s*\(([^)]+)\))?/i.exec(porque);
    if (rehace) return `La rehace ${rehace[1]}${rehace[2] ? ` (${rehace[2]})` : ""}`;
    const escalera = /^la escalera del director\b[^·—]*/i.exec(porque);
    if (escalera) return escalera[0].trim();
    const accion = transformadas.find((x) => x.tid === f.id && x.accion)?.accion;
    if (accion) return `El revisor automático: ${NOMBRE_ACCION[accion] ?? accion}`;
    return f.ficha?.find((d) => /repar|automátic|revisor|sucesor/i.test(d.etiqueta))?.valor?.trim() || null;
}

/** Agrupa las filas por causa, de la que más tareas tiene a la que menos. */
export function agruparPorCausa(
    filas: readonly FilaMedidor[],
    transformadas: readonly TransformadaRevisor[] = [],
): CausaBloqueada[] {
    const mapa = new Map<string, CausaBloqueada>();
    for (const fila of filas) {
        const { clave, titulo } = causaDeFila(fila);
        const grupo = mapa.get(clave);
        if (grupo) grupo.filas.push(fila);
        else mapa.set(clave, { clave, titulo, filas: [fila] });
    }
    const grupos = [...mapa.values()];
    for (const grupo of grupos) {
        const acciones = [...new Set(grupo.filas.map((f) => accionAutomaticaDeFila(f, transformadas)).filter((a): a is string => Boolean(a)))];
        grupo.accion = acciones.length ? `${acciones.slice(0, 2).join(" · ")}${acciones.length > 2 ? ` · y ${acciones.length - 2} más` : ""}` : undefined;
    }
    return grupos.sort((a, b) => b.filas.length - a.filas.length || a.titulo.localeCompare(b.titulo));
}

function Cifra({ valor, texto, tono }: { valor: number; texto: string; tono: string }) {
    return (
        <span className={`rounded-md border px-2 py-1 text-[11px] ${tono}`}>
            <b className="mr-1 text-[13px] tabular-nums">{valor}</b>
            {texto}
        </span>
    );
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
    const atascadas: FilaMedidor[] = operativas.filter((f) => (f.grupo ?? "atascada") === "atascada");
    const sinResolver: FilaMedidor[] = operativas.filter((f) => f.grupo === "sin-resolver");
    const idsConocidos = detalle.filas.map((x) => x.id);
    const transformadas = r?.transformadas ?? [];
    const maximo = Math.max(0, ...agruparPorCausa([...atascadas, ...sinResolver], transformadas).map((c) => c.filas.length));
    const pintarCausas = (grupo: "atascadas" | "sin-resolver", causas: FilaMedidor[]) => (
        <div className="mt-1 grid gap-2" data-testid={`bloqueadas-causas-${grupo}`}>
            {agruparPorCausa(causas, transformadas).map((causa) => (
                <div key={causa.clave} data-testid={`bloqueadas-causa-${grupo}-${causa.clave}`}>
                    <SeccionPlegable
                        id={`bloqueadas-${grupo}-${causa.clave}`}
                        titulo={causa.titulo}
                        contador={`${causa.filas.length} ${causa.filas.length === 1 ? "tarea" : "tareas"}`}
                        abiertaPorDefecto={causa.filas.length === maximo}
                        acciones={causa.accion ? <span data-testid={`bloqueadas-accion-${grupo}-${causa.clave}`} className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] text-cyan-100">{causa.accion}</span> : null}
                    >
                        <BloqueadasPanel items={causa.filas.map((f) => itemDesdeFilaMedidor(f, idsConocidos))} alVer={alVer} alHecho={alHecho} />
                    </SeccionPlegable>
                </div>
            ))}
        </div>
    );

    return (
        <section className="mt-2 grid gap-3 text-left" data-testid="bloqueadas-grupos">
            <SeccionPlegable
                id="bloqueadas-lista"
                titulo="Bloqueadas y rechazadas"
                contador={`${r?.valor ?? operativas.length}`}
                resumen={r?.pastilla ?? "La lista está cerrada"}
            >
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
                <div data-testid="bloqueadas-alex">
                    <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-200/80">
                        Necesitan a Alex · una decisión
                    </h4>
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
            ) : null}

            {atascadas.length ? (
                <div data-testid="bloqueadas-atascadas">
                    <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-rose-200/80">
                        Atascadas · aún sin transformar
                    </h4>
                    {pintarCausas("atascadas", atascadas)}
                </div>
            ) : null}

            {sinResolver.length ? (
                <div data-testid="bloqueadas-sin-resolver">
                    <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-orange-200/80">
                        Fallidas o rechazadas sin resolver · últimos 3 días
                    </h4>
                    {pintarCausas("sin-resolver", sinResolver)}
                </div>
            ) : null}

            {r && r.transformadas.length ? (
                <div data-testid="bloqueadas-transformadas">
                    <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-200/80">
                        Transformadas hoy · qué se hizo y por qué
                    </h4>
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
                                <span className="text-white/50"> — {x.motivo}</span>
                            </li>
                        ))}
                    </ul>
                </div>
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

            {!r && operativas.length ? (
                <BloqueadasPanel items={operativas.map((f) => itemDesdeFilaMedidor(f, idsConocidos))} alVer={alVer} alHecho={alHecho} />
            ) : null}
            </SeccionPlegable>
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
