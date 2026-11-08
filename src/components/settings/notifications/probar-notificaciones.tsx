"use client";

/**
 * ProbarNotificaciones — Ajustes → Notificaciones (NOT1108A · 2026-11-08).
 * Contrato: architecture/avisos-mensajes.md.
 *
 * Dice, para ESTE medio (app nativa de escritorio, APK de Android, navegador o PWA), qué avisos de mensajes
 * puede dar y por qué no si no puede: permiso del sistema, canal «Mensajes» de Android, service worker y los
 * permisos de la app «Mensajes» en el centro. «Probar» lanza los dos avisos (dentro del OS y del sistema);
 * «Probar en 5 s» deja tiempo para pasar la app a segundo plano, que es donde importa el del sistema. En la
 * app con servidor local enseña además el origen (puerto principal, cambios y último rescate).
 */

import React from "react";
import { BellRing, Loader2, RefreshCw, ShieldCheck, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EstadoNotificaciones } from "@/lib/notifications/avisos-mensajes";

type Fila = { etiqueta: string; valor: string; bien: boolean | null };

const PERMISOS: Record<string, string> = {
    concedido: "concedido",
    granted: "concedido",
    denegado: "denegado",
    denied: "denegado",
    preguntar: "sin decidir",
    default: "sin decidir",
    desconocido: "desconocido",
    "no-soportado": "no disponible",
};

const SISTEMAS: Record<string, string> = { macos: "macOS", windows: "Windows", linux: "Linux", android: "Android", ios: "iOS" };

/** Las filas del estado (pura: la usan las pruebas). */
export function filasEstado(e: EstadoNotificaciones): Fila[] {
    const filas: Fila[] = [];
    if (e.medio === "app-nativa" && e.nativo) {
        const p = e.nativo.permiso;
        filas.push({ etiqueta: "Medio", valor: `App instalada · ${SISTEMAS[e.nativo.plataforma] ?? e.nativo.plataforma}`, bien: null });
        filas.push({ etiqueta: "Permiso del sistema", valor: PERMISOS[p] ?? p, bien: p === "concedido" ? true : p === "denegado" ? false : null });
        if (e.nativo.canal) filas.push({ etiqueta: "Canal de Android", valor: `«Mensajes» (${e.nativo.canal})`, bien: true });
        filas.push({
            etiqueta: "Con la app cerrada",
            valor: e.nativo.respaldo_nativo ? "la app avisa lo que llega por la red local" : "solo con la app abierta",
            bien: e.nativo.respaldo_nativo,
        });
        if (e.nativo.ultimo_error) filas.push({ etiqueta: "Último error", valor: e.nativo.ultimo_error, bien: false });
    } else {
        filas.push({ etiqueta: "Medio", valor: e.sw ? "Navegador o PWA (con service worker)" : "Navegador", bien: null });
        filas.push({ etiqueta: "Permiso del navegador", valor: PERMISOS[e.web] ?? e.web, bien: e.web === "granted" ? true : e.web === "denied" ? false : null });
    }
    filas.push({ etiqueta: "Avisos dentro del OS", valor: e.popups ? "sí" : "apagados en «Mensajes»", bien: e.popups });
    filas.push({ etiqueta: "Centro de notificaciones", valor: e.centro ? "sí" : "apagado en «Mensajes»", bien: e.centro });
    if (e.origen && e.origen.principal) {
        const ult = e.origen.ultimo_puerto;
        filas.push({
            etiqueta: "Origen del servidor local",
            valor: `127.0.0.1:${e.origen.principal}${ult && ult !== e.origen.principal ? ` (ahora ${ult})` : ""} · ${e.origen.cambios} cambio(s)`,
            bien: !ult || ult === e.origen.principal,
        });
        if (e.origen.ultimo_rescate) filas.push({ etiqueta: "Último rescate", valor: e.origen.ultimo_rescate, bien: null });
    }
    return filas;
}

