"use client";

/**
 * Compilación de la prueba en primer plano (PRB1111V): por plataforma, en qué paso va, cuántos pasos lleva de
 * cuántos, cuánto lleva y cuánto suele tardar (mediana de las últimas pruebas que salieron bien: «aún no se sabe» sin
 * historia). Si falla: el job, el paso, y a petición las últimas líneas de ese paso (sin claves, con las líneas largas
 * partidas). Con la prueba esperando a main, dice a qué espera.
 */

import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { BuildPlataforma, EstadoBuild, VersionPrueba } from "@/lib/mando/lanzamientos-pruebas-tipos";
import { tiempoDePlataforma, versionEnFoco } from "@/lib/mando/pruebas-vivas";

import { PedirArreglo } from "./pruebas-control";
import { Chip, fechaCorta, haceTexto, Seccion, usePruebas } from "./pruebas-contexto";

const URL_COMMIT = "https://github.com/StarSeedSystem/starseed-system/commit/";

const CHIP: Record<EstadoBuild, { texto: string; tono: "ok" | "aviso" | "mal" | "info" | "quieto" }> = {
    "esperando-main": { texto: "Esperando a main", tono: "quieto" },
    "en-cola": { texto: "En cola", tono: "info" },
    compilando: { texto: "Compilando", tono: "aviso" },
    publicando: { texto: "Publicando", tono: "aviso" },
    publicada: { texto: "Publicada", tono: "ok" },
    fallo: { texto: "Falló", tono: "mal" },
    desconocido: { texto: "Desconocido", tono: "quieto" },
};

