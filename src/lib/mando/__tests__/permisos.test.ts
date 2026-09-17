import { describe, it, expect } from "vitest";
import {
  DESARROLLADORES_INICIALES,
  puede,
  rolDe,
  type Capacidad,
  type Mando,
} from "../permisos";

const MANDO: Mando = {
  dueno: "alex@star.seed",
  invitaciones: [
    { correo: "visita@star.seed", vigente: true, capacidades: ["ver"] },
    { correo: "caduca@star.seed", vigente: false, capacidades: ["ver"] },
  ],
};

const TODAS: readonly Capacidad[] = [
  "ver",
  "editar-perfil",
  "lanzar-olas",
  "publicar",
  "editar-codigo",
  "gestionar-accesos",
  "usar-apis",
];

describe("rolDe", () => {
  it("el dueño del Mando es dueño", () => {
    expect(rolDe("alex@star.seed", MANDO, DESARROLLADORES_INICIALES)).toBe(
      "dueño",
    );
  });

  it("maggasukha@star.seed es desarrollador", () => {
    expect(
      rolDe("maggasukha@star.seed", MANDO, DESARROLLADORES_INICIALES),
    ).toBe("desarrollador");
    expect(DESARROLLADORES_INICIALES).toEqual(["maggasukha@star.seed"]);
  });

  it("una invitación vigente es invitado; el resto, ninguno", () => {
    expect(rolDe("visita@star.seed", MANDO, [])).toBe("invitado");
    expect(rolDe("caduca@star.seed", MANDO, [])).toBe("ninguno");
    expect(rolDe("desconocido@star.seed", MANDO, [])).toBe("ninguno");
  });
});

describe("puede", () => {
  it("el dueño puede todo lo suyo", () => {
    for (const c of TODAS) expect(puede("dueño", c)).toBe(true);
  });

  it("un desconocido no puede ni ver", () => {
    expect(puede("ninguno", "ver")).toBe(false);
    for (const c of TODAS) expect(puede("ninguno", c)).toBe(false);
  });

  it("un invitado no puede gestionar accesos ni editar código", () => {
    expect(puede("invitado", "gestionar-accesos", TODAS)).toBe(false);
    expect(puede("invitado", "editar-codigo", ["editar-codigo"])).toBe(false);
    expect(puede("invitado", "ver", ["ver"])).toBe(true);
    expect(puede("invitado", "ver")).toBe(false);
  });

  it("un servicio solo usa APIs", () => {
    expect(puede("servicio", "usar-apis")).toBe(true);
    expect(puede("servicio", "ver")).toBe(false);
    expect(puede("servicio", "gestionar-accesos")).toBe(false);
  });
});
