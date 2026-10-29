"use client";
/** Traducción por clic derecho (TRD1020G, repos-libreria-1020d.md §4): registra en el menú de
 * TRD1020E «Traducir selección», «Traducir este párrafo», «Traducir toda la página» y «Ver
 * original»; selección y párrafo van a una ventanita con traducción, motor y «Copiar», y la
 * página entera se traduce por lotes con aviso de progreso. Motor de TRD1020B (navegador ›
 * LibreTranslate de la neurona solo en localhost o app nativa, porque una página https no puede
 * llamar a 127.0.0.1 › Astraura por el OS) y pagina.ts de TRD1020C; idioma destino: el perfil. */
import { useEffect, useRef, useState } from "react";
import { useAccount } from "@/context/account-context";
import { crearTraductor, motorAstraura, motorLibreTranslate, motorNavegador, type MotorTraduccion } from "@/lib/traduccion/motor";
import { aplicar, recogerTextos, restaurar } from "@/lib/traduccion/pagina";
import { crearClienteLibreTranslate, crearLotes } from "@/lib/traduccion/libretranslate";
import { leer } from "@/lib/traduccion/preferencias";
import { trozoDeLineaSSE } from "@/lib/astraura/conversacion-rapida";
import { establecerPaginaTraducida, registrarEntradaMenuTexto, type ContextoMenuTexto } from "@/components/traduccion/menu-texto";

const BASE_LT = process.env.NEXT_PUBLIC_LIBRETRANSLATE || "http://127.0.0.1:5100";
const TOPE = 4000;

/** Cómo es la página donde corre la traducción (para elegir los motores que la encuentran). */
export interface PaginaActual { protocolo?: string; maquina?: string; nativa?: boolean; translator?: unknown }

/** ¿Esta página puede llamar a LibreTranslate de la neurona (127.0.0.1)? Una página https
 * pública no puede (contenido mixto); la app nativa y una página http/dev sí. */
export function puedeLibreTranslate(p: PaginaActual): boolean {
    if (p.nativa) return true;
    if (p.protocolo === "https:") return p.maquina === "localhost" || p.maquina === "127.0.0.1";
    return p.protocolo === "http:";
}

/** Textos del ctx del menú, acotados: la selección y el bloque bajo el puntero (el «párrafo»). */
export function textosATraducir(ctx: ContextoMenuTexto, tope = TOPE): { seleccion: string; parrafo: string } {
    const bloque = ctx.objetivo?.closest("p, li, blockquote, h1, h2, h3, h4, td");
    return { seleccion: ctx.seleccion.slice(0, tope), parrafo: (bloque?.textContent ?? ctx.objetivo?.textContent ?? "").trim().slice(0, tope) };
}

const NOMBRES_MOTOR: Record<string, string> = { navegador: "Traductor del navegador", libretranslate: "LibreTranslate de la neurona", astraura: "Astraura" };

/** Nombre amable del motor para la ventanita; un id nuevo se muestra tal cual llega. */
export function nombreMotor(id: string): string { return NOMBRES_MOTOR[id] ?? id; }

/** Aviso discreto de progreso de la página entera. */
export function avisoProgreso(traducidos: number, total: number): string {
    return total === 0 ? "No hay nada que traducir" : `Traduciendo la página: ${Math.min(traducidos, total)} de ${total}…`;
}

/** Motores de TRD1020B de esta página: navegador › LibreTranslate si se alcanza › Astraura. */
export function crearMotores(p: PaginaActual): MotorTraduccion[] {
    const lista: MotorTraduccion[] = [];
    if (p.translator !== undefined && p.translator !== null) lista.push(motorNavegador({ Translator: p.translator }));
    if (puedeLibreTranslate(p)) lista.push(motorLibreTranslate(crearClienteLibreTranslate({ base: BASE_LT, fetch: (e, i) => fetch(e, i) }), "aparato"));
    lista.push(motorAstraura(traducirConAstraura, "publico"));
    return lista;
}

/** Astraura (el enrutador de IA gratis primero) por el proxy del OS: un turno por texto, SSE
 * del puente `/api/starseed/chat` (POST_ALLOW de `api/ai/astraura-158/[...path]`, §Adenda 153). */
export async function traducirConAstraura(textos: string[], _origen: string, destino: string): Promise<string[]> {
    const salida: string[] = [];
    for (const texto of textos) {
        const r = await fetch("/api/ai/astraura-158/api/starseed/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: [{ role: "user", content: `Traduce al ${destino} y devuelve SOLO la traducción:\n${texto}` }], persona_id: "astraura_prime", stream: true }),
        });
        if (!r.ok || !r.body) throw new Error(`La nube de Astraura no tradujo (HTTP ${r.status}).`);
        const lector = r.body.getReader();
        const dec = new TextDecoder();
        let resto = "";
        let fuera = "";
        for (;;) {
            const trozo = await lector.read();
            if (trozo.done) break;
            resto += dec.decode(trozo.value, { stream: true });
            const lineas = resto.split("\n");
            resto = lineas.pop() ?? "";
            for (const linea of lineas) {
                const t = trozoDeLineaSSE(linea);
                if (t && t !== "[FIN]") fuera += t;
            }
        }
        const traduccion = fuera.trim();
        if (!traduccion) throw new Error("La nube de Astraura no devolvió traducción.");
        salida.push(traduccion);
    }
    return salida;
}

