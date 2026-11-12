"use client";

/**
 * «Versiones de prueba» dentro del panel «Versiones» (VER1111F · contrato centro-versiones-1105.md §10)
 * ─────────────────────────────────────────────────────────────────────────────
 * La prueba en marcha y las últimas publicadas: versión, commit y cuándo; lo que trae (commits por tarea);
 * el build por plataforma (esperando a main, en cola, compilando con su tiempo y su run, publicada o el job
 * que falló); las comprobaciones en aparatos (Alex las marca con un toque) y «Aprobar», que pide al director
 * lanzar las oficiales desde ese commit. Sondea `GET /api/mando/lanzamientos/pruebas` cada 30 s con la
 * pestaña visible. En el teléfono todo se apila y nada se recorta.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, ChevronDown, CircleDashed, ExternalLink, FlaskConical, Loader2, ShieldCheck, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type {
    BuildPlataforma,
    Comprobacion,
    EstadoBuild,
    EstadoComprobacion,
    GrupoCommits,
    RespuestaPruebas,
    VersionPrueba,
} from "@/lib/mando/lanzamientos-pruebas-tipos";
import { estaEnMarcha, minutos, planDeAprobacion, resumenComprobaciones } from "@/lib/mando/lanzamientos-pruebas";

type Datos = RespuestaPruebas & { aprobarAqui?: boolean };

const URL_COMMIT = "https://github.com/StarSeedSystem/starseed-system/commit/";

const CHIP_BUILD: Record<EstadoBuild, { texto: string; clase: string }> = {
    "esperando-main": { texto: "Esperando a main", clase: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30" },
    "en-cola": { texto: "En cola", clase: "bg-sky-500/20 text-sky-300 border-sky-500/30" },
    compilando: { texto: "Compilando", clase: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
    publicando: { texto: "Publicando", clase: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
    publicada: { texto: "Publicada", clase: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
    fallo: { texto: "Falló", clase: "bg-red-500/20 text-red-300 border-red-500/30" },
    desconocido: { texto: "Desconocido", clase: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30" },
};

const CHIP_COMPROBACION: Record<EstadoComprobacion, string> = {
    pendiente: "text-white/55",
    bien: "text-emerald-300",
    falla: "text-red-300",
};

function corto(sha: string | null): string {
    return sha ? sha.slice(0, 10) : "—";
}

function cuando(iso: string | null): string {
    if (!iso) return "fecha desconocida";
    const t = Date.parse(iso);
    return Number.isFinite(t)
        ? new Date(t).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
        : "fecha desconocida";
}

function FilaBuild({ p, ahora, repetido }: { p: BuildPlataforma; ahora: number; repetido: boolean }) {
    const chip = CHIP_BUILD[p.estado];
    const tiempo = p.estado === "compilando" ? minutos(p.desde, ahora) : p.estado === "publicada" && p.hasta ? `en ${minutos(p.desde, ahora, p.hasta)}` : "";
    return (
        <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" data-testid={`build-${p.plataforma}`}>
            <span className="min-w-[4.5rem] font-medium text-white/85">{p.titulo}</span>
            <Badge variant="outline" className={chip.clase}>{chip.texto}</Badge>
            {tiempo ? <span className="font-mono text-white/50">{tiempo}</span> : null}
            {p.detalle && !repetido ? <span className="basis-full break-words text-white/55 sm:basis-auto">{p.detalle}</span> : null}
            {p.url && (p.estado === "compilando" || p.estado === "fallo" || p.estado === "publicando") ? (
                <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex cursor-pointer items-center gap-1 text-sky-300 hover:underline">
                    <ExternalLink className="h-3 w-3" aria-hidden />
                    {p.estado === "fallo" ? "Ver el job" : "Ver el run"}
                </a>
            ) : null}
        </li>
    );
}

function Grupos({ grupos }: { grupos: GrupoCommits[] }) {
    return (
        <ul className="mt-2 space-y-2">
            {grupos.map((g, i) => (
                <li key={g.tarea ?? `sin-${i}`} className="text-xs">
                    <span className="font-mono font-semibold text-white/80">{g.tarea ?? "Sin id de tarea"}</span>
                    <span className="text-white/40"> · {g.commits.length}</span>
                    <ul className="mt-0.5 space-y-0.5 pl-3">
                        {g.commits.map((c) => (
                            <li key={c.sha} className="break-words text-white/60">
                                <span className="font-mono text-white/35">{c.sha.slice(0, 7)}</span>{" "}
                                {g.tarea ? c.asunto.replace(new RegExp(`^.*?${g.tarea}:\\s*`), "") : c.asunto}
                            </li>
                        ))}
                    </ul>
                </li>
            ))}
        </ul>
    );
}

function FilaComprobacion({
    c,
    ocupado,
    alMarcar,
    extra,
}: {
    c: Comprobacion;
    ocupado: boolean;
    alMarcar: (id: string, estado: EstadoComprobacion, nota?: string) => void;
    /** (PRB1111V) Lo que el panel «Pruebas» pone bajo la comprobación: la sugerencia del banco y «Pedir arreglo». */
    extra?: ReactNode;
}) {
    const [nota, setNota] = useState<string | null>(null);
    const Icono = c.estado === "bien" ? CheckCircle2 : c.estado === "falla" ? XCircle : CircleDashed;
    return (
        <li className="rounded-md border border-white/10 bg-black/20 p-2 text-xs" data-testid={`comprobacion-${c.id}`}>
            <div className="flex items-start gap-2">
                <Icono className={`mt-0.5 h-4 w-4 shrink-0 ${CHIP_COMPROBACION[c.estado]}`} aria-hidden />
                <div className="min-w-0 flex-1">
                    <p className="break-words text-white/85">
                        {c.aparato ? <span className="font-semibold text-white/60">{c.aparato} · </span> : null}
                        {c.texto}
                    </p>
                    <p className={`mt-0.5 ${CHIP_COMPROBACION[c.estado]}`}>
                        {c.estado === "pendiente" ? "Pendiente" : c.estado === "bien" ? "Bien" : "Falla"}
                        {c.quien && c.estado !== "pendiente" ? <span className="text-white/40"> · marcó {c.quien}{c.t ? ` (${cuando(c.t)})` : ""}</span> : null}
                    </p>
                    {c.nota ? <p className="mt-0.5 break-words text-white/60">Nota: {c.nota}</p> : null}
                </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`Resultado de ${c.id}`}>
                {(["bien", "falla", "pendiente"] as EstadoComprobacion[]).map((e) => (
                    <Button
                        key={e}
                        size="sm"
                        variant={c.estado === e ? "default" : "outline"}
                        aria-pressed={c.estado === e}
                        disabled={ocupado}
                        onClick={() => alMarcar(c.id, e)}
                        className="h-8 min-w-[4.5rem] text-xs"
                    >
                        {e === "bien" ? "Bien" : e === "falla" ? "Falla" : "Pendiente"}
                    </Button>
                ))}
                <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={ocupado} onClick={() => setNota(nota === null ? c.nota : null)}>
                    Nota
                </Button>
            </div>
            {nota !== null ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    <input
                        value={nota}
                        onChange={(ev) => setNota(ev.target.value)}
                        maxLength={400}
                        aria-label={`Nota de ${c.id}`}
                        className="min-w-0 flex-1 basis-48 rounded-md border border-white/15 bg-black/30 px-2 py-1 text-xs text-white"
                    />
                    <Button
                        size="sm"
                        className="h-8 text-xs"
                        disabled={ocupado}
                        onClick={() => {
                            alMarcar(c.id, c.estado, nota);
                            setNota(null);
                        }}
                    >
                        Guardar nota
                    </Button>
                </div>
            ) : null}
            {extra}
        </li>
    );
}

