import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// Dynamically import the internal map component with SSR disabled
const ClimateMapInternal = dynamic(
    () => import("./climate-map-internal"),
    {
        ssr: false,
        loading: () => (
            <div className="w-full h-full flex flex-col items-center justify-center bg-[#020804] text-[#25f46a]/50">
                <Skeleton className="w-[100px] h-[100px] rounded-full opacity-20 animate-pulse bg-[#25f46a]/20 mb-4" />
                <span className="text-xs font-mono uppercase tracking-[0.2em] font-bold">Cargando Mapa...</span>
            </div>
        )
    }
);

export function ClimateMap({ activeOverlay }: { activeOverlay?: string }) {
    return <ClimateMapInternal activeOverlay={activeOverlay} />;
}