interface Ventana { texto: string; motor: string }

export function TraducirTexto() {
    const { user } = useAccount();
    const [ventana, setVentana] = useState<Ventana | null>(null);
    const [progreso, setProgreso] = useState<string | null>(null);
    const porCopiar = useRef("");
    const destino = () => leer(user?.id ?? "", typeof navigator === "undefined" ? undefined : navigator.language).idioma;
    const motores = () => crearMotores({ protocolo: location.protocol, maquina: location.hostname, translator: (window as { Translator?: unknown }).Translator });
    const aviso = (mensaje: string) => {
        setProgreso(mensaje);
        window.setTimeout(() => setProgreso((x) => (x === mensaje ? null : x)), 4000);
    };

    const traducirUno = async (texto: string) => {
        const dest = destino();
        if (!texto) { aviso("No hay texto que traducir."); return; }
        setVentana({ texto: "Traduciendo…", motor: "" });
        try {
            const [r] = await crearTraductor(motores()).traducir([texto], "auto", dest);
            if (!r) throw new Error("La traducción no llegó.");
            porCopiar.current = r.texto;
            setVentana({ texto: r.texto, motor: r.motor });
        } catch (e) {
            setVentana(null);
            aviso(e instanceof Error ? e.message : "No se pudo traducir.");
        }
    };

    const traducirPagina = async () => {
        const dest = destino();
        const recogidos = recogerTextos(document.body);
        const unicos = Array.from(new Set(recogidos.map((x) => x.texto).filter((t) => t.trim())));
        const traductor = crearTraductor(motores());
        const mapa: Record<string, string> = {};
        let hechos = 0;
        setProgreso(avisoProgreso(0, unicos.length));
        try {
            for (const lote of crearLotes(unicos, TOPE)) {
                const rs = await traductor.traducir(lote, "auto", dest);
                rs.forEach((r, i) => { mapa[lote[i]] = r.texto; });
                hechos += lote.length;
                setProgreso(avisoProgreso(hechos, unicos.length));
            }
            aplicar(recogidos, mapa, dest);
            establecerPaginaTraducida(true);
        } catch (e) {
            aviso(e instanceof Error ? e.message : "La traducción de la página no pudo empezar.");
            return;
        }
        setProgreso(null);
    };

    const verOriginal = () => { restaurar(document.body); establecerPaginaTraducida(false); setVentana(null); setProgreso(null); };
    const copiar = () => { void navigator.clipboard?.writeText(porCopiar.current).catch(() => undefined); };

    useEffect(() => {
        const quitar = [
            { id: "traducir-seleccion", etiqueta: "Traducir selección", visible: (c: ContextoMenuTexto) => c.seleccion.length > 0, ejecutar: (c: ContextoMenuTexto) => void traducirUno(textosATraducir(c).seleccion) },
            { id: "traducir-parrafo", etiqueta: "Traducir este párrafo", ejecutar: (c: ContextoMenuTexto) => void traducirUno(textosATraducir(c).parrafo) },
            { id: "traducir-pagina", etiqueta: "Traducir toda la página", ejecutar: () => void traducirPagina() },
            { id: "ver-original", etiqueta: "Ver original", visible: (c: ContextoMenuTexto) => c.paginaTraducida, ejecutar: () => verOriginal() },
        ].map(registrarEntradaMenuTexto);
        return () => { for (const q of quitar) q(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    const boton = "cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-xs transition-colors duration-150 hover:bg-white/10";
    return (
        <>
            {ventana && (
                <div role="dialog" aria-label="Traducción" className="fixed bottom-4 right-4 z-[1200] max-w-sm space-y-2 rounded-2xl border border-white/10 bg-[#0A0F1D]/95 p-4 text-white shadow-lg shadow-black/50 backdrop-blur-[16px]">
                    <p className="text-sm whitespace-pre-wrap">{ventana.texto}</p>
                    {ventana.motor && <p className="text-xs text-white/60">Motor: {nombreMotor(ventana.motor)}</p>}
                    <div className="flex gap-2">
                        <button type="button" onClick={copiar} disabled={!ventana.motor} className={boton}>Copiar</button>
                        <button type="button" onClick={() => setVentana(null)} className={boton}>Cerrar</button>
                    </div>
                </div>
            )}
            {progreso && (
                <div role="status" aria-live="polite" className="fixed bottom-4 left-4 z-[1200] rounded-xl border border-white/10 bg-[#0A0F1D]/90 px-3 py-2 text-xs text-white/80 backdrop-blur-[16px]">
                    {progreso}
                </div>
            )}
        </>
    );
}
