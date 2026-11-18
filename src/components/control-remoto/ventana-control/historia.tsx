"use client";

/** VEN1115L · página de prueba de la ventana de control: un lienzo hace de pantalla del aparato y se ve lo que sale por `alEnviar`. */
import { useEffect, useMemo, useState } from "react";
import { VentanaControl } from "./ventana-control";
import type { EntradaControl, PropsVentanaControl } from "./tipos";

function crearFlujo(ancho: number, alto: number): MediaStream | null {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = ancho;
    c.height = alto;
    const x = c.getContext("2d");
    if (!x || typeof c.captureStream !== "function") return null;
    let n = 0;
    const pintar = () => {
        n += 1;
        const g = x.createLinearGradient(0, 0, ancho, alto);
        g.addColorStop(0, "#1b2a6b");
        g.addColorStop(1, "#7a1fa2");
        x.fillStyle = g;
        x.fillRect(0, 0, ancho, alto);
        x.fillStyle = "#fff";
        x.font = `${Math.round(alto / 14)}px sans-serif`;
        x.fillText("Pantalla de prueba", 24, alto / 10);
        x.fillStyle = "#ff6b81";
        x.fillRect(0, 0, 40, 40); // esquina superior izquierda del cuadro
        x.fillStyle = "#fff";
        x.fillRect(24 + (n % 200), alto / 2, 60, 60);
        x.strokeStyle = "#fff";
        x.strokeRect(2, 2, ancho - 4, alto - 4);
    };
    pintar();
    const t = setInterval(pintar, 100);
    const s = c.captureStream(10);
    s.getTracks()[0]?.addEventListener("ended", () => clearInterval(t));
    return s;
}

export function HistoriaVentanaControl({ modo = "flotante", nivel = "controlar" as "ver" | "controlar", giro = 0 as 0 | 90 | 180 | 270 }: { modo?: "flotante" | "pagina"; nivel?: "ver" | "controlar"; giro?: 0 | 90 | 180 | 270 }) {
    const [enviado, setEnviado] = useState<EntradaControl[]>([]);
    const [cerrada, setCerrada] = useState(false);
    const flujo = useMemo(() => crearFlujo(1200, 2000), []);
    useEffect(() => () => flujo?.getTracks().forEach((t) => t.stop()), [flujo]);
    const p: PropsVentanaControl = {
        nombre: "Neurona de Alex",
        modo,
        estado: cerrada ? "cerrada" : "en-vivo",
        flujo,
        pantalla: { ancho: 1200, alto: 2000, giro },
        nivel,
        capacidades: { gestos: true, maxDedos: 10, teclas: ["atras", "inicio", "recientes", "notificaciones", "ajustes-rapidos", "bloquear", "captura", "menu-energia"], volumen: true, brillo: true, texto: true },
        aparato: { volumen: { multimedia: 0.4, llamada: 0.7, timbre: 0.8, alarma: 0.5 }, brillo: 0.6, bateria: 0.87, cargando: false, red: { wifi: true, datos: false, bluetooth: true } },
        latenciaMs: 42,
        fps: 30,
        alEnviar: (e) => setEnviado((l) => [...l.slice(-40), e]),
        alCerrar: () => setCerrada(true),
    };
    return (
        <div className="min-h-screen bg-[#05070d] p-4 text-white">
            <p className="text-xs text-white/60">Página de prueba de la ventana de control (sin sesión real).</p>
            <pre data-testid="registro-enviado" className="mt-2 max-h-24 overflow-auto text-[10px] text-white/50">
                {enviado.map((e) => JSON.stringify(e)).join("\n")}
            </pre>
            {modo === "pagina" ? <div className="mt-2 h-[calc(100vh-9rem)]"><VentanaControl {...p} /></div> : <VentanaControl {...p} />}
        </div>
    );
}
