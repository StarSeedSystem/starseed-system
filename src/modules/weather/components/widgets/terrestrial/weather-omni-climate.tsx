'use client';
/**
 * El tiempo · omni (WEATHER_BASIC, estilo «omni» elegido en Ajustes → Apariencia → Clima).
 * Mismos datos reales y mismo diseño por tamaño que el tiempo clásico (`CuerpoClima`); el
 * estilo solo cambia la capa decorativa del cielo: meridianos de globo y, desde «m», las capas (viento, humedad, UV y aire) en vez de solo horas.
 */
import * as React from 'react';
import { CuerpoClima } from './weather-basic-widget';

export function WeatherOmniClimateWidget() {
    return <CuerpoClima variante="omni" etiqueta="El tiempo · omni" />;
}

export default WeatherOmniClimateWidget;
