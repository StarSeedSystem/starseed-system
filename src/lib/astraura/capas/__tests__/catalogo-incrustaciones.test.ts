import { describe, it, expect } from "vitest";
import { leerCatalogo, usable, candidatosDe } from "../catalogo";
import catalogoCrudo from "../../../../../config/capas-astraura.json";

describe("catálogo JSON con la incrustación de LEANN (1028L)", () => {
  const catalogo = leerCatalogo(catalogoCrudo);
  const incrustacion = catalogo.capas.find(
    (e) => e.id === "ollama-qwen3-embedding-0.6b",
  );

  it("leerCatalogo la lee y pasa el esquema de EntradaCapa", () => {
    expect(incrustacion).toBeDefined();
    expect(incrustacion?.capa).toBe("memoria");
    expect(incrustacion?.runtime).toBe("ollama");
    expect(incrustacion?.formato).toBe("gguf");
    expect(incrustacion?.disco_mb).toBe(639);
    expect(incrustacion?.ram_min_mb).toBe(1024);
    expect(incrustacion?.medios).toEqual(["servidor"]);
  });

  it("no es usable sin SHA verificado (estado por-verificar, §6)", () => {
    expect(incrustacion?.sha256).toBe("por-verificar");
    expect(incrustacion?.estado).toBe("por-verificar");
    expect(usable(incrustacion!)).toBe(false);
  });

  it("el runtime ollama no la saca de candidatos por medio servidor…", () => {
    const memoria = candidatosDe(catalogo, "memoria", "servidor");
    expect(memoria.map((e) => e.id)).toContain("ollama-qwen3-embedding-0.6b");
  });
});
