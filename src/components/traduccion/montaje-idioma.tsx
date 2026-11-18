"use client";
/** Montaje de idioma (TRA1116): registra las entradas de IMA17 y la nueva
 *  «Reemplazar por la traducción» (visible con ctx.editable y selección).
 *  Usa el mismo traductor y motores que traducir-texto.tsx, captura la
 *  selección ANTES de abrir el menú con capturarSeleccionEditable (IMA19)
 *  y reemplaza al terminar; si falla dice por qué y no toca el texto;
 *  muestra un aviso con «Deshacer». Respeta el modo privado. */
import { useEffect, useRef, useState } from "react";
import { useAccount } from "@/context/account-context";
import { crearTraductor, motorAstraura, motorLibreTranslate, motorNavegador, type MotorTraduccion } from "@/lib/traduccion/motor";
import { crearClienteLibreTranslate } from "@/lib/traduccion/libretranslate";
import { leer } from "@/lib/traduccion/preferencias";
import { registrarEntradaMenuTexto, type ContextoMenuTexto, type EntradaMenuTexto } from "@/components/traduccion/menu-texto";
import { reemplazar, deshacerUltimo, type ObjetivoEditable, capturarSeleccionEditable } from "@/components/traduccion/reemplazar-seleccion";
import { entradasIdioma } from "@/components/traduccion/entradas-idioma";
import { puedeLibreTranslate, nombreMotor, traducirConAstraura } from "./traducir-texto";

const BASE_LT = process.env.NEXT_PUBLIC_LIBRETRANSLATE || "http://127.0.0.1:5100";

/** Idioma de destino del perfil (o del navegador si no hay perfil). */
export function idiomaDestino(perfilId: string, idiomaNavegador?: string): string {
    return leer(perfilId, idiomaNavegador).idioma;
}

/** Motores de traducción de esta página (navegador › LibreTranslate si se alcanza › Astraura). */
export function motoresPagina(): MotorTraduccion[] {
    const lista: MotorTraduccion[] = [];
    if ((window as { Translator?: unknown }).Translator) lista.push(motorNavegador({ Translator: (window as { Translator?: unknown }).Translator }));
    if (puedeLibreTranslate({ protocolo: location.protocol, maquina: location.hostname })) lista.push(motorLibreTranslate(crearClienteLibreTranslate({ base: BASE_LT, fetch: (e, i) => fetch(e, i) }), "aparato"));
    lista.push(motorAstraura(traducirConAstraura, "publico"));
    return lista;
}

/** Traduce y reemplaza la selección editable; devuelve el mensaje para el aviso o lanza. */
export async function traducirYReemplazar(objetivo: ObjetivoEditable, perfilId: string, idiomaNavegador?: string): Promise<string> {
    const destino = idiomaDestino(perfilId, idiomaNavegador);
    const [r] = await crearTraductor(motoresPagina(), { privado: true }).traducir([objetivo.texto], "auto", destino);
    if (!r) throw new Error("La traducción no llegó.");
    if (!reemplazar(objetivo, r.texto)) throw new Error("La selección cambió y no se reemplazó.");
    return `Reemplazado con ${nombreMotor(r.motor)}.`;
}

interface Aviso { mensaje: string; deshacer: boolean }

export function MontajeIdioma() {
    const { user } = useAccount();
    const [aviso, setAviso] = useState<Aviso | null>(null);
    const objetivoRef = useRef<ObjetivoEditable | null>(null);

    const perfilId = user?.id ?? "";
    const idiomaNav = typeof navigator === "undefined" ? undefined : navigator.language;

    const avisoConDeshacer = (mensaje: string) => {
        setAviso({ mensaje, deshacer: true });
        window.setTimeout(() => setAviso((a) => (a?.mensaje === mensaje ? null : a)), 5000);
    };

    const ejecutarReemplazo = async (objetivo: ObjetivoEditable) => {
        try {
            const msg = await traducirYReemplazar(objetivo, perfilId, idiomaNav);
            avisoConDeshacer(msg);
        } catch (e) {
            avisoConDeshacer(e instanceof Error ? e.message : "No se pudo traducir y reemplazar.");
        }
    };

    useEffect(() => {
        const quitarEntradas = entradasIdioma({
            leerEnVozAlta: () => {},
            añadirAlPaquete: () => {},
            hayEdicion: () => false,
            abrirTraductor: () => {},
        }).map(registrarEntradaMenuTexto);

        const quitarReemplazo = registrarEntradaMenuTexto({
            id: "reemplazar-por-traduccion",
            etiqueta: "Reemplazar por la traducción",
            visible: (c) => Boolean(c.seleccionEditable),
            ejecutar: (c) => { if (c.seleccionEditable) void ejecutarReemplazo(c.seleccionEditable); },
        });

        const alMenu = (e: MouseEvent) => {
            const objetivo = e.target instanceof Element ? e.target : null;
            if (!objetivo) return;
            const capturada = capturarSeleccionEditable(document);
            objetivoRef.current = capturada;
        };

        document.addEventListener("contextmenu", alMenu, true);

        return () => {
            for (const q of quitarEntradas) q();
            quitarReemplazo();
            document.removeEventListener("contextmenu", alMenu, true);
        };
    }, [perfilId, idiomaNav]);

    const alDeshacer = () => {
        if (deshacerUltimo()) {
            setAviso({ mensaje: "Deshecho.", deshacer: false });
            window.setTimeout(() => setAviso(null), 2000);
        }
    };

    return (
        <>
            {aviso && (
                <div
                    role="status"
                    aria-live="polite"
                    className="fixed bottom-4 left-4 z-[1200] flex gap-2 rounded-xl border border-white/10 bg-[#0A0F1D]/90 px-3 py-2 text-xs text-white/80 backdrop-blur-[16px]"
                >
                    <span>{aviso.mensaje}</span>
                    {aviso.deshacer && (
                        <button
                            type="button"
                            onClick={alDeshacer}
                            className="cursor-pointer rounded-lg border border-white/15 px-2 py-1 text-xs transition-colors duration-150 hover:bg-white/10"
                        >
                            Deshacer
                        </button>
                    )}
                </div>
            )}
        </>
    );
}

// montar junto a <TraducirTexto /> en src/app/(app)/app-globals.tsx