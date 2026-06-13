import { cn } from "@/lib/utils";
import NextImage from "next/image";

export function Logo({ className }: { className?: string }) {
    return (
        <div className={cn("flex items-center gap-2", className)}>
            <NextImage
                src="/starseed-symbol.png"
                alt="StarSeed"
                width={28}
                height={28}
                priority
                className="h-7 w-7 object-contain drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]"
            />
            <span className="text-xl font-bold font-headline tracking-tighter">StarSeed</span>
        </div>
    );
}
