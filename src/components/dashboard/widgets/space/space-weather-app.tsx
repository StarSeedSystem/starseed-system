'use client';

// ════════════════════════════════════════════════════════════════
// SpaceWeatherApp — vista «app» del CLIMA ESPACIAL · Ola 0929 · paquete A
// ----------------------------------------------------------------
// Para una ruta o una ventana del OS, más ancha que un widget: el panel
// completo de clima espacial arriba y, alrededor, cada instrumento en su
// tamaño grande — índice Kp con previsión y aurora, viento solar,
// llamaradas, magnetómetro de GOES y la resonancia Schumann (honesta:
// referencia + lo que sí se mide). Son los MISMOS widgets del tablero:
// una sola verdad de datos (NOAA SWPC, caché compartida de ≥ 15 min, solo
// lo que se ve) y los mismos estados honestos — cargando, vacío y error
// con reintento — resueltos por cada instrumento. Sin cifras de relleno.
// La rejilla se adapta sola: una columna en móvil, dos o tres en pantalla.
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import { SpaceWeatherWidget } from "./space-weather-widget";
import { KpIndexWidget } from "@/modules/weather/components/widgets/space/space-weather-kp-index-widget";
import { XRayFlareWidget } from "@/modules/weather/components/widgets/space/space-weather-flare-widget";
import { MagnetometerWidget } from "@/modules/weather/components/widgets/space/space-weather-magnetometer-widget";
import { SpaceEnergySchumannWidget } from "@/modules/weather/components/widgets/space/space-energy-schumann-widget";
import { SpaceEnergySolarWidget } from "@/modules/weather/components/widgets/solar/space-energy-solar-widget";

const INSTRUMENTOS: { id: string; titulo: string; alto: string; ancho?: string; cuerpo: React.ReactNode }[] = [
    { id: "panel", titulo: "Panel de clima espacial", alto: "h-[520px]", ancho: "md:col-span-2 xl:col-span-3", cuerpo: <SpaceWeatherWidget /> },
    { id: "kp", titulo: "Índice Kp", alto: "h-[460px]", cuerpo: <KpIndexWidget /> },
    { id: "viento", titulo: "Viento solar", alto: "h-[460px]", cuerpo: <SpaceEnergySolarWidget /> },
    { id: "llamaradas", titulo: "Llamaradas solares", alto: "h-[460px]", cuerpo: <XRayFlareWidget /> },
    { id: "magnetometro", titulo: "Magnetómetro", alto: "h-[420px]", cuerpo: <MagnetometerWidget /> },
    { id: "schumann", titulo: "Resonancia Schumann", alto: "h-[420px]", ancho: "xl:col-span-2", cuerpo: <SpaceEnergySchumannWidget /> },
];

export function SpaceWeatherApp() {
    return (
        <div className="grid w-full gap-4 p-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Clima espacial">
            {INSTRUMENTOS.map((i) => (
                <section key={i.id} aria-label={i.titulo} className={`${i.alto} ${i.ancho ?? ""} min-w-0`}>
                    {i.cuerpo}
                </section>
            ))}
        </div>
    );
}

export default SpaceWeatherApp;
