import type { Cuerpo, Medio, FormaCuerpo } from "./tipos";

export function planCuerpo(
  cuerpo: Cuerpo,
  medio: Medio,
  ctx: { xrDisponible: boolean; vrmDisponible: boolean }
): { render: "orbe" | "imagen" | "ser" | "modelo-3d"; ref?: string; motivo?: string } {
  const { forma, avatarRef } = cuerpo;
  const { xrDisponible, vrmDisponible } = ctx;

  // Default to orbe
  let render: "orbe" | "imagen" | "ser" | "modelo-3d" = "orbe";
  let ref: string | undefined;
  let motivo: string | undefined;

  switch (forma) {
    case "orbe":
      render = "orbe";
      break;
    case "avatar-2d":
      // Check if avatarRef is a Biblioteca or ADN reference
      if (avatarRef?.startsWith("lib:") || avatarRef?.startsWith("biblioteca:") || avatarRef?.startsWith("adn:")) {
        render = "imagen";
        ref = avatarRef;
      } else {
        // Invalid avatarRef (e.g., a bare URL) -> fall back to orbe with motivo
        render = "orbe";
        motivo = "Referencia de avatar no válida: se esperaba una referencia de Biblioteca o ADN";
      }
      break;
    case "ser-genesis":
      render = "ser";
      break;
    case "avatar-3d":
    case "vrm":
      if (medio === "xr" && vrmDisponible) {
        render = "modelo-3d";
        ref = avatarRef; // In the future, this might be used to load the 3D model
      } else {
        render = "orbe";
        motivo = "próximamente: llega con StarSeed XR (XR1010A)";
      }
      break;
    default:
      // For any other forma, fallback to orbe
      render = "orbe";
      motivo = "Forma de cuerpo no soportado";
  }

  return { render, ref, motivo };
}
