"use client";

import { useState } from 'react';
import { CopyCheck, Spring, ArrowLeftRight } from 'lucide-react';
import { WidgetShell } from '@/components/dashboard/kit/widget-shell';
import { cn } from '@/lib/utils';

export type ServicioTraductor = (texto: string) => string;

export interface Ajustes {
    idiomaOrigen: string;
    idiomaDestino: string;
    motor: 'automático' | 'soloEnMiAparato';
    tamanoLetra: 'S' | 'M' | 'L';
    historialCorto: boolean;
}

export interface PropsWidgetTraductor {
    ajustes: Ajustes;
    onAjustes: (patch: Partial<Ajustes>) => void;
    servicio: ServicioTraductor;
}

const tamanoToClase: Record<Ajustes['tamanoLetra'], string> = {
    S: 'text-sm',
    M: 'text-base',
    L: 'text-lg',
};

function guardarHistorial(texto: string, resultado: string) {
    try {
        const data = localStorage.getItem('traductor_historial');
        const historial = data ? JSON.parse(data) : [];
        historial.push({ texto, resultado, fecha: new Date().toISOString() });
        localStorage.setItem('traductor_historial', JSON.stringify(historial));
    } catch {
        // ignore storage errors in tests
    }
}

export function WidgetTraductor({ ajustes, onAjustes, servicio }: PropsWidgetTraductor) {
    const [texto, setTexto] = useState('');
    const [resultado, setResultado] = useState<string | null>(null);
    const [cargando, setCargando] = useState(false);

    const handleTexto = (e: React.ChangeEvent<HTMLTextAreaElement>) => setTexto(e.target.value);

    const handleTraducir = () => {
        setCargando(true);
        const traduccion = servicio(texto);
        setResultado(traduccion);
        if (ajustes.historialCorto) {
            guardarHistorial(texto, traduccion);
        }
        setCargando(false);
    };

    const handleCopiar = () => {
        if (!resultado) return;
        navigator.clipboard.writeText(resultado);
    };

    const tamanoClase = tamanoToClase[ajustes.tamanoLetra];

    return (
        <WidgetShell
            title="Traductor"
            subtitle={`${ajustes.idiomaOrigen.toUpperCase()} → ${ajustes.idiomaDestino.toUpperCase()}`}
            icon={CopyCheck}
            accent="#FFBF00"
            live
        >
            <div className="h-full flex flex-col gap-4 p-3">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Idioma origen</span>
                    <span className="text-sm font-medium">{ajustes.idiomaOrigen.toUpperCase()}</span>
                    <ArrowLeftRight className="size-3" aria-hidden/>
                    <span className="text-sm font-medium">{ajustes.idiomaDestino.toUpperCase()}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Idioma destino</span>
                </div>

                <textarea
                    value={texto}
                    onChange={handleTexto}
                    placeholder="Escribe el texto que quieres traducir…"
                    rows={4}
                    className={cn('flex-1 rounded-xl border border-border/30 bg-white/[0.02] px-3 py-2 text-base', tamanoClase, 'cursor-text')}
                />

                <div className="flex gap-2">
                    <button
                        onClick={handleTraducir}
                        disabled={cargando}
                        className={cn('flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-2 font-medium transition-colors hover:bg-primary/20 cursor-pointer', { 'opacity-50 cursor-not-allowed': cargando })}
                    >
                        {cargando ? 'Traduciendo…' : 'Traducir'}
                    </button>
                    <button
                        onClick={handleCopiar}
                        className="flex items-center gap-2 rounded-lg bg-amber/10 px-4 py-2 font-medium transition-colors hover:bg-amber/20 cursor-pointer"
                        aria-label="Copiar resultado"
                    >
                        <CopyCheck className="size-3.5" aria-hidden/>
                        Copiar
                    </button>
                </div>

                {resultado && (
                    <div className={cn('mt-4 rounded-xl border border-border/30 bg-white/[0.02] p-3 break-words', tamanoClase)}>
                        {resultado}
                    </div>
                )}

                <div className="mt-2 text-[10px] font-semibold tracking-wider text-muted-foreground">Motor usado: <span className="font-medium">{ajustes.motor}</span></div>

                <div className="mt-2 text-[10px] font-semibold tracking-wider text-muted-foreground">Historial corto: <span className="font-medium">{ajustes.historialCorto ? 'Sí' : 'No'}</span></div>
            </div>
        </WidgetShell>
    );
}

export default WidgetTraductor;