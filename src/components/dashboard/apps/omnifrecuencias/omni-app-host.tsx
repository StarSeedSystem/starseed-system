'use client';

// ════════════════════════════════════════════════════════════════
// OmniAppHost — abre la app Omnifrecuencias en una ventana del OS
// ----------------------------------------------------------------
// Escucha 'starseed:open-omnifrecuencias' (lo emite el widget compacto
// y cualquier "Abrir app completa") y monta OmnifrecuenciasApp dentro de
// una OSWindow centrada. Montado una vez en el RootLayout.
// ════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Waves } from "lucide-react";
import { OSWindow } from "../os-window";
import { OmnifrecuenciasApp } from "./omnifrecuencias-app";

export function OmniAppHost() {
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);
    useEffect(() => {
        const onOpen = () => setOpen(true);
        window.addEventListener("starseed:open-omnifrecuencias", onOpen);
        return () => window.removeEventListener("starseed:open-omnifrecuencias", onOpen);
    }, []);

    if (!mounted || !open) return null;

    return createPortal(
        <OSWindow
            title="Omnifrecuencias"
            subtitle="Estudio de frecuencias"
            icon={Waves}
            accent="#22D3EE"
            onClose={() => setOpen(false)}
        >
            <div className="absolute inset-0 overflow-hidden">
                <OmnifrecuenciasApp />
            </div>
        </OSWindow>,
        document.body
    );
}
