import { describe, it, expect } from "vitest";
import {
  fundirRecuerdos,
  pesoVectorPara,
  type Recuerdo,
} from "../fusion-recuerdos";

function recuerdo(parcial: Partial<Recuerdo> & { texto: string }): Recuerdo {
  return {
    uri: parcial.uri ?? "",
    texto: parcial.texto,
    titulo: parcial.titulo,
    ts: parcial.ts,
    fuente: parcial.fuente ?? "memvid",
    puntuacion: parcial.puntuacion,
    alcance: parcial.alcance ?? "personal",
  };
}

function largoTexto(): string {
  return "recuerdo largo de treinta y tantos caracteres";
}

describe("fundirRecuerdos", () => {
  it("un recuerdo visto por ambas listas sube por encima de los vistos una vez", () => {
    const duplicado = recuerdo({ uri: "mv:1", texto: "planes del café" });
    const soloMemvid = recuerdo({ uri: "mv:2", texto: "otra cosa" });
    const soloLeann = recuerdo({ uri: "ln:9", texto: "distinto todo", fuente: "leann" });
    const salida = fundirRecuerdos([
      [duplicado, soloMemvid],
      [soloLeann, duplicado],
    ]);
    expect(salida[0]?.uri).toBe("mv:1");
    expect(salida).toHaveLength(3);
    const marcado = salida.find((r) => r.fuente === "leann");
    expect(marcado?.uri).toBe("ln:9");
  });

  it("deduplica por uri y conservando el texto más largo", () => {
    const corto = recuerdo({ uri: "mv:1", texto: "café breve" });
    const largo = recuerdo({
      uri: "mv:1",
      texto: "café breve con todos los detalles del plan",
      ts: 7,
    });
    const salida = fundirRecuerdos([[corto], [largo]]);
    expect(salida).toHaveLength(1);
    expect(salida[0]?.texto).toContain("detalles");
    expect(salida[0]?.ts).toBe(7);
  });

  it("sin uri funde por la huella del texto", () => {
    const a = recuerdo({ texto: "Plan del café de mañana" });
    const b = recuerdo({ texto: "plan del café de mañana", fuente: "leann" });
    const otro = recuerdo({ texto: "otra cosa" });
    const salida = fundirRecuerdos([[a], [b, otro]]);
    expect(salida).toHaveLength(2);
    expect(salida[0]?.texto).toBe("Plan del café de mañana");
  });

  it("corta por max y por maxCaracteres", () => {
    const muchas = [1, 2, 3, 4, 5, 6, 7].map((n) =>
      recuerdo({ uri: `mv:${n}`, texto: `texto ${n}` }),
    );
    expect(fundirRecuerdos([muchas])).toHaveLength(6);
    const largas = ["x", largoTexto(), largoTexto(), largoTexto()].map((texto, n) =>
      recuerdo({ uri: `mv:${n}`, texto }),
    );
    const salida = fundirRecuerdos([largas], { maxCaracteres: 40 });
    expect(salida.length).toBeLessThan(4);
    let total = 0;
    for (const r of salida) total += r.texto.length;
    expect(total).toBeLessThanOrEqual(40);
  });
});

describe("pesoVectorPara", () => {
  it("0,7 por defecto", () => {
    expect(pesoVectorPara("¿que dije de la cafeteria?")).toBe(0.7);
  });
  it("0,4 con comillas: manda la frase exacta", () => {
    expect(pesoVectorPara("busca «planes del café»")).toBe(0.4);
  });
  it("0,4 con nombre propio (no cuenta el primer vocablo)", () => {
    expect(pesoVectorPara("¿que dijo Manuel del café?")).toBe(0.4);
  });
  it("0,4 con acrónimo en mayúsculas", () => {
    expect(pesoVectorPara("que dijo el equipo de NASA")).toBe(0.4);
  });
});
