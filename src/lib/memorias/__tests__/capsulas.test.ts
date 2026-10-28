import { describe, it, expect } from "vitest";
import {
  LIMITE_CAPSULA_BYTES, ROTAR_EN_BYTES, alcanceDe, capsulaDe, capsulasParaContexto, cifradaObligatoria,
  necesitaNuevaParte, nombreCapsula, periodoDe, saneaId, type ContextoCapsulas, type SujetoMemoria,
} from "../capsulas";
import type { ActorMemoria } from "@/lib/nucleo/alcance-memoria";

const F = new Date(Date.UTC(2026, 9, 28)); // 2026T4, fijo para que no dependa del reloj
const U: ActorMemoria = { tipo: "usuario" };

describe("periodoDe", () => {
  it("trimestre AAAATn en UTC", () => {
    expect(periodoDe(F)).toBe("2026T4");
    expect(periodoDe(new Date(Date.UTC(2025, 0, 1)))).toBe("2025T1");
    expect(periodoDe(new Date(Date.UTC(2025, 11, 31)))).toBe("2025T4");
  });
});

describe("saneaId", () => {
  it("quita acentos, espacios y mayúsculas, dejando solo [a-z0-9-]", () => {
    expect(saneaId("Perfil Álex Café_2")).toBe("perfil-alex-cafe-2");
    expect(saneaId("  --Aurora PI  ")).toBe("aurora-pi");
  });

  it("lanza error si el id queda vacío", () => {
    expect(() => saneaId("///")).toThrow("vacío");
  });
});

describe("alcanceDe y cifradaObligatoria", () => {
  const casos: Array<[SujetoMemoria, string]> = [
    [{ tipo: "perfil", id: "a" }, "perfil"], [{ tipo: "grupo", id: "g" }, "grupo"],
    [{ tipo: "pagina", id: "p" }, "publica"], [{ tipo: "comunidad", id: "c" }, "publica"],
    [{ tipo: "personalidad", id: "au" }, "personal"], [{ tipo: "agente", id: "ag" }, "personal"],
    [{ tipo: "bot", id: "b" }, "personal"], [{ tipo: "cerebro", id: "ce" }, "personal"],
    [{ tipo: "capa", id: "ca" }, "personal"], [{ tipo: "agente", id: "ag", grupoId: "g" }, "grupo"],
  ];
  for (const [sujeto, alcance] of casos) {
    it(`«${sujeto.tipo}» tiene alcance «${alcance}»`, () => {
      expect(alcanceDe(sujeto)).toBe(alcance);
    });
  }
  it("cifrado obligatorio solo en personal y perfil", () => {
    expect(cifradaObligatoria("personal")).toBe(true);
    expect(cifradaObligatoria("perfil")).toBe(true);
    expect(cifradaObligatoria("grupo")).toBe(false);
    expect(cifradaObligatoria("publica")).toBe(false);
  });
});

describe("nombreCapsula y capsulaDe", () => {
  it("sin cifrar: .mv2 con parte 1, letras a partir de la 2", () => {
    const pagina: SujetoMemoria = { tipo: "pagina", id: "Mundo Vivo" };
    expect(nombreCapsula(pagina, F)).toBe("pagina-mundo-vivo-2026T4.mv2");
    expect(nombreCapsula(pagina, F, 2)).toBe("pagina-mundo-vivo-2026T4b.mv2");
  });

  it("alcance personal o perfil: .mv2e obligatorio", () => {
    const aurora: SujetoMemoria = { tipo: "personalidad", id: "Aurora" };
    expect(nombreCapsula(aurora, F, 3)).toBe("personalidad-aurora-2026T4c.mv2e");
  });

  it("la parte debe ser un entero entre 1 y 26", () => {
    const s: SujetoMemoria = { tipo: "capa", id: "ca" };
    expect(() => nombreCapsula(s, F, 0)).toThrow("entero entre 1 y 26");
    expect(() => nombreCapsula(s, F, 27)).toThrow("entero entre 1 y 26");
  });

  it("capsulaDe rellena nombre, alcance, cifrada, periodo y parte", () => {
    const c = capsulaDe({ tipo: "perfil", id: "alex" }, F, 2);
    expect(c).toEqual({
      nombre: "perfil-alex-2026T4b.mv2e", sujeto: { tipo: "perfil", id: "alex" },
      alcance: "perfil", cifrada: true, periodo: "2026T4", parte: 2,
    });
  });

  it("prohibido crear una cápsula personal sin cifrar", () => {
    expect(() => capsulaDe({ tipo: "agente", id: "ag" }, F, undefined, false)).toThrow("cifrada");
  });

  it("grupo sin cifra elegida se queda en .mv2", () => {
    const g = capsulaDe({ tipo: "grupo", id: "g1" }, F);
    expect(g.nombre.endsWith(".mv2")).toBe(true);
    expect(g.cifrada).toBe(false);
  });

  it("necesitaNuevaParte rota al giro de 45 MB, no al tope de 50 MB", () => {
    expect(necesitaNuevaParte(ROTAR_EN_BYTES - 1)).toBe(false);
    expect(necesitaNuevaParte(ROTAR_EN_BYTES)).toBe(true);
    expect(LIMITE_CAPSULA_BYTES).toBe(50 * 1024 * 1024);
    expect(ROTAR_EN_BYTES).toBe(45 * 1024 * 1024);
  });
});

describe("capsulasParaContexto", () => {
  const contexto: ContextoCapsulas = {
    perfilId: "alex", personalidadId: "aurora", agenteId: "giro",
    paginaId: "mundo-vivo", grupoId: "hogar", cerebroId: "nucleo-1",
  };

  it("el usuario ve la lista completa, de lo cercano a lo general", () => {
    const tipos = capsulasParaContexto(contexto, U, F).map((c) => c.sujeto.tipo);
    expect(tipos).toEqual(["personalidad", "agente", "cerebro", "perfil", "grupo", "pagina"]);
  });

  it("ignora huecos vacíos del contexto sin romper", () => {
    const tipos = capsulasParaContexto({ perfilId: "alex" }, U, F).map((c) => c.sujeto.tipo);
    expect(tipos).toEqual(["perfil"]);
    expect(capsulasParaContexto({}, U, F)).toEqual([]);
  });

  it("un agente de grupo no ve cápsulas personales ni de perfil", () => {
    const lista = capsulasParaContexto(contexto, { tipo: "agente-grupo", grupoId: "hogar" }, F);
    expect(lista.map((c) => c.sujeto.tipo)).toEqual(["grupo", "pagina"]);
  });
  it("un agente público solo ve lo público", () => {
    const tipos = capsulasParaContexto(contexto, { tipo: "agente-publico" }, F)
      .map((c) => c.sujeto.tipo);
    expect(tipos).toEqual(["pagina"]);
  });
});