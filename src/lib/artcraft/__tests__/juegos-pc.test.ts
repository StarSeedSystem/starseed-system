import { describe, expect, it } from "vitest";

import { herramientaPorId, type HerramientaProto } from "@/lib/protomolecula/catalogo-herramientas";

/** La ficha de Rare vive hoy en el catálogo de la Protomolécula; aquí se vigila lo que se publica. */
function rare(): HerramientaProto {
  const h = herramientaPorId("rare");
  if (!h) throw new Error("La ficha de Rare no está en el catálogo");
  return h;
}

describe("ficha publicada de Rare · juegos de PC", () => {
  it("solo se actualiza desde github.com/RareDevs/Rare/releases", () => {
    const h = rare();
    expect(h.codigo).toBe("https://github.com/RareDevs/Rare");
    expect(h.actualizacion).toMatchObject({ fuente: "github-tags", ref: "RareDevs/Rare" });
    expect(h.actualizacion.filtro).toBeTruthy();
    const version = h.actualizacion.ultimaVersion ?? "";
    expect(version).toMatch(new RegExp(h.actualizacion.filtro as string));
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
