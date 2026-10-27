import { cn } from "@/lib/utils";
import { SimboloStarseed } from "@/components/marca/simbolo-starseed";

export function Logo({ className }: { className?: string }) {
    return (
        <div className={cn("flex items-center gap-2", className)}>
            <span
                aria-hidden
                className="h-7 w-7 shrink-0 drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]"
            >
                <SimboloStarseed tamano={28} />
            </span>
            <span className="text-xl font-bold font-headline tracking-tighter">StarSeed</span>
        </div>
    );
}
