"use client";

/**
 * Símbolo oficial de StarSeed (vesica piscis, ojo y diamante) para las ventanas de la Librería.
 * ═══════════════════════════════════════════════════════════════════════════
 * (2026-11-07, LIB1107A) Alex: «añade el símbolo de StarSeed en las ventanas de descarga de
 * StarSeed OS de la Librería». Una sola pieza para todas: la franja de descarga, cada ventana
 * por sistema, el Centro de Versiones y el diálogo de instalar.
 *
 * Reglas de la marca (adn-y-tokens.md): el símbolo no se deforma ni se recolorea. Hasta 128 px
 * se usa la versión cuadrada (`starseed-symbol-square.png`, 512×512, con su propio aire
 * alrededor); por encima, la vertical original (1000×1497, proporción 2:3) ajustada por su alto.
 * `next/image` pide al optimizador el tamaño real (1× y 2×): nítido y ligero.
 */

import Image from "next/image";

import { cn } from "@/lib/utils";

export interface SimboloStarSeedProps {
    /** Lado de la caja en píxeles (el símbolo se ajusta dentro sin deformarse). */
    size?: number;
    className?: string;
    /** Halo radial suave del acento zenith detrás del símbolo (pieza protagonista). */
    halo?: boolean;
    /** Junto a un texto que ya dice «StarSeed»: el lector de pantalla no lo repite. */
    decorativo?: boolean;
}

/** Proporción del PNG vertical original (ancho / alto). */
const PROPORCION_VERTICAL = 1000 / 1497;

export function SimboloStarSeed({ size = 40, className, halo = false, decorativo = false }: SimboloStarSeedProps) {
    const cuadrada = size <= 128;
    const ancho = cuadrada ? size : Math.round(size * PROPORCION_VERTICAL);
    return (
        <span
            className={cn("relative inline-grid shrink-0 place-items-center", className)}
            style={{ width: size, height: size }}
            data-testid="simbolo-starseed"
        >
            {halo && (
                <span
                    aria-hidden
                    className="pointer-events-none absolute -inset-[18%] rounded-full"
                    style={{ background: "radial-gradient(closest-side, hsl(var(--trinity-azure-hsl) / 0.22), transparent)" }}
                />
            )}
            <Image
                src={cuadrada ? "/starseed-symbol-square.png" : "/starseed-symbol.png"}
                alt={decorativo ? "" : "StarSeed"}
                width={ancho}
                height={size}
                className="relative h-full w-auto max-w-full select-none object-contain"
                draggable={false}
            />
        </span>
    );
}

export default SimboloStarSeed;
