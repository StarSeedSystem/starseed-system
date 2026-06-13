"use client";

/*
 * Ajustes → Perfil → "Sincronizar con mi cuenta StarSeed".
 * Sube/baja las preferencias (apariencia, dock, Trinity, memoria) a la cuenta
 * soberana compartida por todo el ecosistema. Opt-in y tolerante a fallos:
 * si no hay sesión o falta la tabla, lo dice sin romper nada.
 * SOP: architecture/integracion-portal-starseed-os.md · "Sincronización de preferencias".
 */

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { CloudUpload, CloudDownload, RefreshCw, ShieldCheck, CircleSlash } from "lucide-react";
import { cn } from "@/lib/utils";
import { hasStarseedSession, pushPreferences, pullPreferences, SYNCED_KEYS } from "@/lib/settings-sync";

export function AccountSyncPanel() {
    const [session, setSession] = useState<boolean | null>(null);
    const [busy, setBusy] = useState<"push" | "pull" | null>(null);

    useEffect(() => { hasStarseedSession().then(setSession); }, []);

    const onPush = async () => {
        setBusy("push");
        const r = await pushPreferences();
        setBusy(null);
        r.ok ? toast.success(r.message) : toast.error(r.message);
    };

    const onPull = async () => {
        setBusy("pull");
        const r = await pullPreferences();
        setBusy(null);
        if (r.ok) {
            toast.success(r.message, { description: "Recargando para aplicar tus ajustes…" });
            setTimeout(() => window.location.reload(), 900);
        } else {
            toast.error(r.message);
        }
    };

    return (
        <Card className="bg-background/40 backdrop-blur-sm border-0 shadow-none">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <RefreshCw className="w-5 h-5 text-primary" />
                    Sincronizar con mi cuenta StarSeed
                </CardTitle>
                <CardDescription>
                    Tu identidad soberana es la misma en Nexus, Café y StarSeed OS. Lleva tu
                    apariencia, dock, gestos Trinity y memoria del Exocórtex a la cuenta para
                    recuperarlos en cualquier dispositivo. Tus datos solo te pertenecen a ti.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className={cn(
                    "flex items-center gap-2.5 p-3 rounded-xl border text-xs",
                    session === false ? "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300"
                        : "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
                )}>
                    {session === false ? <CircleSlash className="w-4 h-4 shrink-0" /> : <ShieldCheck className="w-4 h-4 shrink-0" />}
                    <span>
                        {session === null ? "Comprobando tu sesión…"
                            : session ? "Sesión StarSeed activa: la sincronización está disponible."
                                : "Sin sesión activa. Inicia sesión para sincronizar; mientras tanto tus ajustes se guardan en este dispositivo."}
                    </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                        type="button"
                        disabled={busy !== null || session === false}
                        onClick={onPush}
                        className={cn(
                            "flex items-center justify-center gap-2 p-3 rounded-xl border font-medium text-sm transition-all cursor-pointer",
                            "border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary",
                            (busy !== null || session === false) && "opacity-50 cursor-not-allowed"
                        )}
                    >
                        <CloudUpload className={cn("w-4 h-4", busy === "push" && "animate-pulse")} />
                        {busy === "push" ? "Subiendo…" : "Subir mis ajustes a la cuenta"}
                    </button>

                    <button
                        type="button"
                        disabled={busy !== null || session === false}
                        onClick={onPull}
                        className={cn(
                            "flex items-center justify-center gap-2 p-3 rounded-xl border font-medium text-sm transition-all cursor-pointer",
                            "border-border/60 bg-card/40 hover:bg-card/70",
                            (busy !== null || session === false) && "opacity-50 cursor-not-allowed"
                        )}
                    >
                        <CloudDownload className={cn("w-4 h-4", busy === "pull" && "animate-pulse")} />
                        {busy === "pull" ? "Recuperando…" : "Recuperar ajustes de mi cuenta"}
                    </button>
                </div>

                <details className="text-[11px] text-muted-foreground">
                    <summary className="cursor-pointer hover:text-foreground transition-colors">¿Qué se sincroniza?</summary>
                    <ul className="mt-2 grid gap-1 pl-1">
                        <li>· Apariencia completa (tema del sistema, fondos, vidrio, tipografía, Trinity táctil)</li>
                        <li>· OmniDock personalizado y botón Trinity (posición y visibilidad)</li>
                        <li>· Memoria del Exocórtex (intereses y rasgos para la guía con IA)</li>
                        <li className="opacity-60 font-mono">{SYNCED_KEYS.length} claves · cifradas en tránsito · solo tu fila (RLS)</li>
                    </ul>
                </details>
            </CardContent>
        </Card>
    );
}
