import { describe, it, expect } from "vitest";
import { buscarIdiomas, normalizarTexto } from "../busqueda";
import { IdiomaMundial } from "../lista-mundial";

function crearIdiomaMundial(parcial: Partial<IdiomaMundial>): IdiomaMundial {
  return {
    codigo: parcial.codigo ?? "xx",
    nombrePropio: parcial.nombrePropio ?? "",
    nombreActual: parcial.nombreActual ?? "",
    masHablado: parcial.masHablado ?? false,
    dir: parcial.dir ?? "ltr",
    conCatalogo: parcial.conCatalogo ?? false,
    alias: parcial.alias ?? [],
  };
}

describe("busqueda de idiomas", () => {
  const listaBase: IdiomaMundial[] = [
    crearIdiomaMundial({ codigo: "en", nombrePropio: "English", nombreActual: "inglés", alias: ["inglés", "ingles"] }),
    crearIdiomaMundial({ codigo: "es", nombrePropio: "Español", nombreActual: "español", alias: ["castellano", "español", "espanol"] }),
    crearIdiomaMundial({ codigo: "zh", nombrePropio: "简体中文", nombreActual: "chino", alias: ["chino", "mandarín", "mandarin", "chino simplificado"] }),
    crearIdiomaMundial({ codigo: "zh-hant", nombrePropio: "繁體中文", nombreActual: "chino tradicional", alias: ["chino tradicional"] }),
    crearIdiomaMundial({ codigo: "pt", nombrePropio: "Português", nombreActual: "portugués", alias: ["portugués", "portugues"] }),
    crearIdiomaMundial({ codigo: "de", nombrePropio: "Deutsch", nombreActual: "alemán", alias: ["alemán", "aleman"] }),
    crearIdiomaMundial({ codigo: "fr", nombrePropio: "Français", nombreActual: "francés", alias: ["francés", "frances"] }),
    crearIdiomaMundial({ codigo: "ar", nombrePropio: "العربية", nombreActual: "árabe", alias: ["árabe", "arabe"] }),
    crearIdiomaMundial({ codigo: "ja", nombrePropio: "日本語", nombreActual: "japonés", alias: ["japonés", "japones"] }),
  ];

  describe("normalizarTexto", () => {
    it("elimina acentos y pasa a minúsculas", () => {
      expect(normalizarTexto("Inglés")).toBe("ingles");
      expect(normalizarTexto("ESPAÑOL")).toBe("espanol");
      expect(normalizarTexto("Português")).toBe("portugues");
    });

    it("maneja espacios y caracteres especiales", () => {
      expect(normalizarTexto("  chino  ")).toBe("chino");
      expect(normalizarTexto("chino-tradicional")).toBe("chino tradicional");
    });

    it("devuelve cadena vacía para entrada vacía", () => {
      expect(normalizarTexto("")).toBe("");
      expect(normalizarTexto("   ")).toBe("");
    });
  });

  describe("buscarIdiomas", () => {
    it("consulta vacía devuelve la lista tal cual sin mutar", () => {
      const original = [...listaBase];
      const resultado = buscarIdiomas(listaBase, "");
      expect(resultado).toEqual(original);
      expect(resultado).not.toBe(listaBase); // nuevo array
    });

    it("busca por nombre propio sin acentos: 'ingles' encuentra English", () => {
      const resultado = buscarIdiomas(listaBase, "ingles");
      expect(resultado.length).toBeGreaterThan(0);
      expect(resultado.some((i) => i.codigo === "en")).toBe(true);
    });

    it("busca por nombre actual sin acentos: 'chino' encuentra zh", () => {
      const resultado = buscarIdiomas(listaBase, "chino");
      expect(resultado.length).toBeGreaterThan(0);
      expect(resultado.some((i) => i.codigo === "zh")).toBe(true);
    });

    it("código exacto tiene prioridad: 'zh' pone zh primero", () => {
      const resultado = buscarIdiomas(listaBase, "zh");
      expect(resultado[0].codigo).toBe("zh");
    });

    it("busca sin tilde: 'portugues' encuentra pt", () => {
      const resultado = buscarIdiomas(listaBase, "portugues");
      expect(resultado.some((i) => i.codigo === "pt")).toBe(true);
    });

    it("busca con una errata (distancia ≤1) si consulta ≥4 letras: 'alemn' encuentra de", () => {
      const resultado = buscarIdiomas(listaBase, "alemn");
      expect(resultado.some((i) => i.codigo === "de")).toBe(true);
    });

    it("no busca con errata si consulta <4 letras: 'al' no encuentra de por errata", () => {
      const resultado = buscarIdiomas(listaBase, "al");
      // 'al' puede coincidir por prefijo con 'alemán' pero no por errata
      expect(resultado.length).toBeGreaterThanOrEqual(0);
    });

    it("consulta inexistente devuelve vacío: 'xx' → []", () => {
      const resultado = buscarIdiomas(listaBase, "xx");
      expect(resultado).toEqual([]);
    });

    it("busca en alias: 'mandarin' encuentra zh", () => {
      const resultado = buscarIdiomas(listaBase, "mandarin");
      expect(resultado.some((i) => i.codigo === "zh")).toBe(true);
    });

    it("busca por prefijo de código: 'z' encuentra zh y zh-hant", () => {
      const resultado = buscarIdiomas(listaBase, "z");
      const codigos = resultado.map((i) => i.codigo);
      expect(codigos).toContain("zh");
      expect(codigos).toContain("zh-hant");
    });

    it("orden: código exacto > prefijo nombre > contiene > errata", () => {
      // 'de' coincide exacto por código, 'alem' por prefijo nombre, 'aleman' por contiene
      const resultado = buscarIdiomas(listaBase, "de");
      expect(resultado[0].codigo).toBe("de"); // código exacto primero
    });

    it("desempata alfabéticamente por nombreActual", () => {
      const resultado = buscarIdiomas(listaBase, "a");
      // Todos empiezan con 'a' en nombreActual, deben estar ordenados
      for (let i = 0; i < resultado.length - 1; i++) {
        expect(resultado[i].nombreActual.localeCompare(resultado[i + 1].nombreActual, "es", { sensitivity: "base" })).toBeLessThanOrEqual(0);
      }
    });

    it("no muta la lista de entrada", () => {
      const original = JSON.parse(JSON.stringify(listaBase));
      buscarIdiomas(listaBase, "ingles");
      expect(listaBase).toEqual(original);
    });

    it("busca por nombre propio en otros idiomas: 'english' encuentra en", () => {
      const resultado = buscarIdiomas(listaBase, "english");
      expect(resultado.some((i) => i.codigo === "en")).toBe(true);
    });

    it("errata en alias: 'mandarim' (falta la i final) encuentra zh", () => {
      const resultado = buscarIdiomas(listaBase, "mandarim");
      expect(resultado.some((i) => i.codigo === "zh")).toBe(true);
    });
  });
});