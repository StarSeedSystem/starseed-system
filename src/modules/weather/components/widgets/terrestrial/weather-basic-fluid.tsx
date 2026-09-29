'use client';
/**
 * El tiempo · fluido (WEATHER_BASIC, estilo «fluido» elegido en Ajustes → Apariencia → Clima).
 * Mismos datos reales y mismo diseño por tamaño que el tiempo clásico (`CuerpoClima`); el
 * estilo solo cambia la capa decorativa del cielo: olas líquidas del color del horizonte.
 */
import * as React from 'react';
import { CuerpoClima } from './weather-basic-widget';

export function WeatherBasicFluidWidget() {
    return <CuerpoClima variante="fluido" etiqueta="El tiempo · fluido" />;
}

export default WeatherBasicFluidWidget;
