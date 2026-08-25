/**
 * mundo-adn.ts — Garantiza un ADN para cada ser que el mundo tenga que
 * dibujar. `AvatarSer.adn` es OBLIGATORIO (no admite `null`) — pero
 * `SerListado.adn` sí puede faltar (un ser recién creado, o un backend
 * viejo que aún no lo calculó). En vez de que el mundo rompa, o invente un
 * cuerpo con un algoritmo propio (eso sería escribir "otro avatar", justo
 * lo que no toca), se reutiliza la MISMA función pura que usa el resto del
 * sistema (`derivarAdn` en `genesis-dna.ts`): un ser sin ADN precalculado
 * ve exactamente el cuerpo que vería si el backend lo calculara ahora
 * mismo con estos mismos datos — nunca un cuerpo distinto ni un hueco.
 */
import { derivarAdn, type RasgosAdn } from "@/lib/astraura/genesis-dna";
import type { SerListado } from "@/lib/astraura/genesis-types";

export function adnEfectivo(ser: SerListado): RasgosAdn {
  if (ser.adn) return ser.adn;
  return derivarAdn({
    id: ser.id,
    nombre: ser.nombre,
    colorPersonalidad: ser.color ?? null,
    generacion: ser.generacion,
    experiencia: ser.experiencia,
  });
}