function Confirmacion({
    v,
    web,
    ocupado,
    alAprobar,
    alCancelar,
}: {
    v: VersionPrueba;
    web: string | null;
    ocupado: boolean;
    alAprobar: (lanzarSha: string) => void;
    alCancelar: () => void;
}) {
    const plan = planDeAprobacion(v, web);
    const movido = plan.mainMovido;
    return (
        <div role="dialog" aria-label={`Aprobar ${plan.version}`} className="mt-3 space-y-3 rounded-lg border border-amber-400/30 bg-amber-500/[0.06] p-3 text-xs text-white/80">
            <p className="text-sm font-semibold text-white">
                Aprobar {plan.version} y lanzar la versión oficial {plan.oficial}
            </p>
            <p className="break-words">
                Commit probado: <span className="font-mono">{plan.sha.slice(0, 12)}</span>
            </p>
            <div>
                <p className="font-semibold text-white/90">Qué se lanza</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {plan.lanzar.map((l) => (
                        <li key={l} className="break-words">{l}</li>
                    ))}
                </ul>
            </div>
            {plan.fallas.length || plan.pendientes.length ? (
                <div>
                    <p className="font-semibold text-white/90">Comprobaciones que no están bien (no bloquean: decides tú)</p>
                    <ul className="mt-1 space-y-0.5 pl-1">
                        {plan.fallas.map((c) => (
                            <li key={c.id} className="break-words text-red-300">Falla · {c.aparato ? `${c.aparato} · ` : ""}{c.texto}{c.nota ? ` (${c.nota})` : ""}</li>
                        ))}
                        {plan.pendientes.map((c) => (
                            <li key={c.id} className="break-words text-white/60">Pendiente · {c.aparato ? `${c.aparato} · ` : ""}{c.texto}</li>
                        ))}
                    </ul>
                </div>
            ) : (
                <p className="text-emerald-300">{v.comprobaciones.length ? "Todas las comprobaciones están bien." : "Esta prueba no tiene comprobaciones registradas."}</p>
            )}
            {movido ? (
                <div className="space-y-1 rounded-md border border-red-400/30 bg-red-500/[0.06] p-2">
                    <p className="font-semibold text-red-200">
                        Main avanzó {movido.total} commit{movido.total === 1 ? "" : "s"} desde lo probado (hoy {movido.cabeza.slice(0, 10)}).
                    </p>
                    <p className="break-words">
                        El director sube la versión encima de la cabeza de main: hoy no sabe lanzar exactamente {plan.sha.slice(0, 10)}. Si apruebas, se lanza
                        main tal como está: lo probado más esto, sin probar. Si main se mueve otra vez antes del commit de versión, el director se para y lo dice.
                    </p>
                    <Grupos grupos={movido.grupos} />
                </div>
            ) : (
                <p className="break-words text-white/60">
                    Main sigue en el commit probado. El director sube la versión encima de él; si main se mueve antes, se para y lo dice.
                </p>
            )}
            <p className="break-words text-white/55">
                Lo lleva el director de lanzamientos en su próxima pasada, por sus pasos de siempre (publicación verificada, commit de versión,
                etiqueta, compilación y verificación). La pausa general sigue: esto lanza solo esta versión.
            </p>
            <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={ocupado} onClick={() => alAprobar(plan.lanzarSha)} className="mc-alzar h-auto min-h-8 whitespace-normal py-1.5 text-left">
                    {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ShieldCheck className="h-3.5 w-3.5" aria-hidden />}
                    {movido ? `Aprobar y lanzar main (${movido.total} sin probar)` : `Aprobar y lanzar la ${plan.oficial}`}
                </Button>
                <Button size="sm" variant="outline" disabled={ocupado} onClick={alCancelar}>
                    Cancelar
                </Button>
            </div>
        </div>
    );
}

