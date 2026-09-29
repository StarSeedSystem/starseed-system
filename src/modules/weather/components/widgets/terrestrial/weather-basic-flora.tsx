'use client';
/**
 * El tiempo · flora (WEATHER_BASIC, estilo «flora» elegido en Ajustes → Apariencia → Clima).
 * Mismos datos reales y mismo diseño por tamaño que el tiempo clásico (`CuerpoClima`); el
 * estilo solo cambia la capa decorativa del cielo: brotes que se mecen al pie del cielo.
 */
import * as React from 'react';
import { CuerpoClima } from './weather-basic-widget';

export function WeatherBasicFloraWidget() {
    return <CuerpoClima variante="flora" etiqueta="El tiempo · flora" />;
}

export default WeatherBasicFloraWidget;
