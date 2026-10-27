import { cn } from "@/lib/utils";
import SimboloStarSeed from "@/components/marca/simbolo-starseed";

export function Logo({ className }: { className?: string }) {
    return (
        <div className={cn("flex items-center gap-2", className)}>
            {/* El símbolo oficial en SVG, con la geometría de `simbolo-geometria.ts` y sin
                siembra animada: la marca es un icono estático (el estado final del símbolo). */}
            <span className="h-7 w-7 shrink-0 [filter:drop-shadow(0_0_10px_rgba(168,85,247,0.5))]">
                <SimboloStarSeed tamano={28} siembra={false} ariaLabel="StarSeed" />
            </span>
            <span className="text-xl font-bold font-headline tracking-tighter">StarSeed</span>
        </div>
    );
}
