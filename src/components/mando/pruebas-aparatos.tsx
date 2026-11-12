"use client";

/**
 * Aparatos y evidencia (PRB1111V): cada aparato con su versión frente a la prueba que se mira («falta actualizar»),
 * si la app está abierta, su último arranque y sus errores; las últimas llamadas con sus números (una cifra que el
 * registro no trae dice «no lo trae», nunca 0); y, bajo cada comprobación, la sugerencia del banco con su razón y las
 * líneas crudas a petición. La sugerencia nunca marca: marcar sigue siendo un toque de Alex.
 */

import { Button } from "@/components/ui/button";
import { useState } from "react";

import type { Comprobacion, VersionPrueba } from "@/lib/mando/lanzamientos-pruebas-tipos";
import { edadDelBanco, estadoDeAparato, versionEnFoco } from "@/lib/mando/pruebas-vivas";
import type { BancoLeido, LadoLlamada, LlamadaBanco } from "@/lib/mando/pruebas-vivas-tipos";

import { PedirArreglo } from "./pruebas-control";
import { Chip, cifra, duracionDeLlamada, fechaCorta, haceTexto, Seccion, usePruebas } from "./pruebas-contexto";

const ESTADO_CHIP = {
    "al-dia": { tono: "ok", texto: "al día" },
    "mas-nueva": { tono: "info", texto: "más nueva que la prueba" },
    "falta-actualizar": { tono: "aviso", texto: "falta actualizar" },
    desconocida: { tono: "quieto", texto: "versión desconocida" },
} as const;

function LineasCrudas({ lineas, etiqueta }: { lineas: string[]; etiqueta: string }) {
    if (!lineas.length) return <p className="text-[11px] text-white/40">Sin líneas crudas de {etiqueta}.</p>;
    return (
        <details className="text-[11px]">
            <summary className="cursor-pointer text-white/60">Líneas crudas de {etiqueta}</summary>
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md border border-white/10 bg-black/40 p-2 font-mono leading-snug text-white/75">{lineas.join("\n")}</pre>
        </details>
    );
}

function Lado({ l }: { l: LadoLlamada }) {
    const partes: string[] = [];
    if (l.tieneVoz) partes.push(`voz: nivel ${cifra(l.vozNivel[0])}–${cifra(l.vozNivel[1])}, pérdida máx. ${cifra(l.vozPerdidaPctMax, " %")}, tarde máx. ${cifra(l.vozTardePctMax, " %")}, espera máx. ${cifra(l.esperaVozMsMax, " ms")}, mudo ${cifra(l.mudoS, " s")}`);
    else partes.push("sin voz");
    if (l.tieneVideo) {
        const f = l.fpsActivo;
        partes.push(`vídeo: ${f ? `${cifra(f.min)}/${cifra(f.med)}/${cifra(f.max)} fps` : "fps: no lo trae"}, recibidos ${cifra(l.fpsRecibidosMed, " fps")}, enviados ${cifra(l.enviados)}, descartados ${cifra(l.descartados)}, negros ${cifra(l.negros)}, pintados ${cifra(l.pintados)}${l.pausas.length ? `, ${l.pausas.length} pausa${l.pausas.length === 1 ? "" : "s"} (${l.pausas.map((p) => `${p.motivo}${p.durS !== null ? ` ${p.durS} s` : ""}`).join(", ")})` : ""}`);
    } else partes.push("sin vídeo");
    if (l.camara) partes.push(`cámara: ${l.camara.ok === null ? "no consta" : l.camara.ok ? `abrió${l.camara.abierta ? ` (${l.camara.abierta})` : ""}` : `no abrió${l.camara.error ? ` (${l.camara.error})` : ""}`}, ${cifra(l.camara.intentos)} intento${l.camara.intentos === 1 ? "" : "s"}`);
    return (
        <li className="min-w-0 text-[11px] text-white/65" data-testid={`lado-${l.aparato}`}>
            <span className="font-medium text-white/85">{l.aparato}</span> · <span className="break-words">{partes.join(" · ")}</span>
            <LineasCrudas lineas={l.lineas} etiqueta={l.aparato} />
        </li>
    );
}

function Llamada({ ll, ahora }: { ll: LlamadaBanco; ahora: number }) {
    return (
        <li className="min-w-0 rounded-md border border-white/10 bg-black/25 p-2 text-xs" data-testid={`llamada-${ll.id}`}>
            <p className="break-words text-white/85">
                <span className="font-mono">{ll.id.replace("llamada-", "")}</span> · {fechaCorta(ll.desde)} ({haceTexto(ll.desde, ahora) ?? "?"}) · {duracionDeLlamada(ll.duracionS)}
                {ll.con ? ` · con ${ll.con}` : " · el otro aparato no escribió líneas"}
                {ll.terminada === false ? " · no se vio colgar" : ""}
            </p>
            <p className="break-words text-white/50">
                {ll.medios.length ? `medios: ${ll.medios.join(", ")}` : "medios: no consta"} · canal rápido: {ll.kbps ? `${cifra(ll.kbps.min)}–${cifra(ll.kbps.max)} kbps (${cifra(ll.kbps.muestras)} muestras)` : "no se midió"}
            </p>
            {ll.lados.length ? <ul className="mt-1 space-y-1.5">{ll.lados.map((l) => <Lado key={l.aparato} l={l} />)}</ul> : <p className="mt-1 text-[11px] text-white/40">Ningún aparato escribió líneas de esta llamada.</p>}
        </li>
    );
}

