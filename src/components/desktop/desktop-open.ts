'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Apertura de iconos del escritorio
// ----------------------------------------------------------------
// Un solo punto de verdad para "pulsar abre". En el ESCRITORIO, abrir
// algo significa SIEMPRE abrirlo EN UNA VENTANA: nunca navegar fuera.
//
// ⚠️ CAUSA RAÍZ del bug H-1 (Adenda 69), documentada aquí para que no
// vuelva: esta función hacía `router.push(open.route)` para toda app con
// `open.primary === "route"` (que son CASI TODAS las nativas: Mensajes,
// Red, Biblioteca, Agente, Cámara, Galería, Audiomorphic, Omnifrecuencias…).
// Resultado: pulsar un icono te SACABA del escritorio (o, si el clic ni
// siquiera llegaba —ver desktop-canvas.tsx—, no pasaba absolutamente nada).
// Un escritorio cuyos iconos te echan del escritorio no es un escritorio.
// Ahora: ventana con el MÓDULO REAL montado dentro (NATIVE_APP_VIEWS en
// desktop-window-content.tsx). El `href` externo sigue disponible desde la
// barra de título de la ventana.
// ════════════════════════════════════════════════════════════════

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { DesktopIcon } from "./desktop-store";
import { openWindow } from "./desktop-store";
import { getApp } from "@/components/dashboard/apps/app-catalog";
import { widgetWindowSize } from "./desktop-widget-host";

export type OpenDesktopIcon = (icon: DesktopIcon) => void;

/** Tipos de archivo con editor de texto real dentro de la ventana. */
const TEXT_EDITABLE = new Set(["note", "text", "markdown", "code", "html", "csv"]);

/** ¿Este icono se puede EDITAR (y no solo ver)? */
export function canEditIcon(icon: DesktopIcon): boolean {
    if (icon.kind === "file") return TEXT_EDITABLE.has(icon.fileKind ?? "") || Boolean(icon.text);
    // Folders, enlaces y widgets se "editan" (renombrar/configurar/URL).
    return icon.kind === "link" || icon.kind === "widget" || icon.kind === "folder";
}

export function useOpenDesktopIcon(desktopId: string | null | undefined): OpenDesktopIcon {
    return useCallback<OpenDesktopIcon>((icon) => {
        if (!desktopId) return;
        try {
            switch (icon.kind) {
                case "app": {
                    const app = icon.refId ? getApp(icon.refId) : undefined;
                    if (!app) {
                        // Referencia rota: la ventana lo explica (no rompe el escritorio).
                        openWindow(desktopId, { type: "app", ref: icon.refId ?? "", name: icon.name }, { w: 640, h: 440 });
                        return;
                    }
                    if (app.status === "soon") {
                        openWindow(desktopId, { type: "app", ref: app.id, name: app.name }, { w: 640, h: 460 });
                        return;
                    }
                    // TODO app —nativa (route), incrustable (href) o ambas— abre VENTANA.
                    // El contenido lo resuelve DesktopWindowContent, que prefiere el
                    // módulo nativo del OS y solo cae al iframe si no hay ninguno.
                    const big = Boolean(app.open.route) || app.open.embeddable !== false;
                    openWindow(
                        desktopId,
                        { type: "app", ref: app.id, name: app.name },
                        big ? { w: 1040, h: 700 } : { w: 720, h: 520 },
                    );
                    return;
                }
                case "widget": {
                    if (!icon.refId) return;
                    openWindow(
                        desktopId,
                        { type: "widget", ref: icon.refId, name: icon.name },
                        widgetWindowSize(icon.refId),
                    );
                    return;
                }
                case "file": {
                    // Nota rápida → ventana editor de nota (más compacta).
                    if (icon.fileKind === "note") {
                        openWindow(
                            desktopId,
                            { type: "file", ref: icon.id, name: icon.name, meta: { kind: "note", noteId: icon.id } },
                            { w: 460, h: 420 },
                        );
                        return;
                    }
                    openWindow(
                        desktopId,
                        {
                            type: "file",
                            ref: icon.url ?? "",
                            name: icon.name,
                            meta: { kind: icon.fileKind, iconId: icon.id },
                        },
                        { w: 920, h: 620 },
                    );
                    return;
                }
                case "link": {
                    openWindow(
                        desktopId,
                        { type: "browser", ref: icon.url ?? "", name: icon.name },
                        { w: 980, h: 660 },
                    );
                    return;
                }
                case "folder": {
                    openWindow(
                        desktopId,
                        { type: "folder", ref: icon.id, name: icon.name },
                        { w: 660, h: 470 },
                    );
                    return;
                }
            }
        } catch {
            /* tolerante: una referencia corrupta no tumba el escritorio */
        }
    }, [desktopId]);
}

/**
 * "Editar" (H-2): abre el editor ADECUADO al tipo, no un visor genérico.
 *   • nota / texto / código / markdown / html / csv → editor de texto real
 *     dentro de la ventana (guarda de verdad, ver desktop-window-content).
 *   • pizarra → /pizarra · publicación → /crear (sus editores nativos).
 *   • imagen / vídeo / pdf… → su visor con acciones (Quick Look / ventana).
 *   • enlace / widget / folder → los gestiona el lienzo (renombrar, config).
 * Devuelve `true` si ha abierto un editor; `false` si el lienzo debe
 * encargarse (p. ej. renombrar in-situ o abrir el panel del widget).
 */
export function useEditDesktopIcon(desktopId: string | null | undefined): (icon: DesktopIcon) => boolean {
    const router = useRouter();
    const open = useOpenDesktopIcon(desktopId);

    return useCallback((icon: DesktopIcon): boolean => {
        if (!desktopId) return false;
        try {
            if (icon.kind === "file") {
                const kind = icon.fileKind ?? "";
                if (kind === "pizarra" || kind === "canvas") {
                    router.push(icon.refId ? `/pizarra?canvas=${encodeURIComponent(icon.refId)}` : "/pizarra");
                    return true;
                }
                if (kind === "post" || kind === "publicacion" || kind === "publication") {
                    router.push("/crear");
                    return true;
                }
                if (kind === "note") { open(icon); return true; }
                if (TEXT_EDITABLE.has(kind) || icon.text) {
                    // Editor de texto/código REAL (carga el contenido y lo guarda).
                    openWindow(
                        desktopId,
                        {
                            type: "file",
                            ref: icon.url ?? "",
                            name: icon.name,
                            meta: { kind, iconId: icon.id, mode: "edit" },
                        },
                        { w: 760, h: 560 },
                    );
                    return true;
                }
                // Imagen, vídeo, pdf, 3D…: su visor con acciones.
                open(icon);
                return true;
            }
            if (icon.kind === "link") {
                open(icon); // El navegador del OS ya trae barra de URL editable.
                return true;
            }
        } catch { /* tolerante */ }
        return false;
    }, [desktopId, router, open]);
}