function RegistroDelFallo({ runId, jobId }: { runId: number; jobId: number }) {
    const [estado, setEstado] = useState<"cerrado" | "cargando" | "listo" | "error">("cerrado");
    const [datos, setDatos] = useState<{ paso: string | null; lineas: string[]; recortado: boolean } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const abrir = async () => {
        setEstado("cargando");
        setError(null);
        try {
            const r = await fetch(`/api/mando/lanzamientos/pruebas/registro?run=${runId}&job=${jobId}`, { cache: "no-store" });
            const cuerpo = (await r.json().catch(() => null)) as { paso?: string | null; lineas?: string[]; recortado?: boolean; error?: string } | null;
            if (!r.ok || !cuerpo || !Array.isArray(cuerpo.lineas)) {
                setError(cuerpo?.error ?? `No se pudo leer el registro (HTTP ${r.status}).`);
                setEstado("error");
                return;
            }
            setDatos({ paso: cuerpo.paso ?? null, lineas: cuerpo.lineas, recortado: cuerpo.recortado === true });
            setEstado("listo");
        } catch {
            setError("No se pudo leer el registro.");
            setEstado("error");
        }
    };
    return (
        <div className="mt-1.5 space-y-1.5 text-xs">
            {estado !== "listo" ? (
                <Button size="sm" variant="outline" disabled={estado === "cargando"} onClick={() => void abrir()} className="h-8 text-xs">
                    {estado === "cargando" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                    {estado === "cargando" ? "Leyendo el registro…" : "Ver las últimas líneas del paso que falló"}
                </Button>
            ) : null}
            {error ? <p className="break-words text-rose-200" role="alert">{error}</p> : null}
            {datos ? (
                <div data-testid="registro-fallo">
                    <p className="text-white/55">
                        {datos.paso ? `Paso «${datos.paso}»` : "Paso que falló"} · últimas {datos.lineas.length} líneas{datos.recortado ? " (hay más antes)" : ""}; sin claves.
                    </p>
                    <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md border border-white/10 bg-black/40 p-2 font-mono text-[11px] leading-snug text-white/80">
                        {datos.lineas.length ? datos.lineas.join("\n") : "El registro de ese paso está vacío."}
                    </pre>
                </div>
            ) : null}
        </div>
    );
}

function FilaPlataforma({ v, p }: { v: VersionPrueba; p: BuildPlataforma }) {
    const c = usePruebas();
    if (!c) return null;
    const chip = CHIP[p.estado];
    const tiempo = tiempoDePlataforma(p, c.datos.tipicos[p.plataforma], c.ahora);
    const pasos = p.pasos ?? null;
    const enMarcha = p.estado === "compilando";
    const porcentaje = pasos && pasos.total ? Math.round((pasos.hechos / pasos.total) * 100) : null;
    return (
        <li className="min-w-0 rounded-md border border-white/10 bg-black/25 p-2 text-xs" data-testid={`plataforma-${p.plataforma}`}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="min-w-[4.5rem] font-medium text-white/90">{p.titulo}</span>
                <Chip tono={chip.tono}>{chip.texto}</Chip>
                {p.estado === "en-cola" ? <span className="text-white/55">{haceTexto(p.desde, c.ahora) ? `desde ${haceTexto(p.desde, c.ahora)}` : "sin hora de entrada en la cola"}</span> : null}
                {p.estado === "publicada" && p.desde && p.hasta ? <span className="font-mono text-white/45">compilada en {Math.max(0, Math.round((Date.parse(p.hasta) - Date.parse(p.desde)) / 60_000))} min</span> : null}
            </div>
            {enMarcha ? (
                <div className="mt-1.5 space-y-1" data-testid={`progreso-${p.plataforma}`}>
                    <p className="break-words text-white/75">
                        Lleva <span className="font-mono">{tiempo.transcurrido}</span> · {tiempo.habitual} · <span className="text-white/90">{tiempo.faltan}</span>
                    </p>
                    {pasos ? (
                        <>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={porcentaje ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label={`Pasos de ${p.titulo}`}>
                                <i className="block h-full rounded-full bg-amber-300/80" style={{ width: `${Math.max(3, porcentaje ?? 0)}%` }} />
                            </div>
                            <p className="break-words text-white/60">
                                Paso {Math.min(pasos.hechos + 1, pasos.total)} de {pasos.total}
                                {pasos.actual ? <> · va en «{pasos.actual}»</> : null} <span className="text-white/40">({pasos.hechos} hechos)</span>
                            </p>
                        </>
                    ) : (
                        <p className="text-white/45">GitHub no da los pasos de este job: no sé en cuál va.</p>
                    )}
                </div>
            ) : null}
            {p.estado === "publicando" ? <p className="mt-1 break-words text-white/65">{p.detalle || "Compilado; falta publicar latest-prueba.json y la limpieza."}</p> : null}
            {p.estado === "fallo" ? (
                <div className="mt-1.5 space-y-1" data-testid={`fallo-${p.plataforma}`}>
                    <p className="break-words text-red-200">
                        Job: <span className="font-mono">{p.job ?? "no consta"}</span> · Paso: <span className="font-mono">{p.pasoFallido ?? "no consta"}</span>
                    </p>
                    {p.detalle ? <p className="break-words text-white/55">{p.detalle}</p> : null}
                    {p.url ? (
                        <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex cursor-pointer items-center gap-1 text-sky-300 hover:underline">
                            <ExternalLink className="h-3 w-3" aria-hidden /> Ver el job en GitHub
                        </a>
                    ) : null}
                    {p.runId && p.jobId ? <RegistroDelFallo runId={p.runId} jobId={p.jobId} /> : <p className="text-white/45">No tengo el id del job: no puedo pedir su registro desde aquí.</p>}
                    {v.numero ? <PedirArreglo prueba={v.numero} plataforma={p.plataforma} /> : null}
                </div>
            ) : null}
        </li>
    );
}

export function BuildsDePrueba() {
    const c = usePruebas();
    if (!c) return null;
    const v = versionEnFoco(c.datos.versiones);
    if (!v) {
        return (
            <Seccion titulo="Compilación" id="builds">
                <p className="break-words text-xs text-white/55" data-testid="sin-pruebas">
                    Genesis no ve ninguna versión de prueba, ni en marcha ni publicada (mirado {haceTexto(new Date(c.datos.ahoraServidor).toISOString(), c.ahora) ?? "ahora"}).
                    {c.director.estado !== "corriendo" ? " Y el director de pruebas no corre, así que nadie está esperando a lanzar una." : ""}
                </p>
            </Seccion>
        );
    }
    const esperando = v.plataformas.some((p) => p.estado === "esperando-main");
    const cola = c.datos.cola;
    return (
        <Seccion titulo="Compilación" id="builds">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h5 className="font-mono text-sm font-semibold text-white">{v.version ?? v.etiqueta}</h5>
                {v.sha ? <a href={`${URL_COMMIT}${v.sha}`} target="_blank" rel="noreferrer" className="cursor-pointer font-mono text-xs text-sky-300 hover:underline">{v.sha.slice(0, 10)}</a> : <span className="text-xs text-white/45">commit desconocido</span>}
                <span className="text-xs text-white/55">{fechaCorta(v.fecha)}</span>
                {v.runUrl ? <a href={v.runUrl} target="_blank" rel="noreferrer" className="cursor-pointer text-xs text-sky-300 hover:underline">run en GitHub</a> : null}
            </div>
            {esperando ? (
                <p className="break-words rounded-md border border-white/10 bg-black/25 p-2 text-xs text-white/75" data-testid="espera-main">
                    Espera a que <span className="font-mono">origin/main</span> contenga {v.sha ? <span className="font-mono">{v.sha.slice(0, 10)}</span> : "el commit de la prueba"}: el lanzador la pidió {haceTexto(v.fecha, c.ahora) ?? "(no consta cuándo)"}.{" "}
                    {cola.sinPublicar === null ? "No pude contar cuántos commits de tu main local siguen sin publicar." : cola.sinPublicar === 0 ? "Tu main local no tiene nada sin publicar." : `Tu main local tiene ${cola.sinPublicar} commit${cola.sinPublicar === 1 ? "" : "s"} sin publicar.`}
                </p>
            ) : null}
            {v.plataformas.length && !esperando ? (
                <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                    {v.plataformas.map((p) => <FilaPlataforma key={p.plataforma} v={v} p={p} />)}
                </ul>
            ) : null}
            {!v.plataformas.length ? <p className="text-xs text-white/50">Sin plataformas leídas todavía.</p> : null}
            {v.desconocido.length ? (
                <ul className="space-y-0.5 text-xs text-white/45">
                    {v.desconocido.map((d) => <li key={d} className="break-words">Sin saber: {d}.</li>)}
                </ul>
            ) : null}
        </Seccion>
    );
}