/** PRB1111X: «Abrir la app» en esta Mac. Escribe la petición `app-abrir`; el director solo ABRE la app instalada. */
function AbrirApp() {
    const c = usePruebas();
    const [confirmando, setConfirmando] = useState(false);
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState<string | null>(null);
    if (!c) return null;
    const pendiente = c.datos.peticiones.some((p) => p.accion === "app-abrir" && (p.estado === "pendiente" || p.estado === "escrita"));
    const sin = !c.puedePedir ? c.motivo : pendiente ? "Ya hay una petición «abrir la app» sin atender." : "";
    const enviar = async () => {
        setOcupado(true);
        setError(null);
        const r = await c.pedir({ accion: "app-abrir" }, "Abrir la app en esta Mac");
        setOcupado(false);
        if (r.ok) setConfirmando(false);
        else setError(r.error ?? "No se pudo pedir.");
    };
    return (
        <div className="mt-1.5 space-y-1" data-testid="abrir-app">
            {!confirmando ? (
                <Button size="sm" variant="outline" disabled={!!sin} onClick={() => setConfirmando(true)} className="h-8 text-xs">
                    Abrir la app
                </Button>
            ) : (
                <div role="dialog" aria-label="Abrir la app" className="space-y-1.5 rounded-md border border-amber-400/30 bg-amber-500/[0.06] p-2">
                    <p className="break-words text-white/75">Pide al director que abra la app de StarSeed ya instalada en esta Mac. Solo la abre: no la cierra ni la actualiza.</p>
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" disabled={ocupado} onClick={() => void enviar()} className="h-8 text-xs">
                            {ocupado ? "Escribiendo la petición…" : "Sí, abrir la app"}
                        </Button>
                        <Button size="sm" variant="outline" disabled={ocupado} onClick={() => setConfirmando(false)} className="h-8 text-xs">No, volver</Button>
                    </div>
                </div>
            )}
            {sin ? <p className="break-words text-[11px] text-white/45">{sin}</p> : null}
            {error ? <p className="break-words text-rose-200" role="alert">{error}</p> : null}
        </div>
    );
}

export function AparatosYEvidencia() {
    const c = usePruebas();
    const [todas, setTodas] = useState(false);
    if (!c) return null;
    const { banco } = c.datos;
    const v = versionEnFoco(c.datos.versiones);
    const objetivo = v?.version ?? null;
    if (banco === null || banco === "ilegible") {
        return (
            <Seccion titulo="Aparatos y evidencia" id="aparatos">
                <p className="break-words text-xs text-amber-200/90" data-testid="sin-banco">
                    {banco === "ilegible"
                        ? "No pude leer el archivo de evidencia de los aparatos (existe pero no tiene la forma esperada). No sé qué versión tiene cada aparato ni cómo salieron las llamadas."
                        : "No hay archivo de evidencia de los aparatos (el banco de pruebas aún no ha escrito el suyo). No sé qué versión tiene cada aparato ni cómo salieron las llamadas; las comprobaciones se marcan a mano."}
                </p>
            </Seccion>
        );
    }
    const b: BancoLeido = banco;
    const edad = edadDelBanco(b, c.ahora);
    const llamadas = todas ? b.llamadas : b.llamadas.slice(0, 3);
    return (
        <Seccion titulo={`Aparatos y evidencia${objetivo ? ` · frente a ${objetivo}` : ""}`} id="aparatos">
            <p className={`break-words text-xs ${edad.viejo ? "text-amber-200" : "text-white/55"}`} data-testid="edad-banco">
                {edad.haceS === null ? "El banco de pruebas no dice cuándo se actualizó." : edad.viejo ? `El archivo de evidencia no se actualiza desde ${haceTexto(b.t, c.ahora)}: puede estar desfasado.` : `Evidencia actualizada ${haceTexto(b.t, c.ahora)}.`}
                {b.lineasLeidas !== null ? ` Leyó ${b.lineasLeidas} líneas de registro.` : ""}
            </p>
            {b.aparatos.length === 0 ? <p className="text-xs text-white/50">El banco no lista ningún aparato.</p> : null}
            <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {b.aparatos.map((a) => {
                    const e = ESTADO_CHIP[estadoDeAparato(a, objetivo)];
                    return (
                        <li key={a.id} className="min-w-0 rounded-lg border border-white/10 bg-black/25 p-2 text-xs" data-testid={`aparato-${a.id}`}>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="font-semibold text-white/90">{a.nombre}</span>
                                {a.esta ? <Chip tono="info">esta Mac</Chip> : null}
                                <Chip tono={e.tono}>{e.texto}</Chip>
                            </div>
                            <p className="mt-1 break-words text-white/70">
                                Versión: <span className="font-mono">{a.version ?? "no la registra nadie"}</span>
                                {a.versionDe ? <span className="text-white/45"> ({a.versionDe})</span> : null}
                                {objetivo && a.version && a.version !== objetivo ? <span className="text-white/45"> · la prueba es {objetivo}</span> : null}
                            </p>
                            <p className="break-words text-white/70">
                                App: {a.appAbierta === null ? "no se pudo saber si está abierta" : a.appAbierta ? "abierta" : "cerrada"} · último arranque: {a.ultimoArranque ? `${fechaCorta(a.ultimoArranque)} (${haceTexto(a.ultimoArranque, c.ahora)})` : "no consta"} · visto {haceTexto(a.visto, c.ahora) ?? "nunca"}
                            </p>
                            {a.esta && a.appAbierta !== true ? <AbrirApp /> : null}
                            {a.errores.length ? (
                                <details className="mt-1">
                                    <summary className="cursor-pointer text-red-300">{a.errores.length} error{a.errores.length === 1 ? "" : "es"} al arrancar</summary>
                                    <ul className="mt-1 space-y-0.5">
                                        {a.errores.map((er, i) => <li key={i} className="break-words font-mono text-[11px] text-white/70">{er.t ? `${fechaCorta(er.t)} · ` : ""}{er.texto}</li>)}
                                    </ul>
                                </details>
                            ) : <p className="text-white/45">Sin errores de arranque anotados.</p>}
                        </li>
                    );
                })}
            </ul>
            <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Últimas llamadas</p>
                {b.llamadas.length === 0 ? <p className="mt-1 text-xs text-white/50">El registro no tiene llamadas.</p> : (
                    <ul className="mt-1 space-y-1.5" data-testid="llamadas">
                        {llamadas.map((ll) => <Llamada key={ll.id} ll={ll} ahora={c.ahora} />)}
                    </ul>
                )}
                {b.llamadas.length > 3 ? (
                    <button type="button" className="mt-1.5 cursor-pointer text-xs text-sky-300 hover:underline" onClick={() => setTodas(!todas)}>
                        {todas ? "Ver solo las 3 últimas" : `Ver las ${b.llamadas.length} llamadas`}
                    </button>
                ) : null}
            </div>
            {b.sugerenciasNota ? <p className="break-words text-xs text-white/55" data-testid="nota-sugerencias">{b.sugerenciasNota}</p> : null}
        </Seccion>
    );
}

