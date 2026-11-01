// src/lib/variaciones/__tests__/sugerir-astraura.test.ts
// Pruebas del sugeridor con un modelo falso (enrutador inyectado): sin red y sin disco.
import { describe, it, expect } from "vitest";
import { sugerirVariaciones, type AdnContexto, type PeticionAstraura } from "../sugerir-astraura";

const adn: AdnContexto = {
  meta: { slug: "starseed-os" },
  paleta: [
    { rol: "zenith", hex: "#007FFF" },
    { rol: "horizonte", hex: "#10B981" },
  ],
  pruebas: [
    { id: "p1", comprobacion: "contraste >=4.5:1", auto: true },
    { id: "p2", comprobacion: "max 3 tamanos", auto: true },
    { id: "p3", comprobacion: "sin neon", auto: true },
    { id: "p9", comprobacion: "jugada rara 1 vez", auto: false },
  ],
};

describe("sugerirVariaciones", () => {
  it("devuelve solo las que pasan el validador y el ADN, con su motivo", async () => {
    const enrutar = async () => [
      { titulo: "Cristal sereno", descripcion: "Ajuste suave", payload: { colores: ["#007FFF"], contraste: 5.2, tamanos: ["1rem"], neon: false } },
      { titulo: "Con secreto", payload: { password: "sk-1234567890abcdef" } },
      { titulo: "Contraste bajo", payload: { colores: ["#007FFF"], contraste: 2 } },
    ];
    const resultado = await sugerirVariaciones(
      "tema:cristal",
      { payloadCapturado: {}, adn },
      { enrutar, ahora: () => new Date("2026-11-01T00:00:00Z") },
    );
    expect(resultado).toHaveLength(1);
    expect(resultado[0].titulo).toBe("Cristal sereno");
    expect(resultado[0].motivo).toContain("starseed-os");
    expect(resultado[0].motivo).toContain("p1");
    expect(resultado[0].creada).toBe("2026-11-01T00:00:00.000Z");
  });

  it("pide tres variaciones con la clave, la familia y el payload capturado", async () => {
    let recibida: PeticionAstraura | null = null;
    const enrutar = async (peticion: PeticionAstraura) => {
      recibida = peticion;
      return [];
    };
    const payload = { colores: ["#007FFF"] };
    await sugerirVariaciones("widget:clima", { payloadCapturado: payload, adn }, { enrutar });
    expect(recibida).toEqual({ clave: "widget:clima", familia: "widget", payloadCapturado: payload, adn, cantidad: 3 });
  });

  it("no llama al enrutador si la clave no es canónica", async () => {
    let llamadas = 0;
    const enrutar = async () => {
      llamadas += 1;
      return [];
    };
    const resultado = await sugerirVariaciones("clima", { payloadCapturado: {} }, { enrutar });
    expect(resultado).toEqual([]);
    expect(llamadas).toBe(0);
  });

  it("rechaza colores fuera de la paleta y no bloquea por pruebas no medibles", async () => {
    const enrutar = async () => [
      { titulo: "Fuera", payload: { colores: ["#FF00AA"], contraste: 6 } },
      { titulo: "Dentro", payload: { colores: ["#10B981"], contraste: 6 } },
    ];
    const resultado = await sugerirVariaciones("fondo:aurora", { payloadCapturado: {}, adn }, { enrutar });
    expect(resultado.map((v) => v.titulo)).toEqual(["Dentro"]);
    expect(resultado[0].motivo).toContain("p1");
  });

  it("marca como aislada una variación de una familia de código", async () => {
    const enrutar = async () => [{ titulo: "Átomo", payload: { html: "<p>hola</p>" } }];
    const resultado = await sugerirVariaciones("atomo:video-html", { payloadCapturado: {} }, { enrutar });
    expect(resultado).toHaveLength(1);
    expect(resultado[0].requiereAislamiento).toBe(true);
  });

  it("devuelve una lista vacía si el enrutador falla", async () => {
    const enrutar = async () => {
      throw new Error("sin cuota");
    };
    expect(await sugerirVariaciones("tema:cristal", { payloadCapturado: {} }, { enrutar })).toEqual([]);
  });

  it("no considera más de tres candidatas", async () => {
    const enrutar = async () =>
      Array.from({ length: 5 }, (_, i) => ({ titulo: `V${i}`, payload: { colores: ["#007FFF"] } }));
    const resultado = await sugerirVariaciones("tema:cristal", { payloadCapturado: {}, adn }, { enrutar });
    expect(resultado).toHaveLength(3);
  });
});
