"use client";

import { Suspense } from "react";
import nextDynamic from "next/dynamic";
import Link from "next/link";

import { BotonEntradaXR } from "@/components/xr/shell/boton-entrada-xr";

export const maxDuration = 60;

export const metadata = {
  title: "StarSeed OS · XR OS",
};

const ESCENA_OS_PATH = "@/components/xr/shell/escena-os";
const EscenaOS = nextDynamic<{ modoInicial: string }>(
  () => import(ESCENA_OS_PATH).then((m) => m.EscenaOS),
  { ssr: false },
);

function mapModo(v: string | undefined): string {
  if (v === "vr") return "vr-inmersivo";
  if (v === "ar") return "ar-passthrough";
  if (v === "pantalla") return "3d-pantalla";
  return "auto";
}

export function debeAutoEntrar({
  modo,
  plan,
  yaIntentado,
}: {
  modo: string | null;
  plan: { estrategia: string; modo: string };
  yaIntentado: boolean;
}) {
  if (yaIntentado) return null;
  if (!modo) return null;
  const { estrategia } = plan;
  if (estrategia === "auto-al-abrir" || estrategia === "oferta-navegador") {
    if (modo === "vr-inmersivo" || modo === "ar-passthrough") {
      return { modo, requiereGesto: false };
    }
  }
  return null;
}

export default function Page({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const modoInicial = mapModo(searchParams.modo);

  return (
    <>
      <Suspense fallback={<div className="absolute inset-0 bg-[#05060f]" />}>
        <EscenaOS modoInicial={modoInicial} />
      </Suspense>
      <BotonEntradaXR variante="insertado" />
      <Link
        href="/dashboard"
        className="fixed bottom-4 left-4 z-50 text-sm font-medium text-amber-300 hover:text-amber-100 underline"
        data-testid="enlace-salir"
      >
        Salir al sistema
      </Link>
    </>
  );
}