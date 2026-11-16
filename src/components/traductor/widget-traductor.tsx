import React, { useState, useEffect } from 'react';
import { ArrowRight, Clipboard, Languages } from 'lucide-react';

export interface TraductorSettings {
    from: string;
    to: string;
    size: 'S' | 'M' | 'L';
    withHistory: boolean;
}

export interface WidgetTraductorProps {
    ajustes: TraductorSettings;
    onAjustes?: (patch: Partial<TraductorSettings>) => void;
    servicio: {
        translate(text: string, from: string, to: string): Promise<string>;
    };
}

export function WidgetTraductor({ ajustes, onAjustes, servicio }: WidgetTraductorProps) {
    const [texto, setTexto] = useState('');
    const [resultado, setResultado] = useState<string | null>(null);

    const handleTranslate = async () => {
        try {
            const res = await servicio.translate(texto, ajustes.from, ajustes.to);
            setResultado(res);
            if (ajustes.withHistory) {
                try {
                    const stored = JSON.parse(localStorage.getItem('traductor_history') ?? '[]');
                    const newHist = [...stored, { texto, from: ajustes.from, to: ajustes.to, traduccion: res }];
                    localStorage.setItem('traductor_history', JSON.stringify(newHist));
                } catch {
                    /* ignore */
                }
            }
        } catch {
            setResultado('Error');
        }
    };

    const copy = () => {
        if (!resultado) return;
        navigator.clipboard.writeText(resultado);
    };

    return (
        <div className="p-4 rounded-2xl border border-border/20 bg-muted/5">
            <h3 className="font-semibold mb-2">Traductor</h3>
            <label className="block mb-1 font-medium">Del</label>
            <select
                value={ajustes.from}
                onChange={(e) => onAjustes?.({ from: e.target.value })}
                className="block w-full rounded-md border border-border/20 bg-white p-2 mb-4"
            >
                <option value="es">Español</option>
                <option value="en">Inglés</option>
                <option value="fr">Francés</option>
                <option value="de">Alemán</option>
            </select>
            <label className="block mb-1 font-medium">A</label>
            <select
                value={ajustes.to}
                onChange={(e) => onAjustes?.({ to: e.target.value })}
                className="block w-full rounded-md border border-border/20 bg-white p-2 mb-4"
            >
                <option value="en">Inglés</option>
                <option value="es">Español</option>
                <option value="fr">Francés</option>
                <option value="de">Alemán</option>
            </select>
            <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-border/20 p-2 mb-4"
                placeholder="Escribe aquí"
            />
            <button
                type="button"
                onClick={handleTranslate}
                className="inline-flex items-center gap-2 rounded-lg bg-primary/10 p-2"
            >
                <ArrowRight /> Traducir
            </button>
            {resultado && (
                <div className="mt-4 p-3 bg-primary/5 rounded-md relative">
                    <p>{resultado}</p>
                    <button
                        type="button"
                        onClick={copy}
                        className="absolute top-2 right-2 rounded-full p-1 bg-primary/20"
                    >
                        <Clipboard size={18} />
                    </button>
                </div>
            )}
        </div>
    );
}

export default WidgetTraductor;