/** Bajo cada comprobación: la sugerencia del banco (con razón y líneas a petición) y «Pedir arreglo» si falla. */
export function ExtraDeComprobacion({ c: comp, v }: { c: Comprobacion; v: VersionPrueba }) {
    const ctx = usePruebas();
    const [lineas, setLineas] = useState(false);
    if (!ctx) return null;
    const banco = ctx.datos.banco && ctx.datos.banco !== "ilegible" ? ctx.datos.banco : null;
    const s = banco?.sugerencias.find((x) => x.prueba === v.numero && x.comprobacion === comp.id) ?? null;
    const ll = s?.llamada ? banco?.llamadas.find((l) => l.id === s.llamada) ?? null : null;
    const fallaEnBuild = comp.estado === "falla";
    return (
        <div className="mt-2 space-y-1.5" data-testid={`extra-${comp.id}`}>
            {s ? (
                <div className="rounded-md border border-white/10 bg-white/[0.03] p-2 text-xs" data-testid={`sugerencia-${comp.id}`}>
                    <p className="break-words">
                        <Chip tono={s.veredicto === "bien" ? "ok" : "mal"}>El banco sugiere: {s.veredicto === "bien" ? "bien" : "falla"}</Chip>{" "}
                        <span className="text-white/75">{s.motivo || "sin razón anotada"}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-white/40">Señal {s.senal || "?"}{s.llamada ? ` · llamada ${s.llamada.replace("llamada-", "")}` : ""} · solo sugiere: marcar es tuyo.</p>
                    {ll ? (
                        <>
                            <button type="button" className="mt-1 cursor-pointer text-[11px] text-sky-300 hover:underline" onClick={() => setLineas(!lineas)} aria-expanded={lineas}>
                                {lineas ? "Ocultar las líneas crudas" : "Ver las líneas crudas"}
                            </button>
                            {lineas ? <div className="mt-1 space-y-1">{ll.lados.map((l) => <LineasCrudas key={l.aparato} lineas={l.lineas} etiqueta={l.aparato} />)}</div> : null}
                        </>
                    ) : null}
                </div>
            ) : comp.senal ? (
                <p className="break-words text-[11px] text-white/40">Señal automática {comp.senal}: el banco aún no tiene con qué sugerir.</p>
            ) : null}
            {fallaEnBuild ? <PedirArreglo prueba={v.numero} comprobacion={comp.id} antes={comp.arreglo ?? null} /> : comp.arreglo ? (
                <p className="break-words text-[11px] text-amber-200/80">Arreglo pedido el {fechaCorta(comp.arreglo.t)} por {comp.arreglo.quien || "?"}.</p>
            ) : null}
        </div>
    );
}
