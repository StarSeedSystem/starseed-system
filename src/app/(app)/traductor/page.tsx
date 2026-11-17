"use client";

import { useEffect, useRef, useState } from "react";
import { PanelConversacion } from "@/components/traductor/panel-conversacion";
import { SelectorPar, type Par } from "@/components/traductor/selector-par";
import { traducirConAstraura } from "@/components/traduccion/traducir-texto";
import { IDIOMAS } from "@/lib/idiomas/idiomas";
import {
    estadoInicial, procesarEvento, type DependenciasConversacion, type EfectoConversacion,
    type EstadoConversacion, type EventoConversacion, type Hablante, type TurnoCompleto,
} from "@/lib/traductor/conversacion";
import { crearEscucha, type EscuchaVoz, type IdiomaReconocimiento } from "@/lib/traductor/voz-escucha";
import { cuandoTermine, detener as detenerVoz, hablar, vocesDe } from "@/lib/traductor/voz-habla";
import type { ParIdiomas, ResultadoTraductor } from "@/lib/traductor/tipos";

export default function PaginaTraductor() {
    const [par, setPar] = useState<Par>({ origen: "es", destino: "en" });
    const [estado, setEstado] = useState<EstadoConversacion>(estadoInicial);
    const [turnos, setTurnos] = useState<TurnoCompleto[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [reconocimiento, setReconocimiento] = useState(false);
    const [audioSaleDelAparato, setAudioSaleDelAparato] = useState(false);
    const estadoRef = useRef(estado), saltar = useRef(false);
    const escuchaRef = useRef<EscuchaVoz | null>(null);
    estadoRef.current = estado;
    const escucha = escuchaRef.current ?? (escuchaRef.current = crearEscucha({}));
    const idiomaA = par.origen === "detectar" ? "es" : par.origen, idiomaB = par.destino;
    const idiomaARef = useRef(idiomaA), idiomaBRef = useRef(idiomaB);
    idiomaARef.current = idiomaA;
    idiomaBRef.current = idiomaB;

    useEffect(() => {
        const d = escucha.disponible();
        setReconocimiento(d.ok); setAudioSaleDelAparato(d.audioSaleDelAparato);
        return () => { escucha.detener(); detenerVoz(); };
    }, [escucha]);

    async function traducir(texto: string, parIdiomas: ParIdiomas): Promise<ResultadoTraductor> {
        const [textoTraducido] = await traducirConAstraura([texto], parIdiomas.origen, parIdiomas.destino);
        if (!textoTraducido) throw new Error("La traducción no llegó.");
        return { texto: textoTraducido, origenDetectado: parIdiomas.origen, motor: "astraura", local: false, ms: 0 };
    }

    function ejecutar(efecto: EfectoConversacion): void {
        if (efecto.tipo === "iniciarReconocimiento") {
            if (saltar.current) { saltar.current = false; return; }
            escucha.iniciar(efecto.idioma as IdiomaReconocimiento, {
                alResultado: (r) => procesar({ tipo: r.provisional ? "resultadoParcial" : "resultadoFinal", texto: r.texto }),
                alError: (_e, mensaje) => procesar({ tipo: "error", motivo: mensaje, contexto: "reconocimiento" }),
            });
        } else if (efecto.tipo === "detenerReconocimiento") escucha.detener();
        else if (efecto.tipo === "traducir") {
            void traducir(efecto.texto, efecto.par).then((resultado) => {
                const efectos = procesar({ tipo: "traduccionLista", resultado });
                if (estadoRef.current.fase === "hablando" && !efectos.some((e) => e.tipo === "hablar")) setTimeout(() => procesar({ tipo: "finDeVoz" }), 0);
            }).catch((e) => procesar({ tipo: "error", motivo: e instanceof Error ? e.message : String(e), contexto: "traduccion" }));
        } else if (efecto.tipo === "hablar") {
            const voz = hablar(efecto.texto, efecto.idioma);
            if (!voz.ok) { setError(voz.motivo ?? "No hay voz de salida; el turno queda como texto."); procesar({ tipo: "finDeVoz" }); }
            else cuandoTermine((ok) => { if (ok) procesar({ tipo: "finDeVoz" }); });
        } else if (efecto.tipo === "detenerVoz") detenerVoz();
        else if (efecto.tipo === "emitirTurno") setTurnos((previos) => [...previos, efecto.turno]);
        else setError(efecto.mensaje);
    }

    function procesar(evento: EventoConversacion): EfectoConversacion[] {
        const deps: DependenciasConversacion = {
            reloj: () => (typeof performance === "undefined" ? Date.now() : performance.now()),
            reconocimiento: { disponible: () => (saltar.current ? { ok: true } : escucha.disponible()), iniciar: (idioma, callbacks) => escucha.iniciar(idioma as IdiomaReconocimiento, callbacks), detener: () => escucha.detener() },
            traducir,
            voz: { disponible: () => ({ ok: true }), hablar: (texto, idioma) => hablar(texto, idioma), detener: detenerVoz, cuandoTermine },
            parIdiomas: (quien) => (quien === "A"
                ? { origen: idiomaARef.current, destino: idiomaBRef.current }
                : { origen: idiomaBRef.current, destino: idiomaARef.current }),
            alTurnoCompleto: () => {},
            alCambioEstado: (nuevo) => { estadoRef.current = nuevo; },
        };
        const resultado = procesarEvento(estadoRef.current, evento, deps);
        estadoRef.current = resultado.estado;
        setEstado(resultado.estado);
        resultado.efectos.forEach(ejecutar);
        return resultado.efectos;
    }

    const pulsar = (quien: Hablante) => {
        saltar.current = false;
        setError(null);
        procesar({ tipo: "pulsarHablar", quien });
    };

    const escribir = (quien: Hablante) => {
        if (estadoRef.current.fase !== "inactivo") {
            if (estadoRef.current.fase !== "escuchando") return;
            procesar({ tipo: "error", motivo: "Escritura manual", contexto: "reconocimiento" });
        }
        const texto = window.prompt(`Escribe el turno de la persona ${quien}`);
        if (!texto?.trim()) return;
        saltar.current = true;
        setError(null);
        procesar({ tipo: "pulsarHablar", quien });
        procesar({ tipo: "resultadoFinal", texto: texto.trim() });
    };

    return (
        <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 text-white">
            <header className="flex flex-col gap-3">
                <h1 className="text-2xl font-semibold">Traductor en conversación</h1>
                <SelectorPar idiomas={IDIOMAS} par={par} onCambiar={setPar} estadoDePar={() => "solo-internet"} />
                {error ? <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm text-red-100">{error}</p> : null}
            </header>
            <PanelConversacion estado={estado} turnos={turnos} idiomaA={idiomaA} idiomaB={idiomaB}
                reconocimientoA={reconocimiento} reconocimientoB={reconocimiento}
                vozA={vocesDe(idiomaA).length > 0} vozB={vocesDe(idiomaB).length > 0}
                audioSaleDelAparato={audioSaleDelAparato} onPulsarHablar={pulsar} onEscribir={escribir} />
        </main>
    );
}