function TarjetaPrueba({
    v,
    datos,
    ahora,
    ocupado,
    alMarcar,
    alAprobar,
    ocultarBuild,
    extraComprobacion,
}: {
    v: VersionPrueba;
    datos: Datos;
    ahora: number;
    ocupado: boolean;
    ocultarBuild?: boolean;
    extraComprobacion?: (c: Comprobacion, v: VersionPrueba) => ReactNode;
    alMarcar: (numero: number, id: string, estado: EstadoComprobacion, nota?: string) => void;
    alAprobar: (v: VersionPrueba, lanzarSha: string) => Promise<boolean>;
}) {
    const [confirmar, setConfirmar] = useState(false);
    const r = resumenComprobaciones(v.comprobaciones);
    const plan = planDeAprobacion(v, datos.web);
    const enMarcha = estaEnMarcha(v);
    return (
        <article className="min-w-0 rounded-lg border border-white/10 bg-black/20 p-3" data-testid={`prueba-${v.numero}`}>
            <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h5 className="font-mono text-sm font-semibold text-white">{v.version ?? v.etiqueta}</h5>
                {enMarcha ? <Badge variant="outline" className="border-amber-500/30 bg-amber-500/20 text-amber-300">En marcha</Badge> : null}
                {v.vigente.escritorio || v.vigente.android ? (
                    <Badge variant="outline" className="border-sky-500/30 bg-sky-500/15 text-sky-200">
                        La sirve el canal{v.vigente.escritorio && v.vigente.android ? "" : v.vigente.android ? " (Android)" : " (escritorio)"}
                    </Badge>
                ) : null}
                {v.aprobacion ? <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/20 text-emerald-300">Aprobada</Badge> : null}
            </header>
            <p className="mt-1 break-words text-xs text-white/55">
                {v.sha ? (
                    <a href={`${URL_COMMIT}${v.sha}`} target="_blank" rel="noreferrer" className="cursor-pointer font-mono text-sky-300 hover:underline">
                        {corto(v.sha)}
                    </a>
                ) : (
                    <span>commit desconocido</span>
                )}
                {" · "}
                {cuando(v.fecha)}
                {v.runUrl ? (
                    <>
                        {" · "}
                        <a href={v.runUrl} target="_blank" rel="noreferrer" className="cursor-pointer text-sky-300 hover:underline">run en GitHub</a>
                    </>
                ) : null}
            </p>

            {v.plataformas.length && !ocultarBuild ? (
                <ul className="mt-2 space-y-1.5">
                    {v.plataformas.map((p, i) => (
                        <FilaBuild key={p.plataforma} p={p} ahora={ahora} repetido={i > 0 && v.plataformas[i - 1].detalle === p.detalle} />
                    ))}
                </ul>
            ) : null}

            {v.contenido ? (
                <details className="mt-2 text-xs">
                    <summary className="cursor-pointer break-words text-white/70">
                        <ChevronDown className="mr-1 inline h-3 w-3" aria-hidden />
                        Qué trae · {v.contenido.total} commit{v.contenido.total === 1 ? "" : "s"} en {v.contenido.grupos.filter((g) => g.tarea).length} tarea
                        {v.contenido.grupos.filter((g) => g.tarea).length === 1 ? "" : "s"}
                        {v.contenido.desde ? ` desde ${v.contenido.desde.slice(0, 7)}` : " (sin prueba anterior conocida: los 30 últimos)"}
                    </summary>
                    <Grupos grupos={v.contenido.grupos} />
                </details>
            ) : null}

            <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
                    Comprobaciones en aparatos · {r.total ? `${r.bien + r.falla} de ${r.total} hechas` : "ninguna registrada"}
                </p>
                {r.total ? (
                    <ul className="mt-1.5 space-y-1.5">
                        {v.comprobaciones.map((c) => (
                            <FilaComprobacion key={c.id} c={c} ocupado={ocupado} alMarcar={(id, e, nota) => alMarcar(v.numero, id, e, nota)} extra={extraComprobacion?.(c, v)} />
                        ))}
                    </ul>
                ) : (
                    <p className="mt-1 break-words text-xs text-white/45">
                        Los directores las registran con <span className="font-mono">comprobaciones_prueba.py registrar {v.numero} …</span>
                    </p>
                )}
            </div>

            {v.desconocido.length ? (
                <ul className="mt-2 space-y-0.5 text-xs text-white/45">
                    {v.desconocido.map((d) => (
                        <li key={d} className="break-words">Sin saber: {d}.</li>
                    ))}
                </ul>
            ) : null}

            {v.director ? (
                <p className="mt-2 break-words text-xs text-white/65">
                    Director: {v.director.estado}{v.director.detalle ? ` · ${v.director.detalle}` : ""}
                </p>
            ) : null}
            {v.aprobacion ? (
                <p className="mt-2 break-words text-xs text-emerald-300/90">
                    Aprobada el {cuando(v.aprobacion.t)} con {v.aprobacion.comprobaciones.bien} bien, {v.aprobacion.comprobaciones.falla} falla y{" "}
                    {v.aprobacion.comprobaciones.pendiente} pendiente{v.aprobacion.lanzar_sha !== v.aprobacion.sha ? ` · se lanza main en ${v.aprobacion.lanzar_sha.slice(0, 10)}` : ""}.
                </p>
            ) : null}

            {plan.puede && datos.aprobarAqui && !confirmar ? (
                <div className="mt-3">
                    <Button size="sm" disabled={ocupado} onClick={() => setConfirmar(true)} className="mc-alzar">
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                        Aprobar
                    </Button>
                </div>
            ) : null}
            {plan.puede && !datos.aprobarAqui ? (
                <p className="mt-2 text-xs text-white/50">Publicada en todas sus plataformas: se aprueba desde Genesis en la Mac.</p>
            ) : null}
            {confirmar ? (
                <Confirmacion
                    v={v}
                    web={datos.web}
                    ocupado={ocupado}
                    alCancelar={() => setConfirmar(false)}
                    alAprobar={(sha) => void alAprobar(v, sha).then((ok) => ok && setConfirmar(false))}
                />
            ) : null}
        </article>
    );
}

export function VersionesPrueba({
    datos: datosExternos,
    alRecargar,
    ocultarBuild,
    extraComprobacion,
    ahoraExterno,
}: {
    /** (PRB1111V) Si el panel «Pruebas» ya tiene los datos, los pasa y esta sección no sondea por su cuenta. */
    datos?: Datos | null;
    alRecargar?: () => Promise<void> | void;
    ocultarBuild?: boolean;
    extraComprobacion?: (c: Comprobacion, v: VersionPrueba) => ReactNode;
    ahoraExterno?: number;
} = {}) {
    const externo = datosExternos !== undefined;
    const [datosPropios, setDatos] = useState<Datos | null>(null);
    const datos = (externo ? datosExternos : datosPropios) ?? null;
    const [error, setError] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const [ahoraPropio, setAhora] = useState(() => Date.now());
    const ahora = ahoraExterno ?? ahoraPropio;
    const vivo = useRef(true);

    useEffect(() => () => void (vivo.current = false), []);

    const cargar = useCallback(async () => {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
        try {
            const r = await fetch("/api/mando/lanzamientos/pruebas", { cache: "no-store" });
            if (!vivo.current) return;
            const cuerpo = (await r.json().catch(() => null)) as Datos | { error?: string } | null;
            if (!r.ok || !cuerpo || !Array.isArray((cuerpo as Datos).versiones)) {
                setError((cuerpo as { error?: string } | null)?.error ?? "No pude leer las versiones de prueba.");
                return;
            }
            setError(null);
            setDatos(cuerpo as Datos);
            setAhora(Date.now());
        } catch {
            if (vivo.current) setError("No pude leer las versiones de prueba.");
        }
    }, []);

    useEffect(() => {
        if (externo) return;
        void cargar();
        const id = window.setInterval(() => void cargar(), 30_000);
        const reloj = window.setInterval(() => setAhora(Date.now()), 60_000);
        return () => {
            window.clearInterval(id);
            window.clearInterval(reloj);
        };
    }, [cargar, externo]);

    const enviar = useCallback(
        async (cuerpo: Record<string, unknown>): Promise<boolean> => {
            setOcupado(true);
            setAviso(null);
            try {
                const r = await fetch("/api/mando/lanzamientos/pruebas", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(cuerpo),
                });
                const salida = (await r.json().catch(() => ({}))) as { error?: string; repetida?: boolean };
                if (!r.ok) {
                    setAviso(salida.error ?? `No se pudo (HTTP ${r.status}).`);
                    return false;
                }
                if (salida.repetida) setAviso("Esa aprobación ya estaba registrada: no se pidió nada nuevo.");
                else if (cuerpo.accion === "aprobar") setAviso("Aprobada. El director la toma en su próxima pasada (cada 5 min).");
                if (externo) await alRecargar?.();
                else await cargar();
                return true;
            } catch {
                setAviso("No se pudo completar.");
                return false;
            } finally {
                setOcupado(false);
            }
        },
        [cargar, externo, alRecargar],
    );

    const versiones = datos?.versiones ?? [];
    return (
        <section aria-label="Versiones de prueba" data-testid="versiones-prueba" className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/50">
                    <FlaskConical className="h-3.5 w-3.5" aria-hidden />
                    Versiones de prueba
                </h4>
                {datos ? <span className="break-words text-xs text-white/70" data-testid="resumen-pruebas">{datos.resumen}</span> : null}
            </div>
            {error ? <p className="text-xs text-rose-200" role="alert">{error}</p> : null}
            {aviso ? <p className="break-words text-xs text-amber-200" role="status">{aviso}</p> : null}
            {!datos && !error ? <p className="text-xs text-white/50">Leyendo las versiones de prueba…</p> : null}
            {datos && versiones.length === 0 ? (
                <p className="break-words text-xs text-white/50">
                    Ninguna versión de prueba en marcha ni publicada que Genesis vea (mirado el {cuando(datos.generadoEn)}).
                </p>
            ) : null}
            {datos?.avisos.length ? (
                <ul className="space-y-0.5 text-xs text-amber-200/80">
                    {datos.avisos.map((a) => (
                        <li key={a} className="break-words">{a}</li>
                    ))}
                </ul>
            ) : null}
            {datos && versiones.length ? (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {versiones.map((v) => (
                        <TarjetaPrueba
                            key={v.numero}
                            v={v}
                            datos={datos}
                            ahora={ahora}
                            ocupado={ocupado}
                            ocultarBuild={ocultarBuild}
                            extraComprobacion={extraComprobacion}
                            alMarcar={(numero, id, estado, nota) => void enviar({ accion: "marcar", numero, id, estado, ...(nota !== undefined ? { nota } : {}) })}
                            alAprobar={(ver, lanzarSha) => enviar({ accion: "aprobar", numero: ver.numero, sha: ver.sha, lanzar_sha: lanzarSha })}
                        />
                    ))}
                </div>
            ) : null}
        </section>
    );
}
