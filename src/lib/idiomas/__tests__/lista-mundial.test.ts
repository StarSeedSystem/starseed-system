import { describe, it, expect } from "vitest";
import { listaMundial, agrupar, DisplayNamesLike } from "../lista-mundial";
import { IDIOMAS } from "../idiomas";
import { MAS_HABLADOS } from "../tabla-iso";

const crearDisplayNamesFalso = (nombres: Record<string, string>): DisplayNamesLike => ({
  of: (code: string) => (nombres[code.toLowerCase()] ? nombres[code.toLowerCase()] : undefined),
});

describe("listaMundial", () => {
  it("omite códigos que Intl no puede nombrar", () => {
    const displayNames = crearDisplayNamesFalso({});
    const resultado = listaMundial({ idiomaActual: "es", displayNames });
    const codigos = resultado.map((i) => i.codigo);
    expect(codigos).not.toContain("aa");
    expect(codigos).not.toContain("ae");
  });

  it("devuelve los 36 idiomas actuales cuando Intl no resuelve", () => {
    const displayNames: DisplayNamesLike = {
      of: (code: string) => {
        const mapa: Record<string, string> = {
          es: "Español", en: "English", pt: "Português", fr: "Français", de: "Deutsch",
          it: "Italiano", nl: "Nederlands", ca: "Català", gl: "Galego", eu: "Euskara",
          ru: "Русский", uk: "Українська", pl: "Polski", tr: "Türkçe", ar: "العربية",
          he: "עברית", fa: "فارسی", ur: "اردو", hi: "हिन्दी", bn: "বাংলা",
          zh: "简体中文", "zh-hant": "繁體中文", ja: "日本語", ko: "한국어", th: "ไทย",
          vi: "Tiếng Việt", id: "Bahasa Indonesia", sw: "Kiswahili", el: "Ελληνικά",
          sv: "Svenska", cs: "Čeština", ro: "Română", hu: "Magyar", fi: "Suomi",
          da: "Dansk", "nb": "Norsk bokmål",
        };
        return mapa[code.toLowerCase()] ?? code;
      },
    };
    const resultado = listaMundial({ idiomaActual: "es", displayNames });
    const codigosResultado = resultado.map((i) => i.codigo);
    const codigosActuales = IDIOMAS.map((i) => i.codigo);
    expect(codigosResultado.sort()).toEqual(codigosActuales.sort());
  });

  it("ordena alfabéticamente en español", () => {
    const displayNames: DisplayNamesLike = {
      of: (code: string) => (code === "es" ? "Español" : code === "en" ? "English" : code),
    };
    const resultado = listaMundial({ idiomaActual: "es", displayNames });
    const nombres = resultado.map((i) => i.nombreActual);
    const ordenado = [...nombres].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
    expect(nombres).toEqual(ordenado);
  });

  it("ordena alfabéticamente en inglés", () => {
    const displayNames: DisplayNamesLike = {
      of: (code: string) => (code === "es" ? "Spanish" : code === "en" ? "English" : code),
    };
    const resultado = listaMundial({ idiomaActual: "en", displayNames });
    const nombres = resultado.map((i) => i.nombreActual);
    const ordenado = [...nombres].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
    expect(nombres).toEqual(ordenado);
  });

  it("los ordenes en es e en son distintos", () => {
    const displayNames: DisplayNamesLike = {
      of: (code: string) => {
        if (code === "es") return "español";
        if (code === "en") return "english";
        return code;
      },
    };
    const collatorEs = { compare: (a: string, b: string) => a.localeCompare(b, "es", { sensitivity: "base" }) };
    const collatorEn = { compare: (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" }) };
    const resultadoEs = listaMundial({ idiomaActual: "es", displayNames, collator: collatorEs });
    const resultadoEn = listaMundial({ idiomaActual: "en", displayNames, collator: collatorEn });
    const nombresEs = resultadoEs.map((i) => i.nombreActual);
    const nombresEn = resultadoEn.map((i) => i.nombreActual);
    const ordenEs = [...nombresEs].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
    const ordenEn = [...nombresEn].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
    expect(nombresEs).toEqual(ordenEs);
    expect(nombresEn).toEqual(ordenEn);
  });

  it("marca correctamente los idiomas más hablados", () => {
    const resultado = listaMundial({ idiomaActual: "es" });
    const codigosMasHablados = resultado.filter((i) => i.masHablado).map((i) => i.codigo);
    expect(codigosMasHablados).toContain("zh");
    expect(codigosMasHablados).toContain("es");
    expect(codigosMasHablados).toContain("en");
    MAS_HABLADOS.forEach((codigo) => {
      expect(codigosMasHablados).toContain(codigo);
    });
  });

  it("marca dir rtL para árabe y otros RTL", () => {
    const resultado = listaMundial({ idiomaActual: "es" });
    const arabe = resultado.find((i) => i.codigo === "ar");
    expect(arabe?.dir).toBe("rtl");
  });

  it("incluye todos los 36 idiomas actuales", () => {
    const displayNames: DisplayNamesLike = { of: () => "Nombre" };
    const resultado = listaMundial({ idiomaActual: "es", displayNames });
    const codigosResultado = resultado.map((i) => i.codigo);
    IDIOMAS.forEach((i) => {
      expect(codigosResultado).toContain(i.codigo);
    });
  });

  it("asigna alias correctamente", () => {
    const displayNames: DisplayNamesLike = { of: () => "Nombre" };
    const resultado = listaMundial({ idiomaActual: "es", displayNames });
    const chino = resultado.find((i) => i.codigo === "zh");
    expect(chino?.alias).toContain("chino");
    expect(chino?.alias).toContain("mandarín");
    const espanol = resultado.find((i) => i.codigo === "es");
    expect(espanol?.alias).toContain("español");
    expect(espanol?.alias).toContain("castellano");
  });
});

describe("agrupar", () => {
  it("devuelve la lista completa en todos", () => {
    const lista = listaMundial({ idiomaActual: "es" });
    expect(agrupar(lista).todos).toEqual(lista);
  });

  it("filtra solo los más hablados", () => {
    const agrupada = agrupar(listaMundial({ idiomaActual: "es" }));
    agrupada.masHablados.forEach((i) => expect(i.masHablado).toBe(true));
  });
});