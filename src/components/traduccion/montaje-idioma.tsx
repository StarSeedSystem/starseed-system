"use client";
/** Montaje de las entradas de idioma en el menú del texto (TRA1116 · IMA21).
 * Registra las tres entradas de IMA17 y la nueva "Reemplazar por la traducción"
 * (visible con ctx.editable y selección): traduce la selección con el MISMO
 * traductor y motores que traducir-texto.tsx, captura la selección ANTES de
 * abrir el menú con capturarSeleccionEditable (IMA19) y reemplaza al terminar;
 * si falla dice por qué y no toca el texto; muestra un aviso con "Deshacer".
 * Respeta el modo privado (crearTraductor({privado})). */
import { useEffect } from "react";
import { useAccount } from "@/context/account-context";
import { crearTraductor, motorAstraura, motorLibreTranslate, motorNavegador, type MotorTraduccion } from "@/lib/traduccion/motor";
import { crearClienteLibreTranslate } from "@/lib/traduccion/libretranslate";
import { leer } from "@/lib/traduccion/preferencias";
import { trozoDeLineaSSE } from "@/lib/astraura/conversacion-rapida";
import { registrarEntradaMenuTexto, type ContextoMenuTexto, type EntradaMenuTexto } from "@/components/traduccion/menu-texto";
import { reemplazar, deshacerUltimo, type ObjetivoEditable } from "@/components/traduccion/reemplazar-seleccion";
import { entradasIdioma } from "@/components/traduccion/entradas-idioma";
import { puedeLibreTranslate, nombreMotor, type PaginaActual } from "./traducir-texto";

const BASE_LT = process.env.NEXT_PUBLIC_LIBRETRANSLATE || "http://127.0.0.1:5100";
const TOPE = 4000;

function crearMotores(p: PaginaActual): MotorTraduccion[] {
    const lista: MotorTraduccion[] = [];
    if (p.translator) lista.push(motorNavegador({ Translator: p.translator }));
    if (puedeLibreTranslate(p)) lista.push(motorLibreTranslate(crearClienteLibreTranslate({ base: BASE_LT, fetch: (e, i) => fetch(e, i) }), "aparato"));
    lista.push(motorAstraura(traducirConAstraura, "publico"));
    return lista;
}

async function traducirConAstraura(textos: string[], _origen: string, destino: string): Promise<string[]> {
    const salida: string[] = [];
    for (const texto of textos) {
        const r = await fetch("/api/ai/astraura-158/api/starseed/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: [{ role: "user", content: `Traduce al ${destino} y devuelve SOLO la traducción:\n${texto}` }], persona_id: "astraura_prime", stream: true }),
        });
        if (!r.ok || !r.body) throw new Error(`La nube de Astraura no tradujo (HTTP ${r.status}).`);
        const lector = r.body.getReader(), dec = new TextDecoder();
        let resto = "", fuera = "";
        for (;;) {
            const trozo = await lector.read();
            if (trozo.done) break;
            resto += dec.decode(trozo.value, { stream: true });
            const lineas = resto.split("\n");
            resto = lineas.pop() ?? "";
            for (const linea of lineas) { const t = trozoDeLineaSSE(linea); if (t && t !== "[FIN]") fuera += t; }
        }
        const traduccion = fuera.trim();
        if (!traduccion) throw new Error("La nube de Astraura no devolvió traducción.");
        salida.push(traduccion);
    }
    return salida;
}

function avisoConDeshacer(mensaje: string): void {
    const contenedor = document.createElement("div");
    contenedor.className = "fixed bottom-4 left-4 z-[1200] rounded-xl border border-white/10 bg-[#0A0F1D]/95 px-3 py-2 text-sm text-white backdrop-blur-[16px] flex items-center gap-2";
    contenedor.setAttribute("role", "alert");
    contenedor.setAttribute("aria-live", "polite");
    const texto = document.createElement("span");
    texto.textContent = mensaje;
    const boton = document.createElement("button");
    boton.type = "button";
    boton.textContent = "Deshacer";
    boton.className = "cursor-pointer rounded-lg border border-white/15 px-2 py-1 text-xs transition-colors duration-150 hover:bg-white/10";
    boton.onclick = () => {
        deshacerUltimo();
        contenedor.remove();
    };
    contenedor.append(texto, boton);
    document.body.append(contenedor);
    setTimeout(() => { if (contenedor.isConnected) contenedor.remove(); }, 8000);
}

function avisoError(mensaje: string): void {
    const contenedor = document.createElement("div");
    contenedor.className = "fixed bottom-4 left-4 z-[1200] rounded-xl border border-red/30 bg-red/20 px-3 py-2 text-sm text-red backdrop-blur-[16px]";
    contenedor.setAttribute("role", "alert");
    contenedor.setAttribute("aria-live", "polite");
    contenedor.textContent = mensaje;
    document.body.append(contenedor);
    setTimeout(() => { if (contenedor.isConnected) contenedor.remove(); }, 5000);
}

export function MontajeIdioma() {
    const { user } = useAccount();

    useEffect(() => {
        const perfilId = user?.id ?? "";
        const idiomaNavegador = typeof navigator === "undefined" ? undefined : navigator.language;

        const quitarEntradasIdioma = entradasIdioma({
            leerEnVozAlta: (texto) => { /* no-op: se cablea en el componente que usa el menú */ },
            añadirAlPaquete: (texto) => { /* no-op */ },
            hayEdicion: () => false,
            abrirTraductor: (url) => { window.location.assign(url); },
        }).map(registrarEntradaMenuTexto);

        const quitarReemplazo = registrarEntradaMenuTexto({
            id: "reemplazar-por-traduccion",
            etiqueta: "Reemplazar por la traducción",
            visible: (ctx: ContextoMenuTexto) => Boolean(ctx.editable && ctx.seleccionEditable),
            ejecutar: async (ctx: ContextoMenuTexto) => {
                const objetivo = ctx.seleccionEditable;
                if (!objetivo) return;
                const destino = leer(perfilId, idiomaNavegador).idioma;
                const motores = crearMotores({
                    protocolo: location.protocol,
                    maquina: location.hostname,
                    translator: (window as { Translator?: unknown }).Translator,
                });
                try {
                    const [r] = await crearTraductor(motores, { privado: true }).traducir([objetivo.texto], "auto", destino);
                    if (!r) throw new Error("La traducción no llegó.");
                    if (!reemplazar(objetivo, r.texto)) throw new Error("La selección cambió y no se reemplazó.");
                    avisoConDeshacer(`Reemplazado con ${nombreMotor(r.motor)}.`);
                } catch (e) {
                    avisoError(e instanceof Error ? e.message : "No se pudo reemplazar la selección.");
                }
            },
        });

        return () => {
            for (const q of quitarEntradasIdioma) q();
            quitarReemplazo();
        };
    }, [user?.id]);

    return null;
}

// montar junto a <TraducirTexto /> en src/app/(app)/app-globals.tsx