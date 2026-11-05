'use client';

import { useMemo } from 'react';

interface WidgetRespuestaVivaProps {
    contentId: string;
}

export function WidgetRespuestaViva({ contentId }: WidgetRespuestaVivaProps) {
    const title = useMemo(() => `Contenido: ${contentId}`, [contentId]);

    return (
        <div className="p-4 rounded-xl border bg-card text-card-foreground shadow-sm h-full w-full">
            <h3 className="font-semibold">{title}</h3>
            <p className="text-sm text-muted-foreground">Widget de respuesta viva implementado.</p>
        </div>
    );
}
