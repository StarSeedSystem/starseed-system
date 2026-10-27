import { describe, expect, it } from "vitest";
import { herramientaPorId } from "@/lib/protomolecula/catalogo-herramientas";
import type { HerramientaProto } from "@/lib/protomolecula/catalogo-herramientas";

/**
 * Rescate de la rama nube/40502103787 (RTTRD1020Db-d2): los casos de la rama
 * probaban `src/lib/artcraft/juegos-pc.ts`, que main no integró; el contrato
 * de Rare vive HOY en la ficha `rare` del catálogo de la Protomolécula
 * (architecture/artcraft-y-rare.md). La cobertura clásica (licencia GPL,
 * programa aparte, fuente de actualización `github-tags` con su filtro y los
 * avisos de credenciales de Epic) ya está en
 * `src/lib/protomolecula/__tests__/catalogo-herramientas.test.ts`; aquí solo
 * lo que esa suite no afirma.
 */

function rare(): HerramientaProto {
  const ficha = herramientaPorId("rare");
  if (!ficha) throw new Error("La ficha de Rare no está en el catálogo.");
  return ficha;
}

describe("Rare · ficha del lanzador de Epic en el catálogo (rescate)", () => {
  it("nombra raredevs.github.io (wring) y ProtonDB entre las descargas remotas bloqueadas", () => {
    const avisos = (rare().avisos ?? []).join(" ");
    expect(avisos).toContain("raredevs.github.io/wring");
    expect(avisos).toContain("ProtonDB");
    expect(avisos).toMatch(/bloquea o se aloja con SHA fijado/);
  });

  it("deja la sesión de Epic por persona en LEGENDARY_CONFIG_PATH con permisos 0700", () => {
    const notas = rare().control.notas;
    expect(notas).toContain("LEGENDARY_CONFIG_PATH");
    expect(notas).toContain("0700");
    expect(notas).toMatch(/por persona/);
    expect(notas).toMatch(/nunca/);
  });

  it("no expone campos de la sesión de Epic en la ficha publicada", () => {
    const texto = JSON.stringify(rare());
    for (const campo of ["access_token", "refresh_token", "account_id", "exchange_code"]) {
      expect(texto).not.toContain(campo);
    }
  });
});
