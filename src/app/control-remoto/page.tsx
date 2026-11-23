"use client";

/**
 * UNI1115M · la ventana de control en una pestaña propia: `/control-remoto?neurona=<id>&nombre=<nombre>`.
 * Parámetros de consulta y no segmento dinámico, para que funcione en la interfaz estática que sirven las apps nativas.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { VentanaRemota } from "@/components/control-remoto/anfitrion-control";

const RE_ID = /^[A-Za-z0-9-]{1,100}$/;

export default function PaginaControlRemoto() {
    const router = useRouter();
    const [datos, setDatos] = useState<{ neurona: string; nombre: string } | null | undefined>(undefined);
    const [cerrada, setCerrada] = useState(false);
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
    if (cerrada) {
        return (
            <main className="flex min-h-dvh items-center justify-center bg-black p-6 text-white">
                <section
                    data-testid="control-remoto-pagina-cerrada"
                    className="w-full max-w-md space-y-4 rounded-2xl border border-white/15 bg-[#0b0f1a] p-6 text-center shadow-2xl"
                >
                    <h1 className="text-base font-semibold">Sesión de control terminada</h1>
                    <p className="text-sm text-white/70">
                        Se cerró el control hacia {datos.nombre}. El permiso entre neuronas sigue activo.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2 pt-2">
                        <button
                            type="button"
                            onClick={() => setCerrada(false)}
                            className="min-h-10 cursor-pointer rounded-lg bg-emerald-600/80 px-4 text-sm font-medium text-white hover:bg-emerald-600"
                        >
                            Reconectar
                        </button>
                        <button
                            type="button"
                            onClick={() => router.push("/signals")}
                            className="min-h-10 cursor-pointer rounded-lg border border-white/20 bg-white/10 px-4 text-sm font-medium text-white hover:bg-white/20"
                        >
                            Volver a Señales
                        </button>
                    </div>
                </section>
            </main>
        );
    }
    return (
        <main className="h-dvh w-screen bg-black">
            <VentanaRemota
                neurona={datos.neurona}
                nombre={datos.nombre}
                modo="pagina"
                alCerrada={() => {
                    setCerrada(true);
                    try {
                        window.close();
                    } catch {
                        /* pestaña principal */
                    }
                }}
            />
        </main>
    );
}
