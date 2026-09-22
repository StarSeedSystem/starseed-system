"use client";

/**
 * «Commitear y publicar»: el botón que faltaba.
 *
 * Hasta ahora esta pestaña solo preparaba un manifiesto y te mandaba a la
 * terminal a escribir `git push` a mano. Eso no es publicar: es tomar nota.
 *
 * Aquí se hace de verdad, y en este orden, que no se negocia: commit → tipos →
 * pruebas del OS → pruebas del puente → build → push → verificación cambio por
 * cambio. Si una puerta se pone en rojo, el proceso para ahí y dice cuál: nunca
 * se empuja para arreglarlo después, porque eso deja main roto para todos.
 *
 * El proceso corre suelto (tarda entre cinco y quince minutos) y va dejando su
 * diario en disco; esto solo lo sondea. Puedes cerrar el navegador: al volver
 * sigue ahí, con lo que llevaba hecho.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleDashed, CircleSlash, Loader2, Rocket, TriangleAlert, XCircle } from "lucide-react";

import type { CambioVerificado, DiarioPublicacion, EstadoPaso } from "@/lib/mando/publicador-tipos";

const ICONO: Record<EstadoPaso, { Icono: typeof CheckCircle2; clase: string }> = {
    pendiente: { Icono: CircleDashed, clase: "text-white/25" },
    corriendo: { Icono: CircleDashed, clase: "text-cyan-300 animate-spin" },
    ok: { Icono: CheckCircle2, clase: "text-emerald-300" },
    falla: { Icono: XCircle, clase: "text-rose-300" },
    omitido: { Icono: CircleSlash, clase: "text-white/30" },
};

function Duracion({ segundos }: { segundos: number }) {
    if (!segundos) return null;
    const texto = segundos >= 60 ? `${Math.round(segundos / 60)} min` : `${Math.round(segundos)} s`;
    return <span className="shrink-0 text-[10px] tabular-nums text-white/40">{texto}</span>;
}

function FilaCambio({ cambio }: { cambio: CambioVerificado }) {
    const { Icono, clase } = cambio.aplicado
        ? ICONO.ok
        : cambio.integrado
          ? { Icono: TriangleAlert, clase: "text-amber-300" }
          : ICONO.falla;
    return (
        <li className="rounded-lg border border-white/10 bg-black/30 p-2.5">
            <p className="flex items-start gap-2">
                <Icono className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${clase}`} aria-hidden />
                <span className="min-w-0">
                    <span className="font-mono text-[11px] text-white/45">{cambio.sha}</span>{" "}
                    <span className="text-xs text-white/85">{cambio.titulo}</span>
                </span>
            </p>
            <p className="mt-1 pl-5 text-[11px] text-white/55">{cambio.porque}</p>
            {cambio.archivos.length > 0 ? (
                <ul className="mt-1 space-y-0.5 pl-5">
                    {cambio.archivos.map((a) => (
                        <li key={a.ruta} className="flex gap-1.5 text-[10px]">
                            <span className={a.ok ? "text-emerald-300/70" : "text-rose-300"}>{a.ok ? "·" : "✗"}</span>
                            <span className="font-mono text-white/45">{a.ruta}</span>
                            <span className="text-white/35">— {a.porque}</span>
                        </li>
                    ))}
                </ul>
            ) : null}
        </li>
    );
}

export function PublicarAhora({ diario, alCambiar }: { diario: DiarioPublicacion | null; alCambiar: () => void }) {
    const [nota, setNota] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [lanzando, setLanzando] = useState(false);
    /**
     * Id del diario que había ANTES de pulsar. Mientras el diario en disco siga siendo ese,
     * la publicación recién lanzada todavía no ha escrito su primera línea.
     *
     * (2026-09-22) Sin esto, pulsabas «Publicar» y la pantalla seguía enseñando la
     * publicación anterior en verde —«hecho»— durante los veinte o treinta segundos que
     * tarda la nueva en arrancar sus puertas. Parecía que el botón no hacía nada.
     */
    const [esperandoDiario, setEsperandoDiario] = useState<string | null>(null);
    const sondeo = useRef<number | null>(null);

    const corriendo = diario?.estado === "corriendo";
    const arrancando = esperandoDiario !== null && (diario?.id ?? null) === esperandoDiario;

    // Mientras publica se mira cada 3 s; parado, no se sondea: una pestaña
    // abierta toda la noche no tiene por qué pedir nada cada tres segundos.
    useEffect(() => {
        if (!corriendo && !arrancando) {
            if (sondeo.current) window.clearInterval(sondeo.current);
            sondeo.current = null;
            return;
        }
        sondeo.current = window.setInterval(alCambiar, 3_000);
        return () => {
            if (sondeo.current) window.clearInterval(sondeo.current);
            sondeo.current = null;
        };
    }, [corriendo, arrancando, alCambiar]);

    const publicar = useCallback(async () => {
        setLanzando(true);
        setError(null);
        setEsperandoDiario(diario?.id ?? "");
        try {
            const r = await fetch("/api/mando/publicacion", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accion: "publicar", nota }),
            });
            const cuerpo = (await r.json().catch(() => ({}))) as { error?: string };
            if (!r.ok) {
                setEsperandoDiario(null);
                setError(cuerpo.error ?? `No se pudo lanzar la publicación (HTTP ${r.status}).`);
                return;
            }
            setNota("");
            alCambiar();
            // El proceso tarda un instante en escribir su primera línea del
            // diario. Sin este segundo vistazo, pulsabas el botón y la pantalla
            // se quedaba igual hasta el siguiente sondeo de 30 s: parecía que no
            // había pasado nada y daban ganas de volver a pulsar.
            window.setTimeout(alCambiar, 1_200);
        } catch {
            setEsperandoDiario(null);
            setError("No se pudo lanzar la publicación.");
        } finally {
            setLanzando(false);
        }
    }, [nota, alCambiar, diario?.id]);

    // En cuanto el diario cambia de id, la publicación nueva ya está escribiendo.
    useEffect(() => {
        if (esperandoDiario !== null && (diario?.id ?? null) !== esperandoDiario) setEsperandoDiario(null);
    }, [diario?.id, esperandoDiario]);

    const tono =
        diario?.estado === "fallo"
            ? "border-rose-400/30 bg-rose-500/10"
            : diario?.estado === "con_avisos"
              ? "border-amber-400/30 bg-amber-500/10"
              : diario?.estado === "hecho"
                ? "border-emerald-400/30 bg-emerald-500/10"
                : "border-white/10 bg-black/30";

    return (
        <section data-testid="publicar-ahora" className={`rounded-xl border p-4 ${tono}`}>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                <Rocket className="h-4 w-4" aria-hidden />
                Commitear y publicar
            </h3>
            <p className="mt-1 text-[11px] text-white/55">
                Commitea lo que haya suelto, pasa las cuatro puertas y solo entonces empuja a{" "}
                <code className="text-white/70">origin/main</code>. Al terminar, verifica cambio por cambio si quedó
                integrado y aplicado.
            </p>

            <label className="mt-3 block">
                <span className="text-[11px] text-white/50">Qué estás publicando</span>
                <textarea
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    disabled={corriendo}
                    rows={2}
                    placeholder="En una línea: qué cambia y por qué…"
                    className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white/90 placeholder:text-white/30 focus:border-cyan-400/60 focus:outline-none disabled:opacity-50"
                />
            </label>

            <div className="mt-2 flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={() => void publicar()}
                    disabled={corriendo || lanzando || nota.trim().length < 8}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <Rocket className="h-4 w-4" aria-hidden />
                    {corriendo ? "Publicando…" : lanzando ? "Lanzando…" : "Commitear y publicar"}
                </button>
                {nota.trim().length < 8 && !corriendo ? (
                    <span className="text-[11px] text-white/40">
                        Escribe una línea primero: un commit sin asunto no se entiende dentro de un mes.
                    </span>
                ) : null}
            </div>

            {error ? <p className="mt-2 text-xs text-rose-200">{error}</p> : null}

            {arrancando ? (
                <p
                    data-testid="publicacion-arrancando"
                    className="mt-2 flex items-center gap-2 text-xs text-cyan-100"
                >
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    Publicación lanzada · abriendo las puertas. Lo de abajo es todavía la anterior.
                </p>
            ) : null}

            {diario ? (
                <div className="mt-4">
                    <p className="text-xs font-medium text-white/80">{diario.resumen || "En marcha…"}</p>
                    <ol className="mt-2 space-y-1">
                        {diario.pasos.map((p) => {
                            const { Icono, clase } = ICONO[p.estado] ?? ICONO.pendiente;
                            return (
                                <li key={p.clave} className="flex items-start gap-2 text-xs">
                                    <Icono className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${clase}`} aria-hidden />
                                    <span className="min-w-0 flex-1">
                                        <span className={p.estado === "omitido" ? "text-white/40" : "text-white/80"}>
                                            {p.titulo}
                                        </span>
                                        {p.detalle ? (
                                            <span className="block truncate text-[10px] text-white/45">{p.detalle}</span>
                                        ) : null}
                                    </span>
                                    <Duracion segundos={p.segundos} />
                                </li>
                            );
                        })}
                    </ol>

                    {diario.verificacion.length > 0 ? (
                        <>
                            <p className="mt-3 text-[11px] uppercase tracking-wide text-white/45">
                                Verificación de cada cambio
                            </p>
                            <ul className="mt-1 space-y-1.5">
                                {diario.verificacion.map((c) => (
                                    <FilaCambio key={c.sha} cambio={c} />
                                ))}
                            </ul>
                        </>
                    ) : null}
                </div>
            ) : null}
        </section>
    );
}
