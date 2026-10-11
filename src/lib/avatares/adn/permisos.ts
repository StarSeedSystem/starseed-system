/**
 * Avatares 3D · QUIÉN PUEDE CAMBIAR QUÉ AVATAR (AV1011). Contrato: architecture/astraura-avatares-3d.md §7.
 *
 * Probar en tu pantalla es libre (vista previa local: no cambia nada compartido). APLICAR sigue el
 * gobierno del dueño, igual que la configuración de los bots: tu avatar y tu bot personal los cambias
 * tú; el de un grupo democrático se VOTA (se vota el diff); en uno jerárquico lo aprueba quien
 * administra; observadores e invitados no cambian lo compartido. PURO.
 */
import type { Gobierno, RolBot } from "@/lib/astraura-bots/tipos";
import type { AdnAvatar } from "./adn";

export type RequisitoAvatar = "nada" | "votacion" | "confirmacion" | "nunca";
export interface DecisionAvatar { permitido: boolean; requiere: RequisitoAvatar; motivo: string }

export interface PeticionCambioAvatar {
  adn: Pick<AdnAvatar, "dueno">;
  rol: RolBot;
  /** Gobierno de la entidad dueña (grupo, comunidad o página). Para perfiles y bots personales no aplica. */
  gobierno?: Gobierno;
  /** Si el avatar es de un bot, ¿el bot es de una entidad (grupo, comunidad, página)? */
  botDeEntidad?: boolean;
  vistaPrevia: boolean;
}

const si = (motivo: string): DecisionAvatar => ({ permitido: true, requiere: "nada", motivo });
const no = (requiere: RequisitoAvatar, motivo: string): DecisionAvatar => ({ permitido: false, requiere, motivo });

export function decidirCambioAvatar(p: PeticionCambioAvatar): DecisionAvatar {
  if (p.vistaPrevia) return si("Vista previa en tu pantalla: no cambia nada compartido.");
  const tipo = p.adn.dueno.tipo;
  const deEntidad = tipo === "grupo" || tipo === "comunidad" || tipo === "pagina" || (tipo === "bot" && p.botDeEntidad === true);
  if (!deEntidad) return p.rol === "dueno" ? si("Es tu avatar.") : no("nunca", "Solo su dueño cambia este avatar.");
  if (p.rol === "observador" || p.rol === "invitado") return no("nunca", "Con tu papel puedes probarlo en tu pantalla y proponerlo, no aplicarlo.");
  if ((p.gobierno ?? "jerarquico") === "democratico") return no("votacion", "Es de todos: el cambio se propone y se vota.");
  if (p.rol === "dueno" || p.rol === "admin") return si("Lo administras tú.");
  return no("confirmacion", "Lo aprueba quien administra el grupo o la página.");
}
