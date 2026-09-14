import { describe, it, expect } from "vitest";

import {
  ETAPAS,
  TOPES_MIN,
  etapaDeFase,
  pasoDeTarea,
  resumenEtapas,
} from "../etapas";

const AHORA = 1_800_000_000_000; // marca fija: el reloj nunca entra solo
const haceMin = (min: number) => AHORA - min * 60000;

describe("etapaDeFase", () => {
  it("traduce las fases del latido del orquestador", () => {
    expect(etapaDeFase("escribiendo")).toBe("escribiendo");
    expect(etapaDeFase("completando")).toBe("escribiendo");
    expect(etapaDeFase("tsc")).toBe("verificando");
    expect(etapaDeFase("revision")).toBe("revisando");
    expect(etapaDeFase("esperando aprobación")).toBe("visto bueno");
    expect(etapaDeFase("commit")).toBe("integrada");
    expect(etapaDeFase("hecho")).toBe("integrada");
  });

  it("traduce los estados de progreso.json", () => {
    expect(etapaDeFase("", "esperando_aprobacion")).toBe("visto bueno");
    expect(etapaDeFase("", "commit")).toBe("integrada");
    expect(etapaDeFase("", "hecho")).toBe("integrada");
  });

  it("devuelve null ante una fase desconocida, sin inventarse la etapa", () => {
    expect(etapaDeFase("cocinando")).toBeNull();
    expect(etapaDeFase("")).toBeNull();
  });
});

describe("pasoDeTarea", () => {
  it("calcula el porcentaje de la primera y la última etapa", () => {
    const primera = pasoDeTarea(
      { id: "a", fase: "escribiendo", minutosDesde: haceMin(1) },
      AHORA,
    );
    const ultima = pasoDeTarea(
      { id: "b", fase: "hecho", minutosDesde: haceMin(1) },
      AHORA,
    );
    expect(primera?.porcentaje).toBe(Math.round((1 / 6) * 100));
    expect(ultima?.porcentaje).toBe(100);
  });

  it("147 min en «visto bueno» sale atascada y el detalle nombra los minutos", () => {
    const paso = pasoDeTarea(
      { id: "p318J", estado: "esperando_aprobacion", fase: "", minutosDesde: haceMin(147) },
      AHORA,
    );
    expect(paso?.desenlace).toBe("atascada");
    expect(paso?.etapa).toBe("visto bueno");
    expect(paso?.minutosEnEtapa).toBe(147);
    expect(paso?.detalle).toContain("147");
    expect(paso?.detalle).toContain("visto bueno");
  });

  it("una rechazada sale parada", () => {
    const paso = pasoDeTarea(
      { id: "r1", fase: "escribiendo", estado: "rechazada", minutosDesde: haceMin(3) },
      AHORA,
    );
    expect(paso?.desenlace).toBe("parada");
  });

  it("una commit sale integrada al 100 %", () => {
    const paso = pasoDeTarea(
      { id: "c1", fase: "commit", minutosDesde: haceMin(2) },
      AHORA,
    );
    expect(paso?.desenlace).toBe("integrada");
    expect(paso?.porcentaje).toBe(100);
    expect(paso?.etapa).toBe("integrada");
  });

  it("una tarea bajo el tope queda en marcha con modelo y minutos en el detalle", () => {
    const paso = pasoDeTarea(
      { id: "w1", fase: "escribiendo", modelo: "kimi-k3", minutosDesde: haceMin(4) },
      AHORA,
    );
    expect(paso?.desenlace).toBe("en marcha");
    expect(paso?.detalle).toBe("escribiendo con kimi-k3 (4 min)");
  });

  it("respeta los topes por etapa", () => {
    for (const [etapa, fase] of [
      ["escribiendo", "escribiendo"],
      ["verificando", "tsc"],
      ["revisando", "revision"],
    ] as const) {
      const tope = TOPES_MIN[etapa];
      const bajo = pasoDeTarea({ id: "x", fase, minutosDesde: haceMin(tope) }, AHORA);
      const sobre = pasoDeTarea({ id: "x", fase, minutosDesde: haceMin(tope + 1) }, AHORA);
      expect(bajo?.desenlace).toBe("en marcha");
      expect(sobre?.desenlace).toBe("atascada");
    }
  });

  it("un fallo_* sale parada", () => {
    const paso = pasoDeTarea(
      { id: "f1", fase: "tsc", estado: "fallo_tsc", minutosDesde: haceMin(1) },
      AHORA,
    );
    expect(paso?.desenlace).toBe("parada");
  });

  it("entrada vacía o ilegible devuelve null sin lanzar", () => {
    expect(pasoDeTarea({}, AHORA)).toBeNull();
    expect(pasoDeTarea({ id: 42, fase: "escribiendo" }, AHORA)).toBeNull();
    expect(pasoDeTarea({ id: "ok", fase: "misterio" }, AHORA)).toBeNull();
  });
});

describe("resumenEtapas", () => {
  it("cuenta por etapa, atascadas y en marcha con una mezcla", () => {
    const pasos = [
      pasoDeTarea({ id: "1", fase: "escribiendo", minutosDesde: haceMin(2) }, AHORA),
      pasoDeTarea({ id: "2", fase: "escribiendo", minutosDesde: haceMin(99) }, AHORA),
      pasoDeTarea({ id: "3", estado: "esperando_aprobacion", fase: "", minutosDesde: haceMin(147) }, AHORA),
      pasoDeTarea({ id: "4", fase: "commit", minutosDesde: haceMin(1) }, AHORA),
      pasoDeTarea({ id: "5", fase: "tsc", minutosDesde: haceMin(1) }, AHORA),
    ].filter((p): p is NonNullable<typeof p> => p !== null);

    const r = resumenEtapas(pasos);
    expect(r.porEtapa.escribiendo).toBe(2);
    expect(r.porEtapa["visto bueno"]).toBe(1);
    expect(r.porEtapa.integrada).toBe(1);
    expect(r.porEtapa.verificando).toBe(1);
    expect(r.porEtapa.probando).toBe(0);
    expect(r.atascadas).toBe(2);
    expect(r.enMarcha).toBe(2);
  });

  it("con lista vacía todo queda a cero", () => {
    const r = resumenEtapas([]);
    expect(r.atascadas).toBe(0);
    expect(r.enMarcha).toBe(0);
    for (const etapa of ETAPAS) expect(r.porEtapa[etapa]).toBe(0);
  });
});
