"use client";

/** TU21 · Aplicación del Traductor (TRA1116-APP-F1): tres pestañas en cristal del OS y el
 *  servicio real de la casa; Astraura queda fuera del modo privado y lo pesado se carga al usarlo. */
import { useEffect, useMemo, useState } from "react";
import { Languages, MessageCircle, WifiOff } from "lucide-react";
import { PanelTexto } from "./panel-texto";
import { SelectorPar, type Par } from "./selector-par";
import { crearServicioTraductor, type ResultadoServicioTraductor } from "@/lib/traductor/servicio";
import { aceptarAviso, type AlmacenAvisos } from "@/lib/traductor/privacidad";
import type { AlmacenHistorial } from "@/lib/traductor/historial";
import { estadoDePar } from "@/lib/traductor/modelos-locales";
import { IndicePaquetes } from "@/lib/traductor/indice-paquetes";
import { cargarPipelineTransformers, motorPaqueteLocal } from "@/lib/traductor/motor-paquete-local";
import { IDIOMAS } from "@/lib/idiomas/idiomas";
import { leer } from "@/lib/traduccion/preferencias";
import { ALCANCES_PRIVADOS, motorAstraura, motorLibreTranslate, motorNavegador, type MotorTraduccion } from "@/lib/traduccion/motor";
import { crearClienteLibreTranslate } from "@/lib/traduccion/libretranslate";
import type { EstadoPar, ParIdiomas } from "@/lib/traductor/tipos";
const BASE_LT = process.env.NEXT_PUBLIC_LIBRETRANSLATE || "http://127.0.0.1:5100";
const URL_TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js";
export interface TraductorAppProps { motores?: MotorTraduccion[]; privado?: boolean; perfilId?: string }
type Servicio = { traducir: (texto: string, par: ParIdiomas) => Promise<ResultadoServicioTraductor> };
function almacenDelAparato(): AlmacenHistorial & AlmacenAvisos {
    const hay = typeof window !== "undefined" && "localStorage" in window;
    const leerCrudo = (c: string) => { try { return hay ? window.localStorage.getItem(c) : null; } catch { return null; } };
    const guardarCrudo = (c: string, v: string | null) => { try { if (hay) { if (v === null) window.localStorage.removeItem(c); else window.localStorage.setItem(c, v); } } catch { /* sin almacén */ } };
    return { obtener: leerCrudo, guardar: (c, v) => guardarCrudo(c, v), borrar: (c) => guardarCrudo(c, null) };
}
function indiceDe(almacen: AlmacenHistorial): IndicePaquetes {
    return new IndicePaquetes({ getItem: (c) => almacen.obtener(c), setItem: (c, v) => almacen.guardar(c, v), removeItem: (c) => almacen.borrar(c) });
}
function motorLocal(almacen: AlmacenHistorial): MotorTraduccion {
    const indice = indiceDe(almacen);
    return motorPaqueteLocal({
        instalado: (origen, destino) => Promise.resolve(indice.estaInstalado(origen, destino)),
        cargarPipeline: (modelo) => cargarPipelineTransformers(URL_TRANSFORMERS, { descargar: async () => undefined, obtener: () => modelo }),
    });
}
async function motoresReales(almacen: AlmacenHistorial, privado: boolean): Promise<MotorTraduccion[]> {
    const { puedeLibreTranslate, traducirConAstraura } = await import("@/components/traduccion/traducir-texto");
    const pagina = typeof window === "undefined" ? {} : { protocolo: window.location.protocol, maquina: window.location.hostname };
    const motores: MotorTraduccion[] = [motorLocal(almacen), motorNavegador({ Translator: (globalThis as { Translator?: unknown }).Translator })];
    if (puedeLibreTranslate(pagina)) motores.push(motorLibreTranslate(crearClienteLibreTranslate({ base: BASE_LT, fetch: (e, i) => fetch(e, i) }), "aparato"));
    motores.push(motorAstraura(traducirConAstraura, "publico"));
    return privado ? motores.filter((m) => ALCANCES_PRIVADOS.includes(m.alcance)) : motores;
}
export function TraductorApp({ motores, privado: privadoForzado, perfilId = "" }: TraductorAppProps) {
    const [almacen] = useState(almacenDelAparato);
    const [pestana, setPestana] = useState<"texto" | "conversacion" | "sin-internet">("texto");
    const [par, setPar] = useState<Par>({ origen: "detectar", destino: "es" });
    const [servicioReal, setServicioReal] = useState<Servicio | null>(null);
    const prefs = leer(perfilId, typeof navigator === "undefined" ? undefined : navigator.language);
    const privado = privadoForzado ?? (prefs.auto.astraura === "nunca");
    const [voz, setVoz] = useState<{ hablar: (texto: string, idioma: string) => { ok: boolean; motivo?: string } } | null>(null);
    useEffect(() => { if (typeof window === "undefined" || !("speechSynthesis" in window)) return; let vivo = true; void import("@/lib/traductor/voz-habla").then(({ hablar }) => { if (vivo) setVoz({ hablar }); }).catch(() => undefined); return () => { vivo = false; }; }, []);
    useEffect(() => { setPar((actual) => ({ ...actual, destino: leer(perfilId, typeof navigator === "undefined" ? undefined : navigator.language).idioma })); }, [perfilId]);
    useEffect(() => {
        if (motores) return;
        setServicioReal(null);
        let vivo = true;
        void motoresReales(almacen, privado).then((lista) => {
            if (vivo) setServicioReal(crearServicioTraductor({ motores: lista, almacenHistorial: almacen, almacenAvisos: almacen, opcionesHistorial: { sinHistorial: privado }, reloj: () => Date.now() }));
        }).catch(() => undefined);
        return () => { vivo = false; };
    }, [almacen, motores, privado]);
    const servicio = useMemo<Servicio | null>(() => {
        if (!motores) return servicioReal;
        const lista = privado ? motores.filter((m) => ALCANCES_PRIVADOS.includes(m.alcance)) : motores;
        return crearServicioTraductor({ motores: lista, almacenHistorial: almacen, almacenAvisos: almacen, opcionesHistorial: { sinHistorial: privado }, reloj: () => Date.now() });
    }, [almacen, motores, privado, servicioReal]);
    const parServicio: ParIdiomas = { origen: par.origen === "detectar" ? "auto" : par.origen, destino: par.destino };
    const alCambiarPar = (nuevo: ParIdiomas) => setPar({ origen: nuevo.origen === "auto" ? "detectar" : nuevo.origen, destino: nuevo.destino });
    const estado = (codigo: string): EstadoPar => estadoDePar(par.origen === "detectar" ? "auto" : par.origen, codigo, []);
    const pestanas = [{ id: "texto" as const, etiqueta: "Texto", Icono: Languages }, { id: "conversacion" as const, etiqueta: "Conversación", Icono: MessageCircle }, { id: "sin-internet" as const, etiqueta: "Sin internet", Icono: WifiOff }];
    return (
        <div className="relative flex h-full min-h-[calc(100dvh-1rem)] w-full flex-col overflow-y-auto rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-black/70 p-4 text-white shadow-2xl backdrop-blur-xl sm:p-6">
            <header className="mb-4 flex flex-col gap-1"><h1 className="text-lg font-semibold">Traductor</h1><p className="text-xs text-white/60">Texto, conversación y paquetes para seguir sin internet.</p></header>
            <div role="tablist" aria-label="Secciones del traductor" className="mb-5 flex gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-white/5 p-1">
                {pestanas.map(({ id, etiqueta, Icono }) => (
                    <button key={id} id={`tab-${id}`} role="tab" type="button" aria-selected={pestana === id} aria-controls={`panel-${id}`} onClick={() => setPestana(id)} className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl px-3 text-sm transition-colors ${pestana === id ? "bg-trinity-azure text-white" : "text-white/70 hover:bg-white/10"}`}>
                        <Icono className="size-4" aria-hidden /> {etiqueta}
                    </button>
                ))}
            </div>
            {pestana === "texto" && (
                <section role="tabpanel" id="panel-texto" aria-labelledby="tab-texto" className="flex flex-col gap-5">
                    <SelectorPar idiomas={IDIOMAS.map((i) => ({ codigo: i.codigo, nombre: i.nombre }))} par={par} onCambiar={setPar} estadoDePar={estado} />
                    {servicio ? <PanelTexto servicio={servicio} voz={voz} par={parServicio} onCambiarPar={alCambiarPar} alAceptarAviso={(motor) => aceptarAviso(motor, almacen)} /> : <p className="text-sm text-white/60">Preparando los traductores de este aparato…</p>}
                </section>
            )}
            {pestana === "conversacion" && <Conversacion servicio={servicio} par={parServicio} />}
            {pestana === "sin-internet" && <SinInternet almacen={almacen} />}
        </div>
    );
}
function Conversacion({ servicio, par }: { servicio: Servicio | null; par: ParIdiomas }) {
    const [texto, setTexto] = useState(""); const [turnos, setTurnos] = useState<string[]>([]);
    const traducirTurno = async () => { if (!servicio || !texto.trim()) return; const r = await servicio.traducir(texto, { origen: par.destino, destino: par.origen === "auto" ? "es" : par.origen }); if ("texto" in r) { setTurnos((t) => [`${texto} → ${r.texto}`, ...t]); setTexto(""); } };
    return (
        <section role="tabpanel" id="panel-conversacion" aria-labelledby="tab-conversacion" className="flex flex-col gap-3">
            <h2 className="text-base font-medium">Conversación</h2>
            <p className="text-sm text-white/60">Un turno cada vez. La voz depende del micrófono y las voces de tu aparato; si no hay voz, se dice.</p>
            <textarea aria-label="Turno de conversación" value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder="Escribe lo que dice la otra persona" className="w-full rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-white outline-none placeholder:text-white/40 focus-visible:ring-2 focus-visible:ring-cyan-300" />
            <button type="button" onClick={() => void traducirTurno()} disabled={!servicio} className="min-h-[44px] cursor-pointer rounded-xl bg-trinity-azure px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Traducir turno</button>
            <ul className="flex flex-col gap-2 text-sm text-white/80">{turnos.map((t, i) => <li key={i} className="rounded-xl border border-white/10 bg-black/20 p-3">{t}</li>)}</ul>
        </section>
    );
}
function SinInternet({ almacen }: { almacen: AlmacenHistorial }) {
    const instalados = indiceDe(almacen).listar();
    return (
        <section role="tabpanel" id="panel-sin-internet" aria-labelledby="tab-sin-internet" className="flex flex-col gap-3">
            <h2 className="text-base font-medium">Sin internet</h2>
            <p className="text-sm text-white/60">Los paquetes de idioma viven en este aparato. Cuando un par está descargado, el traductor lo usa primero y no envía nada.</p>
            {instalados.length === 0 ? <p className="text-sm text-amber-300">No hay paquetes descargados todavía.</p> : <ul className="flex flex-col gap-2 text-sm text-white/80">{instalados.map((p) => <li key={p.id} className="rounded-xl border border-white/10 bg-black/20 p-3">{p.par} · {Math.round(p.bytes / 1_000_000)} MB</li>)}</ul>}
        </section>
    );
}
