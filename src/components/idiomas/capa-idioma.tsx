"use client";

/**
 * IDI1115N · Monta la capa de idioma en el layout raíz: lee el idioma que rige (neurona › cuenta ›
 * español), carga su catálogo del paquete y lo aplica a todo el cuerpo; reacciona al evento
 * `starseed:idioma` (elección nueva) y a `storage` (otra pestaña). Sin UI propia.
 */
import { useEffect } from "react";
import { iniciarCapa, fijarDocumento, type CapaActiva } from "@/lib/idiomas/capa";
import { cargarCatalogo } from "@/lib/idiomas/catalogos/cargar";
import { EVENTO_IDIOMA, CLAVE_IDIOMA_NEURONA, idiomaEfectivo } from "@/lib/idiomas/estado";
import { IDIOMA_FUENTE } from "@/lib/idiomas/idiomas";
import { cuandoEsSeguroTraducir, entornoDelNavegador } from "@/lib/idiomas/hidratacion";

export function CapaIdioma(): null {
    useEffect(() => {
        let capa: CapaActiva | null = null;
        let vivo = true;
        const aplicarInicial = async (): Promise<void> => {
            await cuandoEsSeguroTraducir(entornoDelNavegador(window));
            if (!vivo) return;
            const { codigo } = idiomaEfectivo();
            const cat = codigo === IDIOMA_FUENTE ? null : await cargarCatalogo(codigo);
            if (!vivo) return;
            const aplicado = cat ? codigo : IDIOMA_FUENTE;
            capa = iniciarCapa(document.body, document, aplicado, cat);
            if (!cat) fijarDocumento(document, IDIOMA_FUENTE);
        };
        const aplicarCambio = async (): Promise<void> => {
            if (!capa) return;
            const { codigo } = idiomaEfectivo();
            const cat = codigo === IDIOMA_FUENTE ? null : await cargarCatalogo(codigo);
            const aplicado = cat ? codigo : IDIOMA_FUENTE;
            capa.cambiar(cat, aplicado);
            if (!cat) fijarDocumento(document, IDIOMA_FUENTE);
        };
        const alAlmacenar = (e: StorageEvent): void => { if (e.key === CLAVE_IDIOMA_NEURONA || e.key === null) void aplicarCambio(); };
        void aplicarInicial();
        window.addEventListener(EVENTO_IDIOMA, aplicarCambio);
        window.addEventListener("storage", alAlmacenar);
        return () => { vivo = false; window.removeEventListener(EVENTO_IDIOMA, aplicarCambio); window.removeEventListener("storage", alAlmacenar); capa?.parar(); };
    }, []);
    return null;
}
