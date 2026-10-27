import { describe, expect, it } from "vitest";
import { herramientaPorId } from "../../protomolecula/catalogo-herramientas";
import type { HerramientaProto } from "../../protomolecula/catalogo-herramientas";

/**
 * La entrada vigente de Rare vive en el catálogo de la Protomolécula
 * (`architecture/artcraft-y-rare.md` §6); esa ficha es hoy el contrato que el
 * OS publica sobre «Juegos de PC». El planificador de rutas y la guarda de
 * credenciales de §5.2/§5.3 no están cableados en main, así que aquí solo se
 * rescatan los casos de la rama que sí tienen equivalente en la API actual.
 */
function rare(): HerramientaProto {
  const h = herramientaPorId("rare");
  expect(h, "Rare debería estar en el catálogo").toBeDefined();
  return h as HerramientaProto;
}

describe("Rare · juegos de PC, lanzamiento y credenciales de Epic", () => {
  it("solo se actualiza desde github.com/RareDevs/Rare/releases", () => {
    const h = rare();
    expect(h.codigo).toBe("https://github.com/RareDevs/Rare");
    expect(h.actualizacion).toMatchObject({ fuente: "github-tags", ref: "RareDevs/Rare" });
    expect(h.actualizacion.filtro).toBeTruthy();
    expect(h.actualizacion.ultimaVersion).toMatch(new RegExp(h.actualizacion.filtro as string));
  });

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
