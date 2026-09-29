'use client';
/**
 * El tiempo · aurora (WEATHER_BASIC, estilo «aurora» elegido en Ajustes → Apariencia → Clima).
 * Mismos datos reales y mismo diseño por tamaño que el tiempo clásico (`CuerpoClima`); el
 * estilo solo cambia la capa decorativa del cielo: cortinas de aurora que ondean sobre el cielo real (y más vivas de noche).
 */
import * as React from 'react';
import { CuerpoClima } from './weather-basic-widget';

export function WeatherBasicAuroraWidget() {
    return <CuerpoClima variante="aurora" etiqueta="El tiempo · aurora" />;
}

export default WeatherBasicAuroraWidget;
