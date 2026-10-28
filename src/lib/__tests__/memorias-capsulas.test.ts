import { describe, it, expect } from "vitest";

import {
  LIMITE_CAPSULA_BYTES,
  ROTAR_EN_BYTES,
  alcanceDe,
  capsulaDe,
  capsulasParaContexto,
  cifradaObligatoria,
  necesitaNuevaParte,
  nombreCapsula,
  periodoDe,
  saneaId,
  type CapsulaMemoria,
  type ContextoCapsulas,
  type TipoSujeto,
} from "@/lib/memorias/capsulas";

// MVD1027A (2026-10-27): cada sujeto lleva su memoria en cápsulas Memvid con el alcance
// de alcance-memoria (personal › perfil › grupo › pública). Blindaje: el nombre saneado
// es el archivo que abre el servidor; el tope de 50 MB no se roza, se reparte en partes;
// el filtro por actor impide listar cápsulas más privadas que la cuenta del que pregunta.

const F = new Date(Date.UTC(2026, 9, 27)); // 4.º trimestre de 2026
const NOMBRES = (cs: CapsulaMemoria[]) => cs.map((c) => c.nombre);

describe("alcance y cifrado de cada sujeto", () => {
  it.each([
    ["perfil", "perfil"], ["personalidad", "personal"], ["agente", "personal"],
    ["bot", "personal"], ["cerebro", "personal"], ["capa", "personal"],
    ["pagina", "publica"], ["comunidad", "publica"], ["grupo", "grupo"],
  ])("%s lleva su cápsula de alcance «%s»", (tipo, alcance) => {
    expect(alcanceDe({ tipo: tipo as TipoSujeto, id: "s1" })).toBe(alcance);
  });

  it("un agente o bot al servicio de un grupo comparte alcance de grupo", () => {
    expect(alcanceDe({ tipo: "agente", id: "f", grupoId: "luna" })).toBe("grupo");
    expect(alcanceDe({ tipo: "bot", id: "r", grupoId: "luna" })).toBe("grupo");
  });
  it("personal y perfil van cifradas siempre; grupo y pública, por elección", () => {
    expect(cifradaObligatoria("personal")).toBe(true);
    expect(cifradaObligatoria("perfil")).toBe(true);
    expect(cifradaObligatoria("grupo")).toBe(false);
    expect(cifradaObligatoria("publica")).toBe(false);
  });
});
describe("nombres de cápsula", () => {
  it("sanea el id y nombra solo el archivo .mv2/.mv2e que abre el servidor", () => {
    expect(saneaId("Perfil Álex Café_2")).toBe("perfil-alex-cafe-2");
    expect([periodoDe(F), periodoDe(new Date(Date.UTC(2026, 0, 15)))]).toEqual(["2026T4", "2026T1"]);
    expect(nombreCapsula({ tipo: "personalidad", id: "Aurora Nova" }, F))
      .toBe("personalidad-aurora-nova-2026T4.mv2e");
    expect(nombreCapsula({ tipo: "perfil", id: "alex" }, F, 1)).toBe("perfil-alex-2026T4.mv2e");
    expect(nombreCapsula({ tipo: "pagina", id: "claustro" }, F, 1)).toBe("pagina-claustro-2026T4.mv2");
    expect(nombreCapsula({ tipo: "pagina", id: "claustro" }, F, 2)).toBe("pagina-claustro-2026T4b.mv2");
    expect(nombreCapsula({ tipo: "pagina", id: "claustro" }, F, 3)).toBe("pagina-claustro-2026T4c.mv2");
    expect(nombreCapsula({ tipo: "pagina", id: "claustro" }, F, 1, true)).toBe("pagina-claustro-2026T4.mv2e");
  });
  it("avisa ante un id que queda vacío y ante una parte que no existe", () => {
    expect(() => saneaId("///")).toThrow();
    expect(() => nombreCapsula({ tipo: "pagina", id: "x" }, F, 0)).toThrow();
    expect(() => nombreCapsula({ tipo: "pagina", id: "x" }, F, 27)).toThrow();
  });
});

describe("cápsula entera y límites", () => {
  it("rinde nombre, sujeto, alcance, cifrado, período y parte", () => {
    expect(capsulaDe({ tipo: "grupo", id: "luna" }, F, 2)).toEqual({
      nombre: "grupo-luna-2026T4b.mv2",
      sujeto: { tipo: "grupo", id: "luna" },
      alcance: "grupo", cifrada: false, periodo: "2026T4", parte: 2,
    });
    expect(capsulaDe({ tipo: "personalidad", id: "ania" }, F).cifrada).toBe(true);
    expect(() => capsulaDe({ tipo: "perfil", id: "x" }, F, 1, false)).toThrow();
  });

  it("50 MB de tope y 45 de giro: al llegar al giro se abre la parte siguiente", () => {
    expect(LIMITE_CAPSULA_BYTES).toBe(52_428_800);
    expect(ROTAR_EN_BYTES).toBe(47_185_920);
    expect(ROTAR_EN_BYTES).toBeLessThan(LIMITE_CAPSULA_BYTES);
    expect(necesitaNuevaParte(0)).toBe(false);
    expect(necesitaNuevaParte(ROTAR_EN_BYTES - 1)).toBe(false);
    expect(necesitaNuevaParte(ROTAR_EN_BYTES)).toBe(true);
    expect(necesitaNuevaParte(LIMITE_CAPSULA_BYTES)).toBe(true);
  });
});

describe("cápsulas que se consultan en un contexto", () => {
  const CX: ContextoCapsulas = {
    perfilId: "alex", personalidadId: "aurora nova", agenteId: "faro-1",
    paginaId: "claustro", grupoId: "luna", cerebroId: "neurona-1",
  };

  it("para la persona dueña lista todo, de lo más cercano a lo más general", () => {
    expect(NOMBRES(capsulasParaContexto(CX, { tipo: "usuario" }, F))).toEqual([
      "personalidad-aurora-nova-2026T4.mv2e",
      "agente-faro-1-2026T4.mv2e",
      "cerebro-neurona-1-2026T4.mv2e",
      "perfil-alex-2026T4.mv2e",
      "grupo-luna-2026T4.mv2",
      "pagina-claustro-2026T4.mv2",
    ]);
  });

  it("un agente de grupo o público no lista cápsulas personales y de perfil", () => {
    expect(NOMBRES(capsulasParaContexto(CX, { tipo: "agente-grupo", grupoId: "luna" }, F)))
      .toEqual(["grupo-luna-2026T4.mv2", "pagina-claustro-2026T4.mv2"]);
    expect(NOMBRES(capsulasParaContexto(CX, { tipo: "agente-publico" }, F)))
      .toEqual(["pagina-claustro-2026T4.mv2"]);
  });

  it("sin sujetos, o con ids vacíos, no inventa cápsulas", () => {
    expect(capsulasParaContexto({}, { tipo: "usuario" }, F)).toEqual([]);
    expect(capsulasParaContexto(
      { ...CX, personalidadId: "  ", grupoId: "" }, { tipo: "usuario" }, F,
    )).toHaveLength(4);
  });
});
