"use client";

import BrowserWindows from "@/components/browser/browser-windows";

export default function NavegadorPage() {
    return (
        <main className="min-h-[calc(100vh-2rem)] px-4 py-8 md:px-8">
            <div className="mx-auto max-w-6xl">
                <h1 className="text-2xl font-bold text-amber-50">
                    Navegador · Ventanas de StarSeed
                </h1>
                <p className="mt-1 mb-6 text-sm text-white/50">
                    Gestiona ventanas y pestañas de la red: ábrelas con enlaces funcionales
                    (URLs externas en ventana nueva, rutas internas de la OS y otros sistemas
                    StarSeed), agrúpalas en grupos y carpetas, suspéndelas, y ábrelas en modo
                    widget, multivista, pantalla completa o inmersivo VR/AR. Configura los
                    servidores del navegador (personal · StarSeed · externo) para proxy/render,
                    y tu VPN, DNS, cookies, caché e historial. Astraura/Aurora pueden conducir la
                    navegación real vía Claude-in-Chrome.
                </p>
                <BrowserWindows />
            </div>
        </main>
    );
}
