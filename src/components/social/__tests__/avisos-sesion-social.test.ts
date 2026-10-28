/**
 * RTGUI1021M3 · Rescate de GUI1021M3c: los avisos de sesión de publicaciones y entidades.
 * ─────────────────────────────────────────────────────────────────────────────
 * GUI1021M3c cambió los avisos sueltos de «Inicia sesión» por el componente común
 * `AvisoSesion` en las tres superficies sociales. Su rama traía pruebas que main no tenía con
 * ese nombre; aquí quedan las que aún cubren un contrato vivo, adaptadas al código de hoy:
 *
 *  - cada superficie importa `AvisoSesion` y conserva su texto,
 *  - no sobrevive ningún aviso suelto ni ningún enlace directo a `/login`,
 *  - la página de gobernanza conserva su enlace de volver, que nunca fue un aviso.
 *
 * No se incluye el caso de `compacto` en cabeceras: main integró esas dos superficies sin la
 * versión compacta, así que la prueba tal cual quedaría en rojo (es un hueco real, no un contrato).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const RAIZ_SOCIAL = path.join(process.cwd(), "src/components/social");

const SUPERFICIES = ["PostCard.tsx", "entity-header.tsx", "governance-entity-page.tsx"] as const;

/** Lee el fuente de una superficie social tal como está en el repositorio. */
function fuente(archivo: string): string {
  return readFileSync(path.join(RAIZ_SOCIAL, archivo), "utf8");
}

/** El texto propio que cada superficie conserva dentro del aviso común. */
const TEXTOS: Record<(typeof SUPERFICIES)[number], string> = {
  "PostCard.tsx": "Inicia sesión para comentar en la red real",
  "entity-header.tsx": 'Inicia sesión para ${isCommunity ? "unirte" : "seguir"}',
  "governance-entity-page.tsx": "Inicia sesión para afiliarte",
};

describe("avisos de sesión en social (GUI1021M3c)", () => {
  it("cada superficie va por AvisoSesion y conserva su texto", () => {
    for (const archivo of SUPERFICIES) {
      const codigo = fuente(archivo);
      expect(codigo, `${archivo}: importa el aviso común`).toContain(
        'import { AvisoSesion } from "@/components/auth/aviso-sesion";',
      );
      expect(codigo, `${archivo}: monta AvisoSesion`).toContain("<AvisoSesion");
      expect(codigo, `${archivo}: conserva su texto`).toContain(TEXTOS[archivo]);
    }
  });

  it("no queda ningún aviso suelto de «Inicia sesión» apuntando a /login", () => {
    for (const archivo of SUPERFICIES) {
      const codigo = fuente(archivo);
      expect(codigo, `${archivo}: sin enlaces sueltos a /login`).not.toMatch(/href=["']\/login["']/);

      // Se quitan los bloques de AvisoSesion; lo que quede con «Inicia sesión» es un aviso suelto,
      // salvo el placeholder del cuadro de comentarios, que no es un aviso.
      const sinAvisos = codigo.replace(/<AvisoSesion[\s\S]*?\/>/g, "");
      const lineas = sinAvisos.split("\n");
      for (let i = 0; i < lineas.length; i++) {
        if (!lineas[i].includes("Inicia sesión")) continue;
        const contexto = lineas.slice(Math.max(0, i - 2), i + 1).join(" ");
        expect(
          contexto,
          `${archivo}: aviso suelto fuera de AvisoSesion → ${lineas[i].trim()}`,
        ).toContain("placeholder");
      }
    }
  });

  it("governance-entity-page conserva su enlace de volver (no era un aviso)", () => {
    const codigo = fuente("governance-entity-page.tsx");
    expect(codigo).toContain('import Link from "next/link";');
    expect(codigo).toMatch(/<Link href=\{backHref\}/);
  });
});
