/** Pruebas de la fusión por rango recíproco de recuerdos (LNN1028A). */
import { describe, expect, it } from "vitest";

import { fundirRecuerdos, pesoVectorPara, type Recuerdo } from "../fusion-recuerdos";

/** Recuerdo de prueba: solo lo que hace falta en cada caso. */
function recuerdo(parte: Partial<Recuerdo> & { texto: string; fuente: Recuerdo["fuente"] }): Recuerdo {
  return { uri: "", alcance: "perfil", ...parte };
}

describe("fundirRecuerdos", () => {
  it("un recuerdo en las dos listas sube: suma rangos y junta las fuentes", () => {
    const enMemvid = recuerdo({ uri: "mv2://cafe", texto: "planes del café", fuente: "memvid" });
    const enLeann = recuerdo({
      uri: "mv2://cafe",
      texto: "planes del café del martes",
      fuente: "leann",
      puntuacion: 0.92,
    });
    const otro = recuerdo({ uri: "mv2://otro", texto: "la compra del sábado", fuente: "memvid" });
    const salida = fundirRecuerdos([[enMemvid, otro], [enLeann]]);
    expect(salida).toHaveLength(2);
    expect(salida[0].uri).toBe("mv2://cafe");
    // El texto más largo gana el dedupe y conserva sus propios campos.
    expect(salida[0].texto).toBe("planes del café del martes");
    expect(salida[0].titulo).toBeUndefined();
    expect(salida[0].fuentes).toEqual(["memvid", "leann"]);
    // Rango 1 en las dos listas: 1/(60+1) + 1/(60+1).
    expect(salida[0].puntuacion).toBeCloseTo(2 / 61, 5);
    expect(salida[1].uri).toBe("mv2://otro");
    expect(salida[1].puntuacion).toBeCloseTo(1 / 62, 5);
  });

  it("sin uri, la huella del texto hace de clave y también funde", () => {
    const porPalabras = recuerdo({ texto: "planes del café", fuente: "memvid" });
    const porSignificado = recuerdo({ texto: "planes del café", fuente: "leann" });
    const salida = fundirRecuerdos([[porPalabras], [porSignificado]]);
    expect(salida).toHaveLength(1);
    expect(salida[0].fuentes).toEqual(["memvid", "leann"]);
    // Dos textos distintos sin uri NO se funden entre sí.
    const c = recuerdo({ texto: "la compra del sábado", fuente: "memvid" });
    const d = recuerdo({ texto: "otra cosa completamente distinta", fuente: "leann" });
    expect(fundirRecuerdos([[c], [d]])).toHaveLength(2);
  });

  it("listas vacías o recuerdos sin texto salen como lista vacía", () => {
    expect(fundirRecuerdos([])).toEqual([]);
    expect(fundirRecuerdos([[], []])).toEqual([]);
    const vacio = recuerdo({ texto: "", fuente: "memvid" });
    const bueno = recuerdo({ texto: "algo que sí cuenta", fuente: "memvid" });
    expect(fundirRecuerdos([[vacio, bueno]])).toHaveLength(1);
  });

  it("corta por max y por maxCaracteres", () => {
    const lista = ["uno", "dos", "tres", "cuatro", "cinco", "seis", "siete"].map((t, i) =>
      recuerdo({ uri: `mv2://${i}`, texto: t, fuente: "memvid" }),
    );
    expect(fundirRecuerdos([lista], { max: 3 })).toHaveLength(3);
    // Presupuesto total 6: «uno» y «dos» caben (3 + 3); «tres» ya no entra.
    const salida = fundirRecuerdos([lista], { maxCaracteres: 6 });
    expect(salida.map((r) => r.texto)).toEqual(["uno", "dos"]);
    // El primero entra siempre aunque el presupuesto se quede corto.
    const forzado = fundirRecuerdos([lista], { maxCaracteres: 1 });
    expect(forzado.map((r) => r.texto)).toEqual(["uno"]);
  });
});

describe("pesoVectorPara", () => {
  it("0,7 por defecto: la consulta pregunta por significado", () => {
    expect(pesoVectorPara("¿qué decidimos de la cafetería?")).toBe(0.7);
    expect(pesoVectorPara("")).toBe(0.7);
  });

  it("0,4 con comillas: se buscan palabras literales", () => {
    expect(pesoVectorPara('"planes del café"')).toBe(0.4);
  });

  it("0,4 con un nombre propio a mitad de la consulta", () => {
    expect(pesoVectorPara("qué dijo Alex del café")).toBe(0.4);
    expect(pesoVectorPara("resumen de la reunión de Madrid")).toBe(0.4);
  });
});