export function ProbarNotificaciones() {
    const [estado, setEstado] = React.useState<EstadoNotificaciones | null>(null);
    const [ocupado, setOcupado] = React.useState<null | "estado" | "permiso" | "probar" | "espera">(null);
    const [resultado, setResultado] = React.useState<string | null>(null);
    const temporizador = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const leer = React.useCallback(async () => {
        setOcupado("estado");
        try {
            const a = await import("@/lib/notifications/avisos-mensajes");
            setEstado(await a.estadoNotificaciones());
        } finally {
            setOcupado(null);
        }
    }, []);

    React.useEffect(() => {
        void leer();
        return () => {
            if (temporizador.current) clearTimeout(temporizador.current);
        };
    }, [leer]);

    const pedir = async () => {
        setOcupado("permiso");
        try {
            const a = await import("@/lib/notifications/avisos-mensajes");
            const r = await a.pedirPermisoNotificaciones();
            setResultado(`Permiso: ${PERMISOS[r] ?? r}.`);
            setEstado(await a.estadoNotificaciones());
        } finally {
            setOcupado(null);
        }
    };

    const probar = async () => {
        setOcupado("probar");
        try {
            const a = await import("@/lib/notifications/avisos-mensajes");
            const r = await a.probarNotificaciones();
            setResultado(
                `Dentro del OS: ${r.dentro ? "enviada (mírala en la campana)" : "no (apagada en «Mensajes»)"}. ` +
                    `Del sistema: ${r.sistema.ok ? "enviada" : `no — ${r.sistema.motivo ?? "sin motivo"}`}.`,
            );
            setEstado(await a.estadoNotificaciones());
        } finally {
            setOcupado(null);
        }
    };

    const probarEnCinco = () => {
        setOcupado("espera");
        setResultado("En 5 s: pasa la app a segundo plano (otra app o la pantalla de inicio) para ver la del sistema.");
        temporizador.current = setTimeout(() => void probar(), 5000);
    };

    const permiso = estado?.medio === "app-nativa" ? estado.nativo?.permiso : estado?.web;
    const faltaPermiso = permiso === "preguntar" || permiso === "default";

    return (
        <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.02] p-3" data-testid="probar-notificaciones">
            <div className="mb-2 flex items-center gap-2">
                <BellRing className="h-4 w-4 text-sky-300" aria-hidden />
                <p className="text-[13px] font-medium text-white/90">Avisos de mensajes en este aparato</p>
                <button
                    type="button"
                    onClick={() => void leer()}
                    className="ml-auto grid h-7 w-7 cursor-pointer place-items-center rounded-full text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
                    aria-label="Volver a mirar el estado de las notificaciones"
                    title="Volver a mirar"
                >
                    {ocupado === "estado" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                </button>
            </div>
            {estado ? (
                <dl className="grid grid-cols-1 gap-x-3 gap-y-1 text-[12px] sm:grid-cols-[auto_1fr]">
                    {filasEstado(estado).map((f) => (
                        <React.Fragment key={f.etiqueta}>
                            <dt className="text-white/45">{f.etiqueta}</dt>
                            <dd className={f.bien === false ? "text-amber-300" : f.bien ? "text-emerald-300" : "text-white/80"}>{f.valor}</dd>
                        </React.Fragment>
                    ))}
                </dl>
            ) : (
                <p className="text-[12px] text-white/45">Mirando qué puede avisar este aparato…</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
                {faltaPermiso && (
                    <Button size="sm" variant="secondary" onClick={() => void pedir()} disabled={!!ocupado}>
                        {ocupado === "permiso" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />}
                        Permitir notificaciones
                    </Button>
                )}
                <Button size="sm" onClick={() => void probar()} disabled={!!ocupado}>
                    {ocupado === "probar" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <BellRing className="mr-1.5 h-3.5 w-3.5" />}
                    Probar notificaciones
                </Button>
                <Button size="sm" variant="outline" onClick={probarEnCinco} disabled={!!ocupado}>
                    <Timer className="mr-1.5 h-3.5 w-3.5" />
                    Probar en 5 s
                </Button>
            </div>
            {resultado && (
                <p className="mt-2 text-[11px] leading-snug text-white/60" role="status" aria-live="polite">
                    {resultado}
                </p>
            )}
        </div>
    );
}

export default ProbarNotificaciones;
