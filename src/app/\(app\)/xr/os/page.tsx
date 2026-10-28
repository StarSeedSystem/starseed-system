"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { BotonEntradaXR } from "@/components/xr/shell/boton-entrada-xr";
import { modoXRDe } from "@/lib/vivo/xr";
import type { ModoXR } from "@/lib/xr/tipos";
import type { PlanEntrada } from "@/lib/xr/capacidades";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export interface ModoSesion {
  modo: ModoXR;
  requiereGesto: boolean;
}

export function debeAutoEntrar({
  modo,
  plan,
  yaIntentado,
}: {
  modo: ModoXR | null;
  plan: PlanEntrada;
  yaIntentado: boolean;
}): ModoSesion | null {
  if (yaIntentado) return null;
  if (!modo) return null;
  const inmersivo = modo === "vr-inmersivo" || modo === "ar-passthrough" || modo === "ar-mano";
  if (!inmersivo) return null;
  if (plan.estrategia === "auto-al-abrir" || plan.estrategia === "oferta-navegador") {
    return { modo, requiereGesto: plan.requiereGesto };
  }
  return null;
}

const EscenaOS = dynamic(() => import("@/components/xr/shell/escena-os").then((m) => m.EscenaOS), {
  ssr: false,
});

export default function PageXROs({ searchParams }: { searchParams: Promise<{ modo?: string }> }) {
  const params = await searchParams;
  const modoUrl = modoXRDe(params.modo ?? null);
  const modoInicial: ModoXR | "auto" = modoUrl === "vr" ? "vr-inmersivo" : modoUrl === "ar" ? "ar-passthrough" : "auto";

  return (
    <div className="fixed inset-0 flex flex-col" data-testid="xr-os-page">
      <div className="flex items-center justify-between p-4 z-10" data-testid="barra-superior">
        <h1 className="text-lg font-semibold text-[#F5F7FF]">StarSeed OS · XR</h1>
        <Link
          href="/dashboard"
          className="cursor-pointer text-sm text-[#B9C0D8] hover:text-[#F5F7FF] underline underline-offset-2"
          data-testid="enlace-salir"
        >
          Salir al sistema
        </Link>
      </div>
      <div className="flex-1 relative" data-testid="contenedor-escena">
        <EscenaOS modoInicial={modoInicial} />
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20" data-testid="entrada-xr">
          <BotonEntradaXR modo={modoInicial} variante="insertado" />
        </div>
      </div>
    </div>
  );
}