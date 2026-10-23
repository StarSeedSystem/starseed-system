"use client";

// Submenú «Convertir a…» (Filee) para los menús contextuales del OS hechos con
// el DropdownMenu de Radix. Los destinos los da `useConversionMenu`.

import { Loader2, Replace, Settings2 } from "lucide-react";

import {
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuPortal,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";

import type { ConversionMenu } from "./use-conversion-menu";

export function SubmenuConvertir({ conversion, alElegir }: { conversion: ConversionMenu; alElegir?: () => void }) {
    const elegir = (fn: () => void) => () => {
        fn();
        alElegir?.();
    };
    return (
        <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer gap-2 text-xs" data-testid="convertir-a">
                <Replace className="h-3.5 w-3.5 text-[#c9a6ff]" /> Convertir a…
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
                <DropdownMenuSubContent className="z-[9999] w-56 border-white/10 bg-black/95 text-white backdrop-blur-2xl">
                    <DropdownMenuLabel className="text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
                        Con Filee · sin subir nada
                    </DropdownMenuLabel>
                    {conversion.estado === "cargando" && (
                        <DropdownMenuItem disabled className="gap-2 text-xs">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Mirando formatos…
                        </DropdownMenuItem>
                    )}
                    {conversion.estado === "no-disponible" && (
                        <DropdownMenuItem disabled className="whitespace-normal text-[11px] leading-snug text-white/60">
                            {conversion.motivo ?? "Aquí no hay conversor."}
                        </DropdownMenuItem>
                    )}
                    {conversion.estado === "listo" && (
                        <div className="grid grid-cols-2 gap-0.5">
                            {conversion.principales.map((f) => (
                                <DropdownMenuItem
                                    key={f}
                                    className="cursor-pointer truncate text-xs"
                                    title={conversion.etiqueta(f)}
                                    onClick={elegir(() => conversion.onConvertir(f))}
                                >
                                    {conversion.etiqueta(f)}
                                </DropdownMenuItem>
                            ))}
                        </div>
                    )}
                    <DropdownMenuSeparator className="bg-white/10" />
                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={elegir(conversion.onMas)}>
                        <Settings2 className="h-3.5 w-3.5" />
                        {conversion.resto > 0 ? `Más formatos (${conversion.resto})…` : "Abrir el conversor…"}
                    </DropdownMenuItem>
                </DropdownMenuSubContent>
            </DropdownMenuPortal>
        </DropdownMenuSub>
    );
}
