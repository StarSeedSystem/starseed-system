"use client";
/**
 * Montaje global del bloqueo (Ola 382 · BLQ5). Ligero a propósito (vive en el layout raíz):
 * solo lee la configuración de ESTA neurona y vigila la actividad; la pantalla se carga a
 * demanda cuando de verdad hay que bloquear. Con el método «ninguno» no hace nada.
 * `window.dispatchEvent(new Event("starseed:bloquear"))` bloquea a mano.
 */
import * as React from "react";
import dynamic from "next/dynamic";
import { AnimatePresence } from "framer-motion";
import { deviceId } from "@/lib/sync/entity-state";
import {
    CLAVE_BLOQUEO, EVENTO_CONFIG_BLOQUEO, debeBloquear, leerConfigBloqueo, leerDesbloqueoSesion, marcarDesbloqueoSesion,
    type ConfigBloqueo,
} from "@/lib/bloqueo/politica-bloqueo";

const PantallaBloqueo = dynamic(() => import("./pantalla-bloqueo").then((m) => m.PantallaBloqueo), { ssr: false });

export const EVENTO_BLOQUEAR = "starseed:bloquear";

export function BloqueoMontaje() {
    const [cfg, setCfg] = React.useState<ConfigBloqueo | null>(null);
    const [bloqueado, setBloqueado] = React.useState(false);
    const actividad = React.useRef(Date.now());
    const ocultaDesde = React.useRef<number | null>(null);
    const [version, setVersion] = React.useState(0);

    React.useEffect(() => {
        const releer = () => setVersion((v) => v + 1);
        const almacen = (e: StorageEvent) => { if (e.key === CLAVE_BLOQUEO) releer(); };
        window.addEventListener(EVENTO_CONFIG_BLOQUEO, releer);
        window.addEventListener("storage", almacen);
        return () => { window.removeEventListener(EVENTO_CONFIG_BLOQUEO, releer); window.removeEventListener("storage", almacen); };
    }, []);

    React.useEffect(() => {
        let c: ConfigBloqueo;
        try { c = leerConfigBloqueo(deviceId()); } catch { return; }
        setCfg(c);
        if (c.metodo === "ninguno") return;
        const evaluar = (recienAbierta: boolean) => {
            const ahora = Date.now();
            if (debeBloquear({ cfg: c, desbloqueadoEn: leerDesbloqueoSesion(), ultimaActividad: actividad.current, ocultaDesde: ocultaDesde.current, ahora, recienAbierta })) {
                marcarDesbloqueoSesion(null);
                setBloqueado(true);
            }
        };
        evaluar(version === 0);
        let ultimo = 0;
        const tocar = () => { const t = Date.now(); if (t - ultimo > 5000) { ultimo = t; actividad.current = t; } };
        const visibilidad = () => {
            if (document.visibilityState === "hidden") ocultaDesde.current = Date.now();
            else { evaluar(false); ocultaDesde.current = null; }
        };
        const aMano = () => { marcarDesbloqueoSesion(null); setBloqueado(true); };
        const reloj = window.setInterval(() => evaluar(false), 15_000);
        window.addEventListener("pointerdown", tocar, { passive: true });
        window.addEventListener("keydown", tocar);
        document.addEventListener("visibilitychange", visibilidad);
        window.addEventListener(EVENTO_BLOQUEAR, aMano);
        return () => {
            window.clearInterval(reloj);
            window.removeEventListener("pointerdown", tocar);
            window.removeEventListener("keydown", tocar);
            document.removeEventListener("visibilitychange", visibilidad);
            window.removeEventListener(EVENTO_BLOQUEAR, aMano);
        };
    }, [version]);

    if (!cfg || cfg.metodo === "ninguno") return null;
    return (
        <AnimatePresence>
            {bloqueado && (
                <PantallaBloqueo key="bloqueo" cfg={cfg}
                    onDesbloqueado={() => { const t = Date.now(); marcarDesbloqueoSesion(t); actividad.current = t; setBloqueado(false); }} />
            )}
        </AnimatePresence>
    );
}

export default BloqueoMontaje;
