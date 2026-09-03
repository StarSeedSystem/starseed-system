import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * IconoStarSeed — emblema PNG de StarSeed para las CABECERAS de las ventanas
 * de introducción. Va arriba del todo, centrado, dentro de un anillo suave con
 * degradado ámbar/azure (Trinity: Logic + Zenith) y un leve resplandor.
 */
export function IconoStarSeed({ size = 56, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size + 16, height: size + 16 }}
    >
      <span
        aria-hidden
        className="absolute inset-0 rounded-full border border-amber-300/25 bg-gradient-to-tr from-amber-400/10 via-transparent to-sky-400/10 shadow-[0_0_24px_-4px_rgba(251,191,36,0.35)]"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-tr from-amber-400/20 to-sky-400/20 blur-md"
      />
      <Image
        src="/starseed-symbol.png"
        alt="StarSeed"
        width={size}
        height={size}
        priority
        className="relative h-auto w-auto rounded-full"
        style={{ width: size, height: size }}
      />
    </span>
  );
}

export default IconoStarSeed;
