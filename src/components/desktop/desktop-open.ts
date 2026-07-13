'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Apertura de iconos del escritorio
// ----------------------------------------------------------------
// Un solo punto de verdad para "doble clic/tap abre": respeta el modo
// de apertura REAL de cada app del catálogo (route → módulo nativo,
// href embebible → ventana del escritorio, resto → pestaña), y abre
// widgets/archivos/enlaces/folders en ventanas propias. Tolerante a
// errores: nunca rompe el escritorio por una referencia inválida.
// ════════════════════════════════════════════════════════════════

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { DesktopIcon } from "./desktop-store";
import { openWindow } from "./desktop-store";
import { getApp } from "@/components/dashboard/apps/app-catalog";
import { widgetWindowSize } from "./desktop-widget-host";

export type OpenDesktopIcon = (icon: DesktopIcon) => void;

export function useOpenDesktopIcon(desktopId: string | null | undefined): OpenDesktopIcon {
    const router = useRouter();

    return useCallback<OpenDesktopIcon>((icon) => {
        if (!desktopId) return;
        try {
            switch (icon.kind) {
                case "app": {
                    const app = icon.refId ? getApp(icon.refId) : undefined;
                    if (!app) {
                        openWindow(desktopId, { type: "app", ref: icon.refId ?? "", name: icon.name }, { w: 640, h: 440 });
                        return;
                    }
                    if (app.status === "soon") {
                        openWindow(desktopId, { type: "app", ref: app.id, name: app.name }, { w: 640, h: 460 });
                        return;
                    }
                    const { open } = app;
                    if (open.primary === "route" && open.route) {
                        router.push(open.route);
                        return;
                    }
                    if (open.href && open.embeddable !== false) {
                        openWindow(desktopId, { type: "app", ref: app.id, name: app.name }, { w: 1000, h: 660 });
                        return;
                    }
                    if (open.href) {
                        window.open(open.href, "_blank", "noopener,noreferrer");
                        return;
                    }
                    if (open.route) {
                        router.push(open.route);
                        return;
                    }
                    openWindow(desktopId, { type: "app", ref: app.id, name: app.name });
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
                        { type: "file", ref: icon.url ?? "", name: icon.name, meta: { kind: icon.fileKind } },
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
    }, [desktopId, router]);
}
