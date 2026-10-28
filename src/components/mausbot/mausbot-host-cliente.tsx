/**
 * MausbotHostCliente: cargador dinámico del host para SSR.
 * Adaptado de OpenMausBot (Copyright 2026 Milind Soni y colaboradores, Apache-2.0):
 * src/components/MausbotHostCliente.tsx.
 */
"use client";

import dynamic from "next/dynamic";

const MausbotHost = dynamic(() => import("./mausbot-host").then((mod) => mod.MausbotHost), { ssr: false });

export function MausbotHostCliente() {
  return <MausbotHost />;
}
