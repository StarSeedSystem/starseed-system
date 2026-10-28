import { describe, it, expect } from "vitest";
import { leerCatalogo, usable, candidatosDe } from "../catalogo";
import catalogoCrudo from "../../../../../config/capas-astraura.json";

// LNN1028H: el modelo de incrustaciones de LEANN entra «por-verificar» y con
// `sha256: null`; ninguna capa sin SHA medido puede usarse (capas-autoadaptables §6).
const ID = "ollama-qwen3-embedding-0.6b";

describe("catálogo JSON con la incrustación de LEANN (1028L)", () => {
  const catalogo = leerCatalogo(catalogoCrudo);
  const incrustacion = catalogo.capas.find((e) => e.id === ID);
  const cruda = (catalogoCrudo.capas as Array<Record<string, unknown>>).find(
    (e) => e.id === ID,
  );

  it("el JSON la declara con sha256 null, «por-verificar» y su nota", () => {
    expect(cruda).toBeDefined();
    expect(cruda?.sha256).toBeNull();
    expect(cruda?.estado).toBe("por-verificar");
    expect(cruda?.nota).toBe(
      "solo para incrustaciones de LEANN; Apache-2.0 de Qwen; se verifica al instalar",
    );
  });

  it("leerCatalogo la lee, normaliza el SHA ausente y pasa el esquema de EntradaCapa", () => {
    expect(incrustacion).toBeDefined();
    expect(incrustacion?.capa).toBe("memoria");
    expect(incrustacion?.runtime).toBe("ollama");
    expect(incrustacion?.formato).toBe("gguf");
    expect(incrustacion?.disco_mb).toBe(639);
    expect(incrustacion?.ram_min_mb).toBe(1024);
    expect(incrustacion?.medios).toEqual(["servidor"]);
    expect(incrustacion?.fuente_oficial).toBe("https://ollama.com/library/qwen3-embedding");
    expect(incrustacion?.estado).toBe("por-verificar");
    expect(incrustacion?.sha256).toBe("por-verificar");
  });

  it("no es usable sin SHA verificado (estado por-verificar, §6)", () => {
    expect(incrustacion).toBeDefined();
    expect(usable(incrustacion!)).toBe(false);
  });

  it("sigue siendo candidata de la capa memoria en servidor", () => {
    const memoria = candidatosDe(catalogo, "memoria", "servidor");
    expect(memoria.map((e) => e.id)).toContain(ID);
  });
});
