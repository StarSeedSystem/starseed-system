'use client';

// El "Cerebro" (antes "Gráfica Viva") se trasladó al Exocórtex / Astraura AI.
// Esta ruta ahora redirige a /agent (pestaña Cerebro) para no romper enlaces
// antiguos del dashboard, onboarding, Trinity y widgets.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Brain } from 'lucide-react';

export default function GraphRedirectPage() {
    const router = useRouter();

    useEffect(() => {
        const t = setTimeout(() => router.replace('/agent?tab=cerebro'), 200);
        return () => clearTimeout(t);
    }, [router]);

    return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center animate-in fade-in duration-500">
            <Brain className="h-10 w-10 animate-pulse text-purple-400" />
            <div>
                <h2 className="text-lg font-bold">El Cerebro vive ahora en tu Exocórtex</h2>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    La visualización 3D de tu memoria se trasladó al Astraura AI. Te estamos llevando allí…
                </p>
            </div>
            <Link
                href="/agent?tab=cerebro"
                className="cursor-pointer rounded-full border border-purple-500/40 bg-purple-500/10 px-4 py-2 text-sm font-medium text-purple-200 transition-colors hover:bg-purple-500/20"
            >
                Ir al Exocórtex →
            </Link>
        </div>
    );
}
