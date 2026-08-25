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
 * `./avatar` expone DOS componentes (ver su `index.ts`): `AvatarSer` — un
 * fragmento de escena SIN Canvas propio, pensado para el mundo compartido
 * donde muchos avatares comparten un único contexto WebGL — y
 * `AvatarAutonomo` — con Canvas, luces y respaldo SVG ya resueltos,
 * documentado explícitamente para "tarjetas de perfil… listados". Génesis
 * enseña UN ser suelto a la vez (una fila de la lista, la cabecera de la
 * ficha): ese es exactamente el segundo caso, así que es el que se usa
 * aquí — usar el primero habría significado reconstruir a mano el Canvas,
 * las luces y el respaldo que `AvatarAutonomo` ya resuelve.
 *
 * `ser.adn` puede faltar (backend viejo, ser recién listado sin recalcular
 * todavía): `adnDeSer` (genesis-logic.ts) lo deriva de forma determinista
 * para que el avatar SIEMPRE reciba un `RasgosAdn` completo, nunca `null`.
 *
 * `AvatarAutonomo` monta un `<Canvas>` de react-three-fiber y NO es
 * SSR-safe (su propia cabecera lo documenta) — por eso quien coloque este
 * componente en el árbol debe importarlo con
 * `next/dynamic(() => import("./ser-avatar-slot"), { ssr: false })`, igual
 * que ya hace el resto del OS con sus paneles 3D/Canvas.
 */
import { AvatarAutonomo } from "./avatar";
import { adnDeSer, type SerAdnInput } from "./genesis-logic";

export interface SerAvatarSlotProps {
  ser: SerAdnInput;
  /** Tamaño en px, cuadrado. 56 en filas de lista, más grande en la ficha. */
  tamano?: number;
  /** El nombre como texto real junto al avatar (el visual en sí es decorativo). Apágalo si el nombre ya se muestra al lado por otro sitio. */
  mostrarNombre?: boolean;
  className?: string;
}

export function SerAvatarSlot({ ser, tamano = 56, mostrarNombre = false, className }: SerAvatarSlotProps) {
  const adn = adnDeSer(ser);
  return <AvatarAutonomo adn={adn} tamano={tamano} nombre={mostrarNombre ? ser.nombre : undefined} className={className} />;
}

export default SerAvatarSlot;
