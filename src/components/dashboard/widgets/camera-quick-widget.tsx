"use client";

// ════════════════════════════════════════════════════════════════
// CameraQuickWidget — acceso rápido a la Cámara del OS.
// ════════════════════════════════════════════════════════════════

import Link from "next/link";
import { Camera as CameraIcon, Images } from "lucide-react";
import { WidgetShell } from "../kit";

export function CameraQuickWidget() {
    return (
        <WidgetShell
            title="Cámara"
            subtitle="Foto y vídeo"
            icon={CameraIcon}
            accent="#fb7185"
            expandHref="/camara"
            connections={[{ label: "Galería", href: "/galeria", color: "#f472b6", icon: Images }]}
        >
            {() => (
                <Link
                    href="/camara"
                    className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-rose-400/25 bg-rose-500/10 transition-colors hover:bg-rose-500/15"
                >
                    <span className="grid size-12 place-items-center rounded-2xl border border-rose-400/30 bg-rose-500/15">
                        <CameraIcon className="size-6 text-rose-300" strokeWidth={1.75} />
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider text-rose-200">Abrir Cámara</span>
                </Link>
            )}
        </WidgetShell>
    );
}

export default CameraQuickWidget;
