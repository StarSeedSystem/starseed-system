import { describe, expect, it } from "vitest";
import { herramientaPorId } from "../../protomolecula/catalogo-herramientas";
import type { HerramientaProto } from "../../protomolecula/catalogo-herramientas";

/**
 * La rama ART1025L traía el planificador de rutas y las guardas
 * `validarSinCredencialesEpic` / `esUrlPermitidaRare`. En main ese módulo no se
 * cableó: el contrato vivo de «Juegos de PC» es la ficha `rare` del catálogo de
 * la Protomolécula (architecture/artcraft-y-rare.md §5-6). Aquí se rescatan
 * solo los casos que el catálogo no cubría ya con otro nombre.
 */
function rare(): HerramientaProto {
  const h = herramientaPorId("rare");
  expect(h, "Rare debería estar en el catálogo").toBeDefined();
  return h as HerramientaProto;
}

describe("Rare · lanzamiento y credenciales de Epic", () => {
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
