"use client";

/**
 * UNI1115M · la ventana de control en una pestaña propia: `/control-remoto?neurona=<id>&nombre=<nombre>`.
 * Parámetros de consulta y no segmento dinámico, para que funcione en la interfaz estática que sirven las apps nativas.
 */

import { useEffect, useState } from "react";
import { VentanaRemota } from "@/components/control-remoto/anfitrion-control";

const RE_ID = /^[A-Za-z0-9-]{1,100}$/;

export default function PaginaControlRemoto() {
    const [datos, setDatos] = useState<{ neurona: string; nombre: string } | null | undefined>(undefined);
    useEffect(() => {
        const q = new URLSearchParams(window.location.search);
        const neurona = q.get("neurona") ?? "";
        setDatos(RE_ID.test(neurona) ? { neurona, nombre: (q.get("nombre") || "otra neurona").slice(0, 40) } : null);
    }, []);
    if (datos === undefined) return <main className="min-h-dvh bg-black" />;
    if (datos === null) {
        return (
            <main className="flex min-h-dvh items-center justify-center bg-black p-6 text-center text-sm text-white/80">
                <p>Falta elegir la neurona. Abre esta ventana desde «Control entre mis neuronas», en Permisos de antenas.</p>
            </main>
        );
    }
    return (
        <main className="h-dvh w-screen bg-black">
            <VentanaRemota neurona={datos.neurona} nombre={datos.nombre} modo="pagina" />
        </main>
    );
}
