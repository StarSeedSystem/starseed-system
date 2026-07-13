"use client";

/*
 * LibraryBrainsPopover — "Cerebros de contexto" (SOP §12). Popover en el
 * header de /library, junto al selector de entidad de Biblioteca. Lista los
 * cerebros disponibles (src/lib/brains/brains.ts) con checkboxes y modo
 * "todos por defecto" sobre entity_state(profile:<id>,'library-brains').
 *
 * ── BUG CORREGIDO (Adenda 66) ────────────────────────────────────────────
 * Antes: `profileId = ref.kind === 'profile' ? ref.id : null` y
 * `applicable = ref.kind === 'profile'`. Pero el selector de bibliotecas
 * (`myLibraryDestinations()` en entity-library.ts) NUNCA emite `kind:'profile'`:
 * solo emite `user` (Mi biblioteca), `page` y `group`. Resultado: `applicable`
 * era SIEMPRE false y el popover mostraba «elige un perfil en el selector de
 * arriba» — un aviso IMPOSIBLE de satisfacer, porque ese selector no ofrece
 * perfiles.
 *
 * Ahora se resuelve el perfil EFECTIVO igual que lo hace el consumidor real
 * (Aurora/Astraura, `libraryBrainsContextLine()` en src/ai/astraura/context.ts,
 * que lee `getLibraryBrains(activeProfileId())`):
 *   · kind 'profile'  → ese perfil.
 *   · kind 'user'     → MI biblioteca personal = cerebros del PERFIL ACTIVO
 *                       (useActiveProfile), sin pedir nada al usuario.
 *   · page/group/…    → no aplica (los cerebros de contexto son por perfil),
 *                       con un aviso honesto que ya no manda a ningún sitio
 *                       inexistente.
 * Así el popover ESCRIBE en la misma clave que Aurora LEE.
 */

import { useMemo } from "react";
import {
    Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Brain, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLibraryBrains } from "@/lib/library/library-brains";
import { useActiveProfile } from "@/lib/profiles/profiles";
import type { EntityRef } from "@/lib/library/entity-library";

export function LibraryBrainsPopover({ ref }: { ref: EntityRef | null }) {
    // Perfil activo de la cuenta (mismo que usa Aurora vía activeProfileId()).
    const { profile: activeProfile, loading: profilesLoading } = useActiveProfile();

    // ¿Es esta una biblioteca PERSONAL (mía)? `user` = "Mi biblioteca";
    // `profile` = biblioteca de una faceta concreta. En ambos casos los
    // cerebros de contexto se configuran contra un perfil de MI cuenta.
    const isPersonal = ref?.kind === "user" || ref?.kind === "profile";

    const profileId = useMemo(() => {
        if (!ref) return null;
        if (ref.kind === "profile") return ref.id;
        if (ref.kind === "user") return activeProfile?.id ?? null;
        return null;
    }, [ref, activeProfile]);

    const { config, brains, loading, setMode, toggleBrain } = useLibraryBrains(profileId);

    const selectedSet = useMemo(() => new Set(config.brains), [config.brains]);

    // Aplicable = biblioteca personal CON perfil resuelto. Mientras los perfiles
    // cargan no mostramos el aviso (mostramos "Cargando…"), para no acusar en
    // falso a una biblioteca que sí es de perfil.
    const resolvingProfile = isPersonal && !profileId && profilesLoading;
    const noProfilesYet = isPersonal && !profileId && !profilesLoading;
    const applicable = isPersonal && !!profileId;

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-white/10 bg-white/[0.02] text-xs text-muted-foreground hover:bg-white/5 hover:text-white cursor-pointer"
                >
                    <Brain className="h-3.5 w-3.5" /> Cerebros de contexto
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 border-white/10 bg-black/90 backdrop-blur-xl">
                <div className="space-y-3">
                    <div>
                        <p className="text-sm font-semibold flex items-center gap-1.5">
                            <Brain className="h-3.5 w-3.5 text-primary" /> Cerebros de contexto
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                            Qué memorias/cerebros dan contexto a Aurora sobre esta biblioteca.
                        </p>
                        {/* Transparencia: se dice EXACTAMENTE sobre qué perfil se está guardando. */}
                        {applicable && activeProfile && ref?.kind === "user" && (
                            <p className="mt-1 text-[10px] text-primary/80">
                                Perfil activo: <span className="font-semibold">{activeProfile.name}</span>
                            </p>
                        )}
                    </div>

                    {resolvingProfile ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Resolviendo tu perfil…
                        </div>
                    ) : noProfilesYet ? (
                        <p className="text-[11px] text-amber-300/80 rounded-lg border border-amber-400/20 bg-amber-400/5 p-2">
                            Tu cuenta todavía no tiene ningún perfil. Crea uno en Ajustes → Perfiles y sus cerebros de contexto se configurarán aquí.
                        </p>
                    ) : !applicable ? (
                        <p className="text-[11px] text-amber-300/80 rounded-lg border border-amber-400/20 bg-amber-400/5 p-2">
                            Los cerebros de contexto se configuran por perfil. Cambia a «Mi biblioteca» en el selector para ajustar los de tu perfil activo.
                        </p>
                    ) : loading ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
                        </div>
                    ) : (
                        <>
                            <div className="flex gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setMode("all")}
                                    className={cn(
                                        "flex-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition-colors cursor-pointer",
                                        config.mode === "all" ? "border-primary/50 bg-primary/15 text-primary" : "border-white/10 text-muted-foreground hover:bg-white/5",
                                    )}
                                >
                                    Todos por defecto
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMode("selected")}
                                    className={cn(
                                        "flex-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition-colors cursor-pointer",
                                        config.mode === "selected" ? "border-primary/50 bg-primary/15 text-primary" : "border-white/10 text-muted-foreground hover:bg-white/5",
                                    )}
                                >
                                    Seleccionados
                                </button>
                            </div>

                            <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-white/5 bg-black/20 p-2">
                                {brains.length === 0 ? (
                                    <p className="px-1 py-1 text-[11px] text-muted-foreground">Sin cerebros disponibles todavía.</p>
                                ) : (
                                    brains.map((b) => (
                                        <label
                                            key={b.id}
                                            className={cn(
                                                "flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors",
                                                config.mode === "selected" ? "hover:bg-white/5 cursor-pointer" : "opacity-60",
                                            )}
                                        >
                                            <Checkbox
                                                checked={config.mode === "all" ? true : selectedSet.has(b.id)}
                                                disabled={config.mode === "all"}
                                                onCheckedChange={() => toggleBrain(b.id)}
                                            />
                                            <span className="flex-1 truncate text-xs font-medium">{b.name}</span>
                                            <Badge variant="outline" className="shrink-0 border-white/10 text-[9px] text-muted-foreground">
                                                {b.scope}
                                            </Badge>
                                        </label>
                                    ))
                                )}
                            </div>
                        </>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
