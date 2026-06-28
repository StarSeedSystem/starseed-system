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
                    Gestiona ventanas y pestañas de la red: previsualiza las páginas dentro del
                    sistema (iframe con estado de carga real y diálogo «Abrir con…» cuando un sitio
                    bloquea el embebido), ábrelas como vista COMPLETA dentro de la OS —con pestañas,
                    vistas divididas y Ajustes embebidos, sin perder los menús ni el dock—, como
                    widget flotante, multivista o inmersivo VR/AR, y adjúntalas a una pizarra o
                    publicación. La página de inicio es configurable (por defecto StarSeed Nexus) y
                    puedes elegir entre internet abierto o limitar la navegación a servidores
                    internos de StarSeed. Configura los servidores del navegador (personal · StarSeed
                    · externo) para proxy/render, y tu VPN, DNS, cookies, caché e historial.
                    Astraura/Aurora pueden conducir la navegación real vía Claude-in-Chrome.
                </p>
                <BrowserWindows />
            </div>
        </main>
    );
}
