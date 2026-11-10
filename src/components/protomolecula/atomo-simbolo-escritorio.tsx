"use client";

/**
 * Protomolécula · Vista del átomo «Símbolo del escritorio» (ESC1110B).
 *
 * Pinta el símbolo fundido con la flor con los valores del panel (pose, luz y comportamientos),
 * en vivo: lo que se mueve aquí es lo que vuelve al escritorio de su dueño. La forma de un
 * símbolo propio (GLB, SVG o imagen) no viaja en la molécula; aquí se ve sobre el oficial y en
 * su escritorio con su forma.
 */
import { useMemo } from "react";
import type { VistaProps } from "@/lib/protomolecula/registro-atomos";
import { archivoDeValores } from "@/lib/protomolecula/atomos/simbolo-escritorio";
import { SimboloStarSeed3D } from "@/components/brand/simbolo-starseed-3d";

export default function AtomoSimboloEscritorio({ atomoId, valores }: VistaProps) {
  const clave = JSON.stringify(valores ?? {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const archivo = useMemo(() => archivoDeValores(valores, atomoId), [clave, atomoId]);
  return (
    <div className="flex h-full min-h-[320px] w-full flex-col items-center justify-center gap-3 overflow-hidden p-4" data-testid="atomo-simbolo-escritorio">
      <div className="grid place-items-center pt-24 pb-28">
        <SimboloStarSeed3D alto={160} conFlor interactivo archivo={archivo} etiqueta="Símbolo del escritorio" />
      </div>
      <p className="max-w-xs text-center text-[11px] text-muted-foreground">
        Los cambios vuelven solos al símbolo de su perfil, página o grupo. La forma de un símbolo propio se ve en su escritorio.
      </p>
    </div>
  );
}
