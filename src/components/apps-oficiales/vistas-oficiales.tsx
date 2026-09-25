"use client";

/**
 * Audiomorphic y Omnifrecuencias tal como se abren en el OS: la versión oficial en línea
 * (AppOficial) con el port antiguo disponible como «versión integrada».
 *
 * Un solo sitio para las tres superficies que las abren (la ruta de cada app, las
 * ventanas del escritorio y la ventana flotante de Omnifrecuencias), para que todas
 * enseñen lo mismo. Los ports se cargan en diferido: su código solo baja si alguien
 * elige la versión integrada.
 */

import dynamic from "next/dynamic";

import { AppOficial } from "./app-oficial";

function Cargando({ texto }: { texto: string }) {
    return <div className="grid h-full w-full place-items-center bg-black text-xs text-white/60">{texto}</div>;
}

const AudiomorphicIntegrada = dynamic(
    () => import("@/components/dashboard/apps/audiomorphic/audiomorphic-app").then((m) => m.AudiomorphicApp),
    { ssr: false, loading: () => <Cargando texto="Cargando la versión integrada…" /> },
);

const OmnifrecuenciasIntegrada = dynamic(
    () => import("@/components/dashboard/apps/omnifrecuencias/omnifrecuencias-app").then((m) => m.OmnifrecuenciasApp),
    { ssr: false, loading: () => <Cargando texto="Cargando la versión integrada…" /> },
);

export function AudiomorphicOficial() {
    return <AppOficial appId="audiomorphic" integrada={AudiomorphicIntegrada} />;
}

export function OmnifrecuenciasOficial() {
    return <AppOficial appId="omnifrecuencias" integrada={OmnifrecuenciasIntegrada} />;
}
