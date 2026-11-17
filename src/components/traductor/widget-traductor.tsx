'use client';

import { useState } from 'react';
import { Languages, Copy, Repeat, Settings2 } from 'lucide-react';
import { WidgetShell } from '../dashboard/kit';

export interface WidgetTraductorAjustes {
    idiomasFijados: [string, string];
    motorPreferido: 'automatico' | 'local';
    tamanoLetra: 'S' | 'M' | 'L';
    historialCorto: boolean;
}

interface WidgetTraductorProps {
    ajustes: WidgetTraductorAjustes;
    onAjustes: (patch: Partial<WidgetTraductorAjustes>) => void;
    servicio: { traducir: (texto: string, de: string, a: string) => Promise<string> };
}

export function WidgetTraductor({ ajustes, onAjustes, servicio }: WidgetTraductorProps) {
    const [texto, setTexto] = useState('');
    const [resultado, setResultado] = useState('');
    const [cargando, setCargando] = useState(false);

    async function traducir() {
        if (!texto) return;
        setCargando(true);
        try {
            const res = await servicio.traducir(texto, ajustes.idiomasFijados[0], ajustes.idiomasFijados[1]);
            setResultado(res);
        } finally {
            setCargando(false);
        }
    }

    function intercambiar() {
        onAjustes({ idiomasFijados: [ajustes.idiomasFijados[1], ajustes.idiomasFijados[0]] });
    }

    function copiar() {
        navigator.clipboard.writeText(resultado);
    }

    return (
        <WidgetShell title="Traductor" icon={Languages} accent="#FFBF00" actions={
            <div className="flex gap-1">
                <button onClick={intercambiar} aria-label="Intercambiar idiomas" className="p-1 rounded-full hover:bg-white/10"><Repeat className="size-4" /></button>
            </div>
        }>
            <div className="flex flex-col gap-2">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>{ajustes.idiomasFijados[0]} → {ajustes.idiomasFijados[1]}</span>
                    <span>Motor: {ajustes.motorPreferido}</span>
                </div>
                <textarea className="w-full h-24 p-2 rounded-lg bg-white/5 border border-white/10" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Texto a traducir..." />
                <button className="bg-primary px-4 py-2 rounded-lg text-white font-bold" onClick={traducir} disabled={cargando}>
                    {cargando ? 'Traduciendo...' : 'Traducir'}
                </button>
                <div className="relative p-2 border border-white/10 rounded-lg min-h-[4rem] text-sm group">
                    {resultado}
                    {resultado && <button onClick={copiar} className="absolute top-1 right-1 p-1 opacity-0 group-hover:opacity-100"><Copy className="size-4" /></button>}
                </div>
            </div>
        </WidgetShell>
    );
}

export default WidgetTraductor;
