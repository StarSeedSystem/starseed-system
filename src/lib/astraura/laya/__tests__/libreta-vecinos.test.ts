import { describe, it, expect } from "vitest";
import { vecinos, votar, EjemploLibreta } from "../libreta-vecinos";

describe("libreta-vecinos", () => {
  it("un ámbito no ve ejemplos de otro", () => {
    const libreta: EjemploLibreta[] = [
      { punto: "a", ambito: "ambito1", estado: "x", respuesta: "y", desenlaceOk: true },
      { punto: "b", ambito: "ambito2", estado: "x", respuesta: "y", desenlaceOk: true },
    ];
    const res = vecinos(libreta, "x", 10, "ambito1");
    expect(res).toHaveLength(1);
    expect(res[0].ambito).toBe("ambito1");
  });

  it("sin desenlace no vota", () => {
    const libreta: EjemploLibreta[] = [
      { punto: "a", ambito: "ambito1", estado: "x", respuesta: "y", desenlaceOk: null },
    ];
    const res = vecinos(libreta, "x", 10, "ambito1");
    expect(res).toHaveLength(0);
  });

  it("menos de 5 -> null al votar", () => {
    const vecinosList: EjemploLibreta[] = Array(4).fill({
      respuesta: "r",
    });
    const res = votar(vecinosList);
    expect(res).toBeNull();
  });

  it("desenlaceOk null excluido", () => {
    const libreta: EjemploLibreta[] = [
      { punto: "a", ambito: "1", estado: "x", respuesta: "r", desenlaceOk: null },
      { punto: "b", ambito: "1", estado: "x", respuesta: "r", desenlaceOk: true },
    ];
    const res = vecinos(libreta, "x", 10, "1");
    expect(res).toHaveLength(1);
    expect(res[0].punto).toBe("b");
  });

  it("votar requiere apoyo >= 0.6", () => {
    const vecinosList: EjemploLibreta[] = [
      { respuesta: "r1", punto: "", ambito: "", estado: "", desenlaceOk: true },
      { respuesta: "r1", punto: "", ambito: "", estado: "", desenlaceOk: true },
      { respuesta: "r2", punto: "", ambito: "", estado: "", desenlaceOk: true },
      { respuesta: "r2", punto: "", ambito: "", estado: "", desenlaceOk: true },
      { respuesta: "r3", punto: "", ambito: "", estado: "", desenlaceOk: true },
    ];
    // 2/5 = 0.4 < 0.6
    expect(votar(vecinosList)).toBeNull();
  });
});
