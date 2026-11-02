/**
 * Punto único del área de avatares (AV1011K): una sola ruta monta lo que ya existe
 * sin duplicarlo. Contrato: architecture/astraura-avatares-3d.md.
 * El selector (AV1011D) y el editor en tiempo real (AV1011B) son la puerta de
 * personalización en la edición de perfil, en los ajustes de grupo/página y en
 * el editor de «Mis bots» (BOT1011I1).
 */

export { default as SelectorAvatar3d } from "./selector-avatar-3d";
export { default as EditorAvatar } from "./editor-avatar";
export { AvatarVivo } from "./avatar-vivo";
export { Cuerpo3dBot } from "./cuerpo-3d-bot";

export type { EditorAvatarProps } from "./editor-avatar";
