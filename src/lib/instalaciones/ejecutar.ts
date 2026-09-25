"use client";

/**
 * Ejecuta las acciones de un plan de instalación (cliente).
 *
 * Lo usan el diálogo «¿Dónde quieres instalar…?» y el aviso de instalaciones pedidas
 * desde otra neurona, para que «instalar aquí» haga exactamente lo mismo en los dos.
 * Debe llamarse DENTRO del clic de la persona: los navegadores solo permiten abrir
 * ventanas o lanzar descargas cuando vienen de una acción suya.
 */

import { installApp, saveResource } from "@/lib/library-store";
import { lanzarDescarga } from "@/lib/install/instalar-os";

import type { AccionInstalacion, AppParaInstalar } from "./plan";

/**
 * Lanza la descarga del instalador. En el navegador es un enlace normal: GitHub responde
 * «descárgalo» y el navegador lo guarda en su carpeta de Descargas (no hay forma honesta de
 * elegir otra carpeta desde una web: la descarga de GitHub no admite CORS). En la app nativa
 * se abre en una ventana, que es la vía que el sistema resuelve con su propio gestor.
 */
export function iniciarDescarga(url: string, archivo: string, via: "enlace" | "ventana"): boolean {
    // Un solo lanzador de descargas en todo el OS (el mismo que usa «Instalar StarSeed OS»).
    return lanzarDescarga(url, archivo, via);
}

/** Abre la web oficial en otra pestaña: allí el navegador ofrece «Instalar app» o «Añadir a pantalla de inicio». */
export function abrirWebParaInstalar(web: string): void {
    if (typeof window === "undefined") return;
    try {
        window.open(web, "_blank", "noopener,noreferrer");
    } catch {
        /* bloqueado por el navegador: el botón sigue visible para reintentar */
    }
}

export interface ResultadoEjecucion {
    descargaIniciada: boolean;
    errores: string[];
}

export function ejecutarAcciones(app: AppParaInstalar, acciones: readonly AccionInstalacion[]): ResultadoEjecucion {
    const res: ResultadoEjecucion = { descargaIniciada: false, errores: [] };
    for (const a of acciones) {
        try {
            if (a.tipo === "guardar-biblioteca") {
                saveResource({ id: `ss-app-${app.id}`, kind: "app", title: app.nombre, url: a.url, origin: "Explorar · Apps StarSeed" });
            } else if (a.tipo === "anadir-lanzador") {
                installApp({ id: app.id, name: app.nombre });
            } else if (a.tipo === "descargar") {
                if (iniciarDescarga(a.url, a.archivo, a.via)) res.descargaIniciada = true;
                else res.errores.push(`No se pudo iniciar la descarga de ${a.archivo}.`);
            }
            // «avisar-neuronas» lo hace guardarDestinos (canal de la cuenta), no aquí.
        } catch {
            res.errores.push(`Falló un paso de la instalación de ${app.nombre}.`);
        }
    }
    return res;
}
