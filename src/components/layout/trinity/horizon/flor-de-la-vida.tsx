/**
 * Flor de la vida en SVG: 19 círculos de igual radio en retícula hexagonal (la misma cuenta que usa la orbe 4D).
 * Sirve de fondo MUY tenue de la cortina (geometría sagrada sutil) y de base de la vista previa de la orbe.
 */
import { cn } from "@/lib/utils";

/** Centros en unidades de radio: 1 + 6 + 6 + 6 = 19. Los 7 primeros son la «semilla de la vida». */
export function centrosFlorDeLaVida(): Array<[number, number]> {
  const centros: Array<[number, number]> = [[0, 0]];
  for (let k = 0; k < 6; k++) centros.push([Math.cos((k * Math.PI) / 3), Math.sin((k * Math.PI) / 3)]);
  for (let k = 0; k < 6; k++) centros.push([2 * Math.cos((k * Math.PI) / 3), 2 * Math.sin((k * Math.PI) / 3)]);
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 6 + (k * Math.PI) / 3;
    centros.push([Math.sqrt(3) * Math.cos(a), Math.sqrt(3) * Math.sin(a)]);
  }
  return centros;
}

export function FlorDeLaVida({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="-3.15 -3.15 6.3 6.3"
      fill="none"
      stroke="currentColor"
      strokeWidth={0.025}
      className={cn("pointer-events-none select-none", className)}
    >
      {centrosFlorDeLaVida().map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={1} />
      ))}
      <circle cx={0} cy={0} r={3} />
    </svg>
  );
}
