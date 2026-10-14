"use client";

import { Molecula } from '@/lib/protomolecula/tipos';

interface PanelProtomoleculaAutonomoProps {
    moleculaId: string;
}

export function PanelProtomoleculaAutonomo({ moleculaId }: PanelProtomoleculaAutonomoProps) {
    return (
        <div className="w-full max-w-4xl space-y-4 p-4 bg-background rounded-lg border">
            <h2 className="text-lg font-semibold">Panel Autónomo de Protomolécula</h2>
            {moleculaId ? (
                <div className="text-sm text-muted-foreground">
                    ID de la molécula: <code className="bg-muted">{moleculaId}</code>
                </div>
            ) : (
                <p className="text-sm text-muted-foreground">No se proporcionó ID de molécula. Proporcione el ID como parámetro de consulta 'molecula'.</p>
            )}
            <div className="h-96 bg-muted rounded-lg flex items-center justify-center text-muted-foreground">
                Aquí irían los controles autónomos de la protomolécula (parámetros, dictado, etc.)
            </div>
        </div>
    );
}

export default PanelProtomoleculaAutonomo;