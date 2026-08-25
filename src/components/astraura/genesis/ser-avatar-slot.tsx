"use client";

/**
 * Envoltorio del avatar de un ser.
 * ----------------------------------------------------------------------------
 * El avatar lo escribe OTRO subagente en `./avatar/`, en paralelo a este
 * trabajo — no es mío, no lo escribo yo. Este fichero es la ÚNICA puerta de
 * entrada a ese módulo desde el resto de Génesis (la lista, la ficha, el
 * ritual, las propuestas y el cliente no importan `./avatar` directamente):
 * si `./avatar` todavía no existiera al compilar, el error de tipos
 * quedaría aislado aquí, en un solo fichero, sin bloquear el resto.
 *
 * OLA 2 (enganche): antes se usaba `AvatarAutonomo` directo — SIEMPRE
 * procedural, ignorando `avatarFuente` aunque el ser ya tuviera un cuerpo en
 * línea o subido elegido en su ficha. Ahora se usa `AvatarConFuente`, la
 * puerta que decide POR ENCIMA cuál de los tres pintar y cae sola al
 * procedural si la imagen falla — con su licencia y su atribución al lado
 * cuando el cuerpo es "en línea" (`mostrarProcedencia`, encendido por
 * defecto en `AvatarConFuente`: es requisito del encargo, no adorno).
 *
 * `avatarFuente` es un prop NUEVO y OPCIONAL a propósito: `SerListado`
 * (lo que trae `seres-lista.tsx` para cada fila) todavía no incluye ese
 * campo en el contrato — solo `Ser` (la ficha completa) lo tiene. Omitirlo
 * es exactamente "ausente = procedural, como siempre", así que las filas de
 * lista no cambian de comportamiento; solo la ficha, que sí puede pasarlo,
 * empieza a enseñar el cuerpo real elegido.
 *
 * `ser.adn` puede faltar (backend viejo, ser recién listado sin recalcular
 * todavía): `adnDeSer` ya NO se llama aquí — `AvatarConFuente` lo deriva
 * internamente con la misma `adnDeSer` (genesis-logic.ts), así que sigue
 * recibiendo SIEMPRE un `RasgosAdn` completo, nunca `null`.
 *
 * `AvatarConFuente` (como `AvatarAutonomo`, al que envuelve) monta un
 * `<Canvas>` de react-three-fiber en su rama procedural y NO es SSR-safe
 * (su propia cabecera lo documenta) — por eso quien coloque este componente
 * en el árbol debe importarlo con
 * `next/dynamic(() => import("./ser-avatar-slot"), { ssr: false })`, igual
 * que ya hace el resto del OS con sus paneles 3D/Canvas.
 */
import type { FuenteAvatar } from "@/lib/astraura/genesis-types";
import { AvatarConFuente } from "./avatar";
import { type SerAdnInput } from "./genesis-logic";

export interface SerAvatarSlotProps {
  ser: SerAdnInput;
  /** Tamaño en px, cuadrado. 56 en filas de lista, más grande en la ficha. */
  tamano?: number;
  /** El nombre como texto real junto al avatar (el visual en sí es decorativo). Apágalo si el nombre ya se muestra al lado por otro sitio. */
  mostrarNombre?: boolean;
  /** De dónde sale el cuerpo real del ser (OLA 2). Ausente = procedural, como
   * siempre — así es como llegan las filas de `seres-lista.tsx`, que solo
   * tienen `SerListado` y ese campo no está en su contrato. */
  avatarFuente?: FuenteAvatar | null;
  /** Licencia + atribución junto al avatar cuando el cuerpo es "en línea".
   * Sin especificar, manda el propio default de `AvatarConFuente` (encendido). */
  mostrarProcedencia?: boolean;
  className?: string;
}

export function SerAvatarSlot({ ser, tamano = 56, mostrarNombre = false, avatarFuente, mostrarProcedencia, className }: SerAvatarSlotProps) {
  return (
    <AvatarConFuente
      ser={ser}
      avatarFuente={avatarFuente}
      tamano={tamano}
      mostrarNombre={mostrarNombre}
      mostrarProcedencia={mostrarProcedencia}
      className={className}
    />
  );
}

export default SerAvatarSlot;
