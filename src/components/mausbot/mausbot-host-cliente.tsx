"use client";
import dynamic from "next/dynamic";

// Adaptado de OpenMausBot (Copyright 2026 Milind Soni y colaboradores, Apache-2.0): N/A (implementación original basada en la especificación).
// Carga perezosa del host del Mausbot, fuera del SSR.
const MausbotHost = dynamic(() => import("./mausbot-host"), {
  ssr: false,
});

export function MausbotHostCliente() {
  return <MausbotHost />;
}
