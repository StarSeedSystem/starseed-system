"use client";

/**
 * Ronda de aparatos (RON1112C): «Empezar ronda», «Renovar» y «Terminar la ronda» en el panel «Pruebas».
 * Mientras dura una ronda nada pesado EMPIEZA en la Mac (ni tsc, ni vitest, ni las puertas locales de la
 * autopublicación), para que las llamadas de prueba con los aparatos no se midan sobre una Mac ocupada. Lo que ya corría
 * sigue. Caduca sola (30 min por defecto, nunca más de 90) y acabarla es UNA pulsación, sin confirmación.
 *
 * Como el resto del panel, no ejecuta nada: cada pulsación escribe UNA petición para el director de pruebas
 * (`POST …/pruebas/control`) y se enseña el estado de esa petición. Lo que se dice de la Mac sale de la medición del
 * director; si es vieja o no existe, lo dice y no afirma calma.
 */

import { useState } from "react";
import { Loader2, Play, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { leePeticionesDeRonda } from "@/lib/mando/pruebas-vivas";
import { RONDA_MINUTOS_DEF, vistaRonda } from "@/lib/mando/ronda-aparatos";

import { Chip, Seccion, usePruebas } from "./pruebas-contexto";
import { EstadoPeticion } from "./pruebas-control";

const DURACIONES = [15, 30, 60, 90];

export function RondaAparatos() {
    const c = usePruebas();
    const [motivo, setMotivo] = useState("");
    const [minutos, setMinutos] = useState(RONDA_MINUTOS_DEF);
    const [ocupado, setOcupado] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    if (!c) return null;

    const v = vistaRonda(c.datos.ronda ?? null, c.ahora);
    const puede = c.datos.controlAqui && leePeticionesDeRonda(c.director);
    const porQueNo = !c.datos.controlAqui ? "Se pide desde Genesis en la Mac; desde aquí solo se ve." : leePeticionesDeRonda(c.director) ? "" : c.director.texto;
    const propias = c.seguimiento.filter((s) => s.accion === "ronda-iniciar" || s.accion === "ronda-terminar");
    const ultima = propias[propias.length - 1] ?? null;

    const pedir = async (clave: string, cuerpo: Record<string, unknown>, etiqueta: string): Promise<boolean> => {
        setOcupado(clave);
        setError(null);
        const r = await c.pedir(cuerpo, etiqueta);
        setOcupado(null);
        if (!r.ok) setError(r.error ?? "No se pudo pedir.");
        return r.ok;
    };
    const empezar = async () => {
        const m = motivo.trim();
        if (!m) {
            setError("Escribe para qué es la ronda (qué se va a probar).");
            return;
        }
        if (await pedir("iniciar", { accion: "ronda-iniciar", nota: m, minutos }, "Empezar la ronda de aparatos")) setMotivo("");
    };
    const renovar = () => void pedir("renovar", { accion: "ronda-iniciar", nota: v.motivo ?? "ronda de aparatos", minutos }, "Renovar la ronda de aparatos");
    const terminar = () => void pedir("terminar", { accion: "ronda-terminar" }, "Terminar la ronda de aparatos");

    const tonoSilencio = v.silencio?.estado === "tranquila" ? "ok" : v.silencio?.estado === "ocupada" ? "aviso" : "quieto";
    const etiquetaSilencio = v.silencio?.estado === "tranquila" ? "Mac tranquila" : v.silencio?.estado === "ocupada" ? "Mac ocupada" : "sin medir";

    return (
        <Seccion titulo="Ronda de aparatos" id="ronda">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5" data-testid="ronda-estado">
                <Chip tono={v.activa ? "aviso" : "quieto"} data-testid="ronda-chip">{v.activa ? "en vigor" : "sin ronda"}</Chip>
                <span className="min-w-0 break-words text-sm text-white/90" data-testid="ronda-titulo">{v.titulo}</span>
                {v.activa && v.quedaTexto ? <span className="text-xs font-medium text-amber-200" data-testid="ronda-queda">{v.quedaTexto}</span> : null}
            </div>
            <p className="break-words text-xs text-white/70" data-testid="ronda-texto">{v.texto}</p>

            {v.activa && v.silencio ? (
                <div className="flex flex-wrap items-start gap-x-2 gap-y-1 text-xs" data-testid="ronda-silencio">
                    <Chip tono={tonoSilencio}>{etiquetaSilencio}</Chip>
                    <span className="min-w-0 flex-1 break-words text-white/75" style={{ flexBasis: "12rem" }}>{v.silencio.texto}</span>
                </div>
            ) : null}

            {v.activa ? (
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Acciones sobre la ronda">
                    <Button size="sm" variant="outline" disabled={!puede || ocupado !== null} onClick={terminar} className="mc-alzar h-auto min-h-9 whitespace-normal py-1.5 text-left text-xs" data-testid="ronda-terminar">
                        {ocupado === "terminar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Square className="h-3.5 w-3.5" aria-hidden />}
                        Terminar la ronda
                    </Button>
                    <Button size="sm" variant="outline" disabled={!puede || ocupado !== null || v.enSuTope} onClick={renovar} className="mc-alzar h-auto min-h-9 whitespace-normal py-1.5 text-left text-xs" data-testid="ronda-renovar">
                        {ocupado === "renovar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                        Renovar {minutos} min
                    </Button>
                    {v.enSuTope ? <span className="text-[11px] text-white/45">Ya está en su máximo de 90 min desde que empezó: no se alarga más.</span> : null}
                </div>
            ) : (
                <div className="space-y-1.5 rounded-md border border-white/10 bg-black/30 p-2" data-testid="ronda-formulario">
                    <p className="break-words text-xs text-white/65">
                        Al empezarla, nada pesado empieza en la Mac (ni las pruebas de TypeScript, ni las del puente, ni las puertas locales de la publicación) hasta que termine. Lo que ya corre no se mata: se
                        espera a que acabe. Caduca sola.
                    </p>
                    <label className="block text-[11px] text-white/55" htmlFor="ronda-motivo">Para qué es (obligatorio)</label>
                    <input
                        id="ronda-motivo"
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        maxLength={200}
                        placeholder="Ej.: llamadas de prueba con la tableta"
                        className="w-full min-w-0 rounded-md border border-white/15 bg-black/30 px-2 py-1.5 text-sm text-white"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="text-[11px] text-white/55" htmlFor="ronda-minutos">Dura</label>
                        <select id="ronda-minutos" value={minutos} onChange={(e) => setMinutos(Number(e.target.value))} className="rounded-md border border-white/15 bg-black/30 px-2 py-1.5 text-xs text-white">
                            {DURACIONES.map((m) => <option key={m} value={m}>{m} min</option>)}
                        </select>
                        <Button size="sm" disabled={!puede || ocupado !== null} onClick={() => void empezar()} className="mc-alzar h-auto min-h-9 whitespace-normal py-1.5 text-left text-xs" data-testid="ronda-empezar">
                            {ocupado === "iniciar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
                            Empezar la ronda
                        </Button>
                    </div>
                </div>
            )}
            {!puede ? <p className="break-words text-xs text-amber-200/90" data-testid="ronda-sin-director">{porQueNo}{v.activa && c.datos.controlAqui ? " La ronda caduca sola a la hora indicada aunque el director no pase." : ""}</p> : null}
            {error ? <p className="break-words text-xs text-rose-200" role="alert">{error}</p> : null}
            {ultima ? <ul className="space-y-1.5" data-testid="ronda-peticiones"><EstadoPeticion s={ultima} /></ul> : null}
        </Seccion>
    );
}
