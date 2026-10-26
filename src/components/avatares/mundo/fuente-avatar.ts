/**
 * De un agente del mundo a su cara (Ola 1025U · U1). Un GLB o una imagen de verdad si el agente la trae;
 * si no, el avatar procedural de siempre, que sale del nombre y de los rasgos de su personalidad (cuando la hay).
 * Solo se aceptan imágenes `https:` o `data:image/` o rutas del propio sitio, y GLB/VRM por extensión: una
 * referencia rara cae al procedural, no a un error.
 */
import type { FuenteAvatar } from "../avatar-vivo";
import type { AgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import { proceduralAvatarDataUrl } from "@/lib/aurora/persona-avatar";
import type { PersonalityProfile } from "@/lib/aurora/personalities";

const ES_MODELO = /\.(glb|vrm)(\?.*)?$/i;
const ES_IMAGEN_SEGURA = /^(https:\/\/|data:image\/(png|jpe?g|webp|gif|svg\+xml)[;,]|\/(?!\/))/i;

export function fuenteDeAgente(ref: Pick<AgenteMundoRef, "id" | "nombre" | "avatarRef">, rasgos?: Record<string, number>): FuenteAvatar {
  const a = ref.avatarRef?.trim();
  if (a && ES_IMAGEN_SEGURA.test(a)) {
    return ES_MODELO.test(a) ? { tipo: "glb", url: a } : { tipo: "imagen", url: a };
  }
  // `proceduralAvatarDataUrl` solo lee `id`, `name` y `traits`; el resto del perfil no interviene en el dibujo.
  const perfilMinimo = { id: ref.id, name: ref.nombre, traits: rasgos ?? {} } as unknown as PersonalityProfile;
  return { tipo: "procedural", svg: proceduralAvatarDataUrl(perfilMinimo, 192) };
}
