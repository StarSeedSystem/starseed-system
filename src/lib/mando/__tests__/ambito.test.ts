import { describe, it, expect } from "vitest";
import {
  AMBITO_LOCAL,
  CAPACIDADES_AMBITO,
  capacidadesDe,
  puedeEnAmbito,
  rolDeFilas,
  type AmbitoMando,
  type CapacidadAmbito,
  type RolAmbito,
} from "../ambito";

const ambitoPersonaPrivado: AmbitoMando = {
  id: "p1",
  tipo: "persona",
  visibilidad: "privado",
  modo_gobierno: "jerarquico",
};

const ambitoEntidadPublicoDem: AmbitoMando = {
  id: "e1",
  tipo: "entidad",
  entidad_tipo: "comunidad",
  entidad_ref: "c1",
  visibilidad: "publico",
  modo_gobierno: "democratico",
};

const ambitoEntidadMiembrosJer: AmbitoMando = {
  id: "e2",
  tipo: "entidad",
  entidad_tipo: "grupo",
  visibilidad: "miembros",
  modo_gobierno: "jerarquico",
};

describe("rolDeFilas", () => {
  it("sin filas → visitante", () => {
    expect(rolDeFilas([])).toBe("visitante");
  });

  it("elige el rol más alto", () => {
    expect(
      rolDeFilas([{ role: "viewer" }, { role: "member" }, { role: "editor" }]),
    ).toBe("editor");
  });

  it("sinónimos", () => {
    expect(rolDeFilas([{ role: "miembro" }])).toBe("member");
    expect(rolDeFilas([{ role: "moderador" }])).toBe("moderator");
  });

  it("pending solo si no hay otro", () => {
    expect(rolDeFilas([{ role: "pending" }])).toBe("pending");
    expect(rolDeFilas([{ role: "pending" }, { role: "viewer" }])).toBe("viewer");
  });

  it("mezcla y mayúsculas", () => {
    expect(
      rolDeFilas([{ role: "Admin" }, { role: "moderator" }, { role: "Miembro" }]),
    ).toBe("admin");
  });
});

