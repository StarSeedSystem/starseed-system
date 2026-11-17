'use client';

import { useMemo } from 'react';
import { WidgetTraductor } from '@/components/traductor/widget-traductor';
import type { DashboardWidget } from '@/components/dashboard/dashboard-types';
import type { WidgetTraductorAjustes } from '@/components/traductor/widget-traductor';

const AJUSTES_POR_DEFECTO: WidgetTraductorAjustes = {
    idiomasFijados: ['es', 'en'],
    motorPreferido: 'automatico',
    tamanoLetra: 'M',
    historialCorto: true,
};

export function TraductorWidget({ widget, onUpdateSettings }: { widget?: DashboardWidget; onUpdateSettings?: (patch: Record<string, any>) => void }) {
    const ajustes: WidgetTraductorAjustes = useMemo(() => {
        const s = widget?.settings ?? {};
        return {
            idiomasFijados: (s.idiomasFijados as [string, string] | undefined) ?? AJUSTES_POR_DEFECTO.idiomasFijados,
            motorPreferido: (s.motorPreferido as 'automatico' | 'local' | undefined) ?? AJUSTES_POR_DEFECTO.motorPreferido,
            tamanoLetra: (s.tamanoLetra as 'S' | 'M' | 'L' | undefined) ?? AJUSTES_POR_DEFECTO.tamanoLetra,
            historialCorto: (s.historialCorto as boolean | undefined) ?? AJUSTES_POR_DEFECTO.historialCorto,
        };
    }, [widget?.settings]);

    const onAjustes = (patch: Partial<WidgetTraductorAjustes>) => {
        onUpdateSettings?.(patch);
    };

    const servicio = useMemo(() => ({
        traducir: async (texto: string, de: string, a: string) => {
            return texto;
        },
    }), []);

    return <WidgetTraductor ajustes={ajustes} onAjustes={onAjustes} servicio={servicio} />;
}
