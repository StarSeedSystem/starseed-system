"use client";

/*
 * Traducción · página entera, MONTAJE global (TRD1020C, repos-libreria-1020d.md §4).
 * Defensivo y sin UI: si el perfil elige autotraducción «siempre» en el contexto
 * «páginas» (preferencias de TRD1020D, ajustes → Traducción, viaje con la cuenta),
 * traduce la página entera con LibreTranslate de la neurona y sigue los textos
 * nuevos. Cambia la preferencia (evento 'starseed:traduccion') o cierra sesión →
 * lo devuelve todo como estaba y se suelta. La esquina honesta: el idioma que ya
 * se entiende NO se filtra aquí por texto (la detección por lote la aplica
 * LibreTranslate con source=auto y un resultado igual al original no se toca).
 */

import { useEffect } from "react";
import { useAccount } from "@/context/account-context";
import { establecerPaginaTraducida } from "@/components/traduccion/menu-texto";
import { leer } from "@/lib/traduccion/preferencias";
import { crearClienteLibreTranslate } from "@/lib/traduccion/libretranslate";
import { crearPaginaViva, type PaginaViva } from "@/lib/traduccion/pagina-viva";

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
                    viva = crearPaginaViva({
                        cliente: crearClienteLibreTranslate({ base: BASE_PREDIECHO, fetch: (e, i) => fetch(e, i) }),
                        raiz: document.body,
                        idioma: prefs.idioma,
                    });
                    // TRD1020E: el menú del clic derecho ve en su ctx que el motor de página
                    // entera está activo (es la llamada que el contrato pide a TRD1020C).
                    establecerPaginaTraducida(true);
                }
            } else {
                if (viva) {
                    viva.parar();
                    establecerPaginaTraducida(false);
                }
                viva = null;
            }
        };
        decidir();
        window.addEventListener("starseed:traduccion", decidir);
        return () => {
            window.removeEventListener("starseed:traduccion", decidir);
            if (viva) {
                viva.parar();
                establecerPaginaTraducida(false);
            }
            viva = null;
        };
    }, [user?.id]);
    return null;
}
