/**
 * Del oficio de un habitante al gesto con que se mueve su avatar (Ola 234; en lib desde la Ola 1025U · U1).
 * Misma forma `Gesto` que el motor único «Vida StarSeed», para que el clip respire con la misma identidad
 * que en perfil, chat o biblioteca.
 *
 * La energía se redondea a cuartos: `useMovimiento` regenera el clip cada vez que cambia el gesto, y la
 * energía de la simulación cambia en cada tick. Sin redondear, 24 avatares pedían 24 clips por segundo.
 */
import type { Gesto } from "@/lib/avatares/movimiento/motor";
import type { HabitanteMundo } from "./simulacion";

function cuartos(n: number): number {
  return Math.round(Math.max(0, Math.min(1, n)) * 4) / 4;
}

export function gestoParaOcupacion(h: Pick<HabitanteMundo, "energia" | "humor" | "ocupacion">): Gesto {
  const energia = Math.max(0.25, Math.min(0.95, cuartos(h.energia)));
  switch (h.ocupacion) {
    case "conversar":
      return {
        prompt: "saludar con calidez y asentir levemente",
        emocion: h.humor === "feliz" ? "alegria" : "amabilidad",
        energia,
        duracionMs: 2200,
        bucle: true,
      };
    case "crear":
      return {
        prompt: "concentrarse, inclinar la cabeza y respirar profundo",
        emocion: h.humor === "curioso" ? "foco" : "serenidad",
        energia,
        duracionMs: 3200,
        bucle: true,
      };
    case "descansar":
      return {
        prompt: "respirar lentamente con los ojos cerrados",
        emocion: "calma",
        energia: 0.25,
        duracionMs: 4000,
        bucle: true,
      };
    case "explorar":
    default:
      return {
        prompt: "mirar alrededor con curiosidad",
        emocion: h.humor === "feliz" ? "curiosidad" : "atencion",
        energia,
        duracionMs: 2600,
        bucle: true,
      };
  }
}