describe("capacidadesDe", () => {
  it("persona dueño → todas", () => {
    const caps = capacidadesDe({ ambito: ambitoPersonaPrivado, rol: "dueño" });
    for (const c of CAPACIDADES_AMBITO) {
      expect(caps.has(c)).toBe(true);
    }
  });

  it("entidad owner → todas", () => {
    const caps = capacidadesDe({ ambito: ambitoEntidadMiembrosJer, rol: "owner" });
    for (const c of CAPACIDADES_AMBITO) {
      expect(caps.has(c)).toBe(true);
    }
  });

  it("entidad admin → todas menos administrar", () => {
    const caps = capacidadesDe({ ambito: ambitoEntidadMiembrosJer, rol: "admin" });
    for (const c of CAPACIDADES_AMBITO) {
      if (c === "administrar") {
        expect(caps.has(c)).toBe(false);
      } else {
        expect(caps.has(c)).toBe(true);
      }
    }
  });

  it("moderator/editor → base fija", () => {
    const caps = capacidadesDe({ ambito: ambitoEntidadMiembrosJer, rol: "moderator" });
    const esperadas = new Set<CapacidadAmbito>(["ver-resumen", "ver-detalle", "chatear", "encolar", "aprobar", "frenar"]);
    for (const c of CAPACIDADES_AMBITO) {
      expect(caps.has(c)).toBe(esperadas.has(c));
    }
  });

  it("member/viewer sin encolar", () => {
    const caps = capacidadesDe({ ambito: ambitoEntidadMiembrosJer, rol: "member", miembrosEncolan: false });
    expect(caps.has("ver-resumen")).toBe(true);
    expect(caps.has("ver-detalle")).toBe(true);
    expect(caps.has("chatear")).toBe(true);
    expect(caps.has("encolar")).toBe(false);
  });

  it("member/viewer con encolar", () => {
    const caps = capacidadesDe({ ambito: ambitoEntidadMiembrosJer, rol: "viewer", miembrosEncolan: true });
    expect(caps.has("encolar")).toBe(true);
  });

  it("visitante público → solo ver-resumen", () => {
    const caps = capacidadesDe({ ambito: ambitoEntidadPublicoDem, rol: "visitante" });
    expect(caps.has("ver-resumen")).toBe(true);
    expect(caps.size).toBe(1);
  });

  it("visitante privado → vacío", () => {
    const caps = capacidadesDe({ ambito: ambitoPersonaPrivado, rol: "visitante" });
    expect(caps.size).toBe(0);
  });

  it("pending → vacío siempre", () => {
    const caps = capacidadesDe({ ambito: ambitoEntidadPublicoDem, rol: "pending" });
    expect(caps.size).toBe(0);
  });

  it("democrático sin aprobación → quita lanzar-olas, publicar, gestionar-motores, usar-apis", () => {
    const caps = capacidadesDe({ ambito: ambitoEntidadPublicoDem, rol: "owner", aprobadas: [] });
    expect(caps.has("lanzar-olas")).toBe(false);
    expect(caps.has("publicar")).toBe(false);
    expect(caps.has("gestionar-motores")).toBe(false);
    expect(caps.has("usar-apis")).toBe(false);
    expect(caps.has("frenar")).toBe(true);
  });

  it("democrático con aprobación → conserva capacidades", () => {
    const aprov: CapacidadAmbito[] = ["lanzar-olas", "publicar", "gestionar-motores", "usar-apis"];
    const caps = capacidadesDe({ ambito: ambitoEntidadPublicoDem, rol: "admin", aprobadas: aprov });
    for (const c of aprov) expect(caps.has(c)).toBe(true);
    expect(caps.has("administrar")).toBe(false);
  });

  it("frenar de admin democrático sin aprobación → sí", () => {
    const caps = capacidadesDe({ ambito: ambitoEntidadPublicoDem, rol: "admin", aprobadas: [] });
    expect(caps.has("frenar")).toBe(true);
  });

  it("delegado solo delegadas sin gestionar-accesos ni administrar", () => {
    const delegadas: CapacidadAmbito[] = ["ver-resumen", "chatear", "gestionar-accesos", "administrar"];
    const caps = capacidadesDe({ ambito: ambitoPersonaPrivado, rol: "delegado", delegadas });
    expect(caps.has("ver-resumen")).toBe(true);
    expect(caps.has("chatear")).toBe(true);
    expect(caps.has("gestionar-accesos")).toBe(false);
    expect(caps.has("administrar")).toBe(false);
  });
});

describe("puedeEnAmbito", () => {
  it("visitante en privado no puede ver-resumen", () => {
    expect(
      puedeEnAmbito({ ambito: ambitoPersonaPrivado, rol: "visitante" }, "ver-resumen"),
    ).toBe(false);
  });

  it("dueño puede todo", () => {
    for (const c of CAPACIDADES_AMBITO) {
      expect(puedeEnAmbito({ ambito: ambitoPersonaPrivado, rol: "dueño" }, c)).toBe(true);
    }
  });
});

describe("constantes", () => {
  it("AMBITO_LOCAL correcto", () => {
    expect(AMBITO_LOCAL).toEqual({
      id: "local",
      tipo: "persona",
      visibilidad: "privado",
      modo_gobierno: "jerarquico",
    });
  });

  it("CAPACIDADES_AMBITO orden", () => {
    expect(CAPACIDADES_AMBITO).toEqual([
      "ver-resumen",
      "ver-detalle",
      "chatear",
      "encolar",
      "aprobar",
      "lanzar-olas",
      "usar-apis",
      "publicar",
      "gestionar-motores",
      "gestionar-accesos",
      "frenar",
      "administrar",
    ]);
  });
});
