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
                    Gestiona ventanas y pestañas de la red: agrúpalas en grupos y carpetas,
                    suspéndelas para liberar recursos, ábrelas en modo widget, multivista o
                    pantalla completa, y compártelas o adjúntalas a la pizarra. Astraura/Aurora
                    pueden conducir la navegación real vía Claude-in-Chrome.
                </p>
                <BrowserWindows />
            </div>
        </main>
    );
}
