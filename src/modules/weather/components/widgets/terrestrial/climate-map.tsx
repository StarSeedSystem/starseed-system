import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// Dynamically import the internal map component with SSR disabled
const ClimateMapInternal = dynamic(
    () => import("./climate-map-internal"),
    {
        ssr: false,
        loading: () => (
            <div role="status" className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#0a0d22] text-white/70">
                <Skeleton className="size-16 rounded-full bg-sky-400/15 motion-safe:animate-pulse" />
                <span className="text-[12px] font-medium">Cargando el mapa…</span>
            </div>
        )
    }
);

export function ClimateMap({ activeOverlay }: { activeOverlay?: string }) {
    return <ClimateMapInternal activeOverlay={activeOverlay} />;
}
