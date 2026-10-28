"use client";

/*
 * Traducción · página entera, MONTAJE global (TRD1020C, repos-libreria-1020d.md §4).
 * Defensivo y sin UI: si el perfil elige autotraducción «siempre» en el contexto
 * «páginas» (preferencias de TRD1020D, ajustes → Traducción, viaje con la cuenta),
 * traduce la página entera por las capas del motor de TRD1020B (navegador ›
 * LibreTranslate de la cuenta) y sigue los textos nuevos. Cambia la preferencia
 * (evento 'starseed:traduccion') o cierra sesión → lo devuelve todo como estaba
 * y se suelta. La esquina honesta: el idioma que ya se entiende NO se filtra aquí
 * por texto (la detección por lote la aplica LibreTranslate con source=auto y un
 * resultado igual al original no se toca).
 */

import { useEffect } from "react";
import { useAccount } from "@/context/account-context";
import { leer } from "@/lib/traduccion/preferencias";
import { crearClienteLibreTranslate } from "@/lib/traduccion/libretranslate";
import { crearTraductor, motorLibreTranslate, motorNavegador } from "@/lib/traduccion/motor";
import { crearPaginaViva, type ClienteTraduccion, type PaginaViva } from "@/lib/traduccion/pagina-viva";

/** LibreTranslate de la neurona llega por el túnel del A1: 127.0.0.1:5100 (medido, §7). */
const BASE_PREDIECHO =
    process.env.NEXT_PUBLIC_LIBRETRANSLATE || "http://127.0.0.1:5100";

export function PaginaVivaMontaje() {
    const { user } = useAccount();
    useEffect(() => {
        const perfiles = user?.id ?? "";
        const idioma = typeof navigator === "undefined" ? undefined : navigator.language;
        let viva: PaginaViva | null = null;
        const decidir = () => {
            const prefs = leer(perfiles, idioma);
            if (prefs.auto.paginas === "siempre") {
                if (!viva) {
                    const cliente = crearClienteLibreTranslate({ base: BASE_PREDIECHO, fetch: (e, i) => fetch(e, i) });
                    const traductor = crearTraductor([motorNavegador(), motorLibreTranslate(cliente)]);
                    const capas: ClienteTraduccion = {
                        traducir: async (p) => {
                            const r = await traductor.traducir(p.q, p.source, p.target);
                            return { translatedText: r.map((x) => x.texto) };
                        },
                    };
                    viva = crearPaginaViva({ cliente: capas, raiz: document.body, idioma: prefs.idioma });
                }
            } else {
                viva?.parar();
                viva = null;
            }
        };
        decidir();
        window.addEventListener("starseed:traduccion", decidir);
        return () => {
            window.removeEventListener("starseed:traduccion", decidir);
            viva?.parar();
            viva = null;
        };
    }, [user?.id]);
    return null;
}
