'use client';

import { useMemo } from 'react';
import { Languages, MessageCircle, WifiOff, Globe } from 'lucide-react';
import { WidgetShell } from '../kit';
import type { DashboardWidget } from '../dashboard-types';

const ACCENT = '#7c5cff';

function simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

export function TraductorWidget({ widget, onUpdateSettings }: { widget?: DashboardWidget; onUpdateSettings?: (patch: Record<string, any>) => void }) {
    const languages = useMemo(() => [
        { code: 'es', name: 'Español', flag: '🇪🇸' },
        { code: 'en', name: 'English', flag: '🇺🇸' },
        { code: 'fr', name: 'Français', flag: '🇫🇷' },
        { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
        { code: 'it', name: 'Italiano', flag: '🇮🇹' },
        { code: 'pt', name: 'Português', flag: '🇵🇹' },
        { code: 'ja', name: '日本語', flag: '🇯🇵' },
        { code: 'ko', name: '한국어', flag: '🇰🇷' },
        { code: 'zh', name: '中文', flag: '🇨🇳' },
        { code: 'ru', name: 'Русский', flag: '🇷🇺' },
        { code: 'ar', name: 'العربية', flag: '🇸🇦' },
        { code: 'hi', name: 'हिन्दी', flag: '🇮🇳' },
    ], []);

    const sourceLang = widget?.settings?.sourceLang ?? 'detectar';
    const targetLang = widget?.settings?.targetLang ?? 'es';

    const source = languages.find(l => l.code === sourceLang) ?? languages[0];
    const target = languages.find(l => l.code === targetLang) ?? languages[1];

    function persist(patch: Record<string, any>) {
        onUpdateSettings?.(patch);
    }

    function cycleSource() {
        const idx = languages.findIndex(l => l.code === sourceLang);
        const next = languages[(idx + 1) % languages.length];
        persist({ sourceLang: next.code });
    }

    function cycleTarget() {
        const idx = languages.findIndex(l => l.code === targetLang);
        const next = languages[(idx + 1) % languages.length];
        persist({ targetLang: next.code });
    }

    return (
        <WidgetShell
            title="Traductor"
            subtitle={sourceLang === 'detectar' ? 'Detectar idioma' : undefined}
            icon={Languages}
            accent={ACCENT}
            actions={
                <div className="flex items-center gap-1">
                    <button type="button" onClick={cycleSource} title="Idioma origen" className="grid place-items-center size-6 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer">
                        <Globe className="size-3.5" />
                    </button>
                    <button type="button" onClick={cycleTarget} title="Idioma destino" className="grid place-items-center size-6 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer">
                        <MessageCircle className="size-3.5" />
                    </button>
                </div>
            }
        >
            {(size) => {
                const micro = size.tier === 'micro' || size.vTier === 'micro';
                return (
                    <div className="h-full flex flex-col items-center justify-center gap-2 text-center p-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-white/80">
                            <span className="text-lg">{source.flag}</span>
                            <span className="flex-1 truncate text-left">{source.name}</span>
                            <Languages className="size-4 text-white/40" />
                            <span className="flex-1 truncate text-right">{target.name}</span>
                            <span className="text-lg">{target.flag}</span>
                        </div>
                        {!micro && (
                            <p className="text-[11px] text-white/50">
                                Escribe en la app completa para traducir textos, conversaciones o usar paquetes offline.
                            </p>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}

export default TraductorWidget;