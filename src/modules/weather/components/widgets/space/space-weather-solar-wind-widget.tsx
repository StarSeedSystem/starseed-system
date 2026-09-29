'use client';
/**
 * Viento solar (variante heredada, sin registro propio) — Ola 0929 · paquete A.
 * Antes dibujaba cifras fijas cuando no le pasaban datos; ahora es el mismo widget real que
 * WEATHER_SPACE_SOLAR (NOAA SWPC, caché compartida). Las props se conservan y se ignoran.
 */
import * as React from 'react';
import type { UnifiedSpaceWeather } from '@/modules/weather/services/space/schema';
import { SpaceEnergySolarWidget } from '../solar/space-energy-solar-widget';

interface SolarWindWidgetProps {
    /** Heredado: ya no se usa. */
    data?: UnifiedSpaceWeather;
    loading?: boolean;
}

export const SolarWindWidget: React.FC<SolarWindWidgetProps> = () => <SpaceEnergySolarWidget />;

export default SolarWindWidget;
