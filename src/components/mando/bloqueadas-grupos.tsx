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
 */

import { useCallback, useState } from "react";

import type { DetalleMedidor, FilaMedidor } from "@/lib/mando/medidores";
import { NOMBRE_ACCION, sujetoDeTransformada, type OpcionAlex, type ResumenBloqueadas } from "@/lib/mando/bloqueadas";
import { BloqueadasPanel, itemDesdeFilaMedidor } from "./bloqueadas-panel";

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

export function BloqueadasGrupos({ detalle, alHecho }: { detalle: DetalleMedidor; alHecho?: () => void }) {
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

    const operativas = detalle.filas.filter((f) => !f.historica);
    const atascadas: FilaMedidor[] = operativas.filter((f) => (f.grupo ?? "atascada") === "atascada");
    const idsConocidos = detalle.filas.map((x) => x.id);

    return (
        <section className="mt-2 grid gap-3 text-left" data-testid="bloqueadas-grupos">
            {r ? (
                <p className="flex flex-wrap items-center justify-center gap-1.5" data-testid="bloqueadas-cifras">
                    <Cifra valor={r.atascadas} texto="atascadas" tono="border-rose-400/30 bg-rose-500/10 text-rose-100" />
                    <Cifra valor={r.alex} texto="te necesitan" tono="border-amber-400/30 bg-amber-500/10 text-amber-100" />
                    <Cifra valor={r.enCadena} texto="en cadena" tono="border-cyan-300/30 bg-cyan-500/10 text-cyan-100" />
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
                    <BloqueadasPanel
                        items={atascadas.map((f) => itemDesdeFilaMedidor(f, idsConocidos))}
                        alHecho={alHecho}
                    />
                </div>
            ) : null}

            {r && r.cadenas.length ? (
                <div data-testid="bloqueadas-cadenas">
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
                                    <p className="mt-1.5 text-[10px] leading-relaxed text-white/45">{c.esperan.join(" · ")}</p>
                                </details>
                            </li>
                        ))}
                    </ul>
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
                <BloqueadasPanel items={operativas.map((f) => itemDesdeFilaMedidor(f, idsConocidos))} alHecho={alHecho} />
            ) : null}
        </section>
    );
}
