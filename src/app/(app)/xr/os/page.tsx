"use client";

import NextDynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { modoXRDe } from "@/lib/vivo/xr";
import type { ModoXR } from "@/lib/xr/tipos";
import { BotonEntradaXR } from "@/components/xr/shell/boton-entrada-xr";

export type ModoSesion = "vr-inmersivo" | "ar-passthrough" | "3d-pantalla";

export function debeAutoEntrar({
    modo,
    plan,
    yaIntentado,
}: {
    modo: ModoSesion | null;
    plan: { estrategia: string; modo: ModoXR };
    yaIntentado: boolean;
}): ModoSesion | null {
    if (yaIntentado) return null;
    if (!modo) return null;
    const inmersivos: ModoSesion[] = ["vr-inmersivo", "ar-passthrough"];
    if (!inmersivos.includes(modo)) return null;
    const modosPlanInmersivos: ModoXR[] = ["vr-inmersivo", "ar-passthrough", "ar-mano"];
    if (!modosPlanInmersivos.includes(plan.modo)) return null;
    if (plan.modo !== modo) return null;
    if (plan.estrategia !== "auto-al-abrir" && plan.estrategia !== "oferta-navegador") return null;
    return modo;
}

const EscenaOS = NextDynamic(() => import("@/components/xr/shell/escena-os").then((m) => m.EscenaOS), {
    ssr: false,
    loading: () => null,
});

export const dynamic = "force-dynamic";

export default function PaginaXROS() {
    const searchParams = useSearchParams();
    const modoUrl = modoXRDe(searchParams.get("modo"));

    const modoSesion: ModoSesion | null =
        modoUrl === "vr"
            ? "vr-inmersivo"
            : modoUrl === "ar"
            ? "ar-passthrough"
            : modoUrl === "pantalla"
            ? "3d-pantalla"
            : null;

    return (
        <div className="relative w-full h-screen overflow-hidden" data-testid="pagina-xr-os">
            <EscenaOS modo={modoSesion} />
            <div className="fixed inset-0 z-10 pointer-events-none" data-testid="overlay-2d">
                <div className="absolute top-4 left-4 pointer-events-auto" data-testid="salir-sistema">
                    <Link
                        href="/dashboard"
                        className="cursor-pointer inline-flex h-10 items-center gap-2 rounded-full bg-[#0E101E]/90 px-4 text-sm font-medium text-[#F5F7FF] border border-white/15 shadow transition hover:bg-[#0E101E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]/70"
                        data-testid="enlace-salir"
                    >
                        Salir al sistema
                    </Link>
                </div>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-auto" data-testid="entrada-insertada">
                    <BotonEntradaXR modo={modoSesion ?? "auto"} variante="insertado" />
                </div>
            </div>
        </div>
    );
}