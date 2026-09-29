'use client';
/**
 * El tiempo · cristal (WEATHER_BASIC, estilo «cristal» elegido en Ajustes → Apariencia → Clima).
 * Mismos datos reales y mismo diseño por tamaño que el tiempo clásico (`CuerpoClima`); el
 * estilo solo cambia la capa decorativa del cielo: facetas de cristal sobre el cielo real.
 */
import * as React from 'react';
import { CuerpoClima } from './weather-basic-widget';

export function WeatherBasicCrystallineWidget() {
    return <CuerpoClima variante="cristal" etiqueta="El tiempo · cristal" />;
}

export default WeatherBasicCrystallineWidget;
