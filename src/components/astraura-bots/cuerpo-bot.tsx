'use client';

import * as React from 'react';
import { planCuerpo } from '@/lib/astraura-bots/cuerpo';
import { resolverRefBiblioteca } from '@/lib/avatares/adaptadores/resolver-ref-biblioteca';
import { Cuerpo3dBot } from '@/components/avatares/cuerpo-3d-bot';
import { QuantumOrbAvatar } from '@/components/aurora/quantum-orb-avatar';
import type { Bot, EstadoEmocional } from '@/lib/astraura-bots/tipos';

// We'll also need to import a component for the ser genesis avatar if it exists.
// For now, we'll use a placeholder.

export interface CuerpoBotProps {
  cuerpo: NonNullable<NonNullable<import('@/lib/astraura-bots/tipos').Bot>['cuerpo']>;
  medio: import('@/lib/astraura-bots/tipos').Medio;
  xrDisponible: boolean;
  vrmDisponible: boolean;
  /** Bot completo: con forma «avatar-3d» o «vrm» se dibuja su ADN 3D en vez de la orbe. */
  bot?: Bot;
  emocion?: EstadoEmocional;
  texto?: string | null;
  hablando?: boolean;
  tamano?: number;
}

export const CuerpoBot: React.FC<CuerpoBotProps> = ({ cuerpo, medio, xrDisponible, vrmDisponible, bot, emocion, texto, hablando, tamano }) => {
  const { render, ref, motivo } = React.useMemo(() => planCuerpo(cuerpo, medio, { xrDisponible, vrmDisponible }), [cuerpo, medio, xrDisponible, vrmDisponible]);

  // State for the resolved URL when we need to display an image
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [imageError, setImageError] = React.useState<string | null>(null);

  // Effect to resolve the reference when we have a ref and we are in image mode
  React.useEffect(() => {
    if (render === 'imagen' && ref) {
      // Reset previous state
      setImageUrl(null);
      setImageError(null);
      // Resolve the reference
      resolverRefBiblioteca(ref).then(result => {
        if (result.ok) {
          setImageUrl(result.url);
        } else {
          setImageError(result.motivo);
        }
      }).catch(err => {
        setImageError(`Error al resolver la referencia: ${err.message}`);
      });
    }
  }, [render, ref]);

  // La orbe del bot ES su avatar 3D cuando el cuerpo lo pide y quien monta conoce al bot.
  if (bot && (cuerpo.forma === 'avatar-3d' || cuerpo.forma === 'vrm')) {
    return <Cuerpo3dBot bot={bot} emocion={emocion} texto={texto} hablando={hablando} tamano={tamano} />;
  }

  // Now, render based on the render type
  switch (render) {
    case 'orbe':
      // We use a fixed size for the orbe avatar; ideally we would use the tono and escala from the cuerpo.
      // However, the QuantumOrbAvatar component does not expose tone and scale as props.
      // We hope that the renderer uses the tono and escala from the cuerpo via some other means (e.g., context).
      // For now, we render a default orbe.
      return <QuantumOrbAvatar size={48} />;
    case 'imagen':
      if (imageUrl) {
        return <img src={imageUrl} alt="Avatar del bot" className="cursor-pointer" />;
      } else if (imageError) {
        return <div className="text-sm text-red-500">{imageError}</div>;
      } else {
        return <div>Cargando avatar...</div>;
      }
    case 'ser':
      // TODO: Implement ser rendering using a component for the genesis avatar.
      // For now, we fallback to the orbe.
      return <QuantumOrbAvatar size={48} />;
    case 'modelo-3d':
      if (xrDisponible && vrmDisponible) {
        // TODO: Load and render a 3D model (e.g., using <model-viewer> or a custom component).
        // For now, we show a placeholder.
        return <div className="flex h-48 w-48 items-center justify-center bg-gray-800 text-white">
          Modelo 3D (por implementar)
        </div>;
      } else {
        return <div className="text-sm text-blue-500">próximamente: llega con StarSeed XR (XR1010A)</div>;
      }
    default:
      return <QuantumOrbAvatar size={48} />;
  }
};
