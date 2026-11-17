"use client";

/**
 * UNI1115M · el ANFITRIÓN de las ventanas de control: se monta UNA vez en la cáscara de la app y así la ventana
 * flotante sigue ahí cuando la persona cambia de sección. Lo que la abre es `abrirVentanaControl(neurona, nombre)`
 * (el botón del panel, o «Pedir controlarla desde aquí» cuando termina en una sesión abierta). La sesión y el vídeo
 * viven en `usarPantallaRemota`; la ventana (`VentanaControl`) no sabe nada de transporte.
 */

import { useEffect, useSyncExternalStore } from "react";
import { VentanaControl } from "./ventana-control";
import { usarPantallaRemota } from "@/lib/control-remoto/usar-pantalla-remota";
import { palabrasMotivo } from "@/lib/control-remoto/palabras";

interface Abierta {
    neurona: string;
    nombre: string;
}

let abiertas: Abierta[] = [];
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());
const RE_ID = /^[A-Za-z0-9-]{1,100}$/;

/** Abre la ventana flotante de esa neurona (si ya estaba abierta, no hace nada). */
export function abrirVentanaControl(neurona: string, nombre: string): boolean {
    if (!RE_ID.test(neurona)) return false;
    if (abiertas.some((a) => a.neurona === neurona)) return true;
    abiertas = [...abiertas, { neurona, nombre: (nombre || "otra neurona").slice(0, 40) }];
    avisar();
    return true;
}

export function cerrarVentanaControl(neurona: string): void {
    const n = abiertas.filter((a) => a.neurona !== neurona);
    if (n.length === abiertas.length) return;
    abiertas = n;
    avisar();
}

export function ventanasAbiertas(): readonly Abierta[] {
    return abiertas;
}

/** La dirección de la misma ventana en una pestaña propia: parámetro de consulta, no segmento (la interfaz estática de las apps nativas no tiene rutas dinámicas). */
export function direccionPaginaControl(neurona: string, nombre: string): string {
    return `/control-remoto?neurona=${encodeURIComponent(neurona)}&nombre=${encodeURIComponent((nombre || "").slice(0, 40))}`;
}

/** Abre la pestaña propia; si el aparato no deja abrir pestañas, navega en la misma. */
export function abrirPaginaControl(neurona: string, nombre: string): void {
    if (typeof window === "undefined" || !RE_ID.test(neurona)) return;
    const url = direccionPaginaControl(neurona, nombre);
    const w = window.open(url, "_blank");
    if (!w) window.location.assign(url);
}

function useAbiertas(): readonly Abierta[] {
    return useSyncExternalStore(
        (cb) => {
            oyentes.add(cb);
            return () => void oyentes.delete(cb);
        },
        () => abiertas,
        () => abiertas,
    );
}

/** Una ventana de control con su sesión. En modo página llena su contenedor; en flotante va sobre la app. */
export function VentanaRemota({ neurona, nombre, modo, alCerrada }: { neurona: string; nombre: string; modo: "flotante" | "pagina"; alCerrada?: () => void }) {
    const p = usarPantallaRemota(neurona);
    return (
        <VentanaControl
            nombre={nombre}
            modo={modo}
            estado={p.estado}
            motivo={palabrasMotivo(p.motivo)}
            flujo={p.flujo}
            pantalla={p.pantalla}
            nivel={p.nivel}
            capacidades={p.capacidades}
            aparato={p.aparato}
            latenciaMs={p.latenciaMs}
            fps={p.fps}
            caduca={p.caduca}
            alReabrir={p.reintentar}
            alEnviar={(e) => void p.enviar(e)}
            alCerrar={() => {
                p.cerrar();
                alCerrada?.();
            }}
        />
    );
}

export function AnfitrionControl() {
    const lista = useAbiertas();
    useEffect(() => {
        // Una ventana abierta desde otro sitio de la app (sin importar este módulo) llega por evento.
        const f = (e: Event) => {
            const d = (e as CustomEvent<{ neurona?: string; nombre?: string }>).detail;
            if (d && typeof d.neurona === "string") abrirVentanaControl(d.neurona, typeof d.nombre === "string" ? d.nombre : "");
        };
        window.addEventListener("starseed:control-ventana-abrir", f);
        return () => window.removeEventListener("starseed:control-ventana-abrir", f);
    }, []);
    return (
        <>
            {lista.map((a) => (
                <VentanaRemota key={a.neurona} neurona={a.neurona} nombre={a.nombre} modo="flotante" alCerrada={() => cerrarVentanaControl(a.neurona)} />
            ))}
        </>
    );
}

export default AnfitrionControl;
