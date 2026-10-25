import { cn } from "@/lib/utils";
import { SimboloStarseed } from "@/components/marca/simbolo-starseed";

/**
 * IconoStarSeed — emblema del símbolo oficial de StarSeed para las CABECERAS
 * de las ventanas de introducción. Va arriba del todo, centrado, dentro de un
 * anillo suave con degradado ámbar/azure (Trinity: Logic + Zenith) y un leve
 * resplandor.
 */
export function IconoStarSeed({ size = 56, className }: { size?: number; className?: string }) {
  return (
    <span
      data-ss-coreo="logo"
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
      {/* El símbolo oficial es cuadrado (lienzo 400 × 400): se ajusta por su
          lado al cielo del anillo, que es solo decoración detrás. */}
      <SimboloStarseed className="relative" tamano={Math.round(size * 0.82)} />
    </span>
  );
}

export default IconoStarSeed;
