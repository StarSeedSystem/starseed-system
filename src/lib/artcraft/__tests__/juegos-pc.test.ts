import { describe, it, expect } from "vitest";
import { rare } from "@/lib/artcraft/rare";

describe("artcraft · rare", () => {
  it("solo se actualiza desde github.com/RareDevs/Rare", () => {
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
    expect(notas).toContain("por persona");
    expect(notas).toContain("nunca");
  });

  it("no expone campos de la sesión de Epic en la ficha publicada", () => {
    const texto = JSON.stringify(rare());
    for (const campo of ["access_token", "refresh_token", "account_id", "exchange_code"]) {
      expect(texto).not.toContain(campo);
    }
  });
});