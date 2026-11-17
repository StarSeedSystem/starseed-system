"use client";

/**
 * Pantalla de texto del Traductor (página /traductor, TRA1116-APP F1): aquí se
 * usa el PanelTexto (TU17) con las piezas ya existentes — el servicio (TU12),
 * la voz (TU14), el selector de par (TU16) y el almacén de avisos (TU10/TU20).
 * Nada nuevo: solo el cableado que faltaba para que el panel se use de verdad.
 */
import { useEffect, useMemo, useState } from "react";
import { PanelTexto } from "@/components/traductor/panel-texto";
import { SelectorPar, type Par } from "@/components/traductor/selector-par";
import { crearServicioTraductor } from "@/lib/traductor/servicio";
import { aceptarAviso, type AlmacenAvisos } from "@/lib/traductor/privacidad";
import type { AlmacenHistorial } from "@/lib/traductor/historial";
import { hablar } from "@/lib/traductor/voz-habla";
import { estadoDePar } from "@/lib/traductor/modelos-locales";
import type { EstadoPar, ParIdiomas } from "@/lib/traductor/tipos";
import { IDIOMAS } from "@/lib/idiomas/idiomas";
import { leer } from "@/lib/traduccion/preferencias";
import { crearMotores, type PaginaActual } from "@/components/traduccion/traducir-texto";

/** Almacén del aparato para el historial y los avisos; si no hay, no guarda. */
function almacenLocal(): AlmacenHistorial {
    const disponible = typeof window !== "undefined" && "localStorage" in window;
    return {
        obtener: (clave) => {
            try { return disponible ? window.localStorage.getItem(clave) : null; } catch { return null; }
        },
        guardar: (clave, valor) => {
            try { if (disponible) window.localStorage.setItem(clave, valor); } catch { /* silencioso */ }
        },
        borrar: (clave) => {
            try { if (disponible) window.localStorage.removeItem(clave); } catch { /* silencioso */ }
        },
    };
}

/** Cómo es esta página, para que `crearMotores` elija los motores que la encuentran. */
function paginaActual(): PaginaActual {
    if (typeof window === "undefined") return {};
    return {
        protocolo: window.location.protocol,
        maquina: window.location.hostname,
        translator: (window as { Translator?: unknown }).Translator,
    };
}

export function PantallaTraductor() {
    const [par, setPar] = useState<Par>({ origen: "detectar", destino: "es" });

    useEffect(() => {
        setPar((actual) => ({
            ...actual,
            destino: leer("", typeof navigator === "undefined" ? undefined : navigator.language).idioma,
        }));
    }, []);

    const { servicio, avisos } = useMemo(() => {
        const almacenAvisos: AlmacenAvisos = almacenLocal();
        return {
            avisos: almacenAvisos,
            servicio: crearServicioTraductor({
                motores: crearMotores(paginaActual()),
                almacenHistorial: almacenLocal(),
                almacenAvisos,
                opcionesHistorial: { sinHistorial: false },
                reloj: () => Date.now(),
            }),
        };
    }, []);

    const voz = useMemo(
        () => (typeof window !== "undefined" && "speechSynthesis" in window ? { hablar } : null),
        [],
    );

    /** El selector dice «detectar» y el servicio dice «auto»: mismo sentido. */
    const alCambiarPar = (nuevo: ParIdiomas) =>
        setPar({ origen: nuevo.origen === "auto" ? "detectar" : nuevo.origen, destino: nuevo.destino });

    const parServicio: ParIdiomas = {
        origen: par.origen === "detectar" ? "auto" : par.origen,
        destino: par.destino,
    };

    const estado = (codigo: string): EstadoPar =>
        estadoDePar(par.origen === "detectar" ? "auto" : par.origen, codigo, []);

    return (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
            <h1 className="text-xl font-semibold text-white">Traductor</h1>
            <SelectorPar
                idiomas={IDIOMAS.map((i) => ({ codigo: i.codigo, nombre: i.nombre }))}
                par={par}
                onCambiar={setPar}
                estadoDePar={estado}
            />
            <PanelTexto
                servicio={servicio}
                voz={voz}
                par={parServicio}
                onCambiarPar={alCambiarPar}
                alAceptarAviso={(motor) => aceptarAviso(motor, avisos)}
            />
        </div>
    );
}
