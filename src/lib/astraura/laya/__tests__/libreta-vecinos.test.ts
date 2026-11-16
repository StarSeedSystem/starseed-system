import { describe, it, expect } from "vitest";
import { huellaPalabras, similitud, vecinos, votar, MIN_VECINOS, POSICIONES_HUELLAS, UMBRAL_APOYO,
  type EjemploLibreta, type VecinoLibreta } from "@/lib/astraura/laya/libreta-vecinos";

// Vecinos más cercanos de la libreta por ámbito (tarea JLA1116A · architecture/jev-entrena-laya.md §3).
// Solo funciones puras: sin red, sin disco, sin reloj y sin modelo.

const ESTADO = "publicación sospechosa en el grupo de la comunidad";

const ejemplo = (extra: Partial<EjemploLibreta> = {}): EjemploLibreta => ({
  punto: "publicar.moderar", ambito: "pagina", estado: ESTADO, respuesta: "revisar", desenlaceOk: true, ...extra,
});

const vecino = (respuesta: string, extra: Partial<EjemploLibreta> = {}, peso = 1): VecinoLibreta => ({
  ejemplo: ejemplo({ respuesta, ...extra }), similitud: peso,
});
describe("huellaPalabras", () => {
  it("normaliza: mayúsculas y acentos dan la misma huella", () => {
    expect(huellaPalabras("Publicación Sospechosa")).toEqual(huellaPalabras("publicacion sospechosa"));
  });

  it("reparte las palabras en 256 posiciones como mucho", () => {
    const largo = Array.from({ length: 400 }, (_, i) => `palabra${i}`).join(" ");
    expect(Object.keys(huellaPalabras(largo)).length).toBeLessThanOrEqual(POSICIONES_HUELLAS);
    expect(POSICIONES_HUELLAS).toBe(256);
  });

  it("un texto sin palabras que distingan no deja huella", () => {
    expect(Object.keys(huellaPalabras("   ")).length).toBe(0);
    expect(Object.keys(huellaPalabras("de la el")).length).toBe(0);
  });
});
describe("similitud", () => {
  it("la misma bolsa vale 1 y el orden no importa", () => {
    const h = huellaPalabras(ESTADO);
    expect(similitud(h, h)).toBeCloseTo(1, 6);
    expect(similitud(h, huellaPalabras(ESTADO))).toBeCloseTo(similitud(huellaPalabras(ESTADO), h), 6);
  });

  it("textos que no comparten nada valen 0", () => {
    expect(similitud(huellaPalabras(ESTADO), huellaPalabras("perro gato rata"))).toBe(0);
    expect(similitud(huellaPalabras(""), huellaPalabras(ESTADO))).toBe(0);
  });

  it("lo que se parece más se parece más que lo que no", () => {
    const a = huellaPalabras("publicar contenido sospechoso");
    const b = huellaPalabras("publicar contenido raro");
    const c = huellaPalabras("perro gato rata");
    expect(similitud(a, b)).toBeGreaterThan(similitud(a, c));
  });
});
describe("vecinos", () => {
  it("un ámbito no ve ejemplos de otro", () => {
    const libreta = [ejemplo({ ambito: "personal" }), ejemplo({ ambito: "personal" }),
      ejemplo({ ambito: "pagina" }), ejemplo({ ambito: "pagina" })];
    const v = vecinos(libreta, ESTADO, 5, "pagina");
    expect(v).toHaveLength(2);
    expect(v.every((x) => x.ejemplo.ambito === "pagina")).toBe(true);
  });

  it("sin desenlace conocido no son vecinos", () => {
    const libreta = [ejemplo({ desenlaceOk: null }), ejemplo({ desenlaceOk: null })];
    expect(vecinos(libreta, ESTADO, 5, "pagina")).toHaveLength(0);
  });

  it("desempate estable: a igual parecido, el que estaba antes en la libreta va antes", () => {
    const libreta = [ejemplo({ respuesta: "revisar" }), ejemplo({ respuesta: "integrar" })];
    const v = vecinos(libreta, ESTADO, 5, "pagina");
    expect(v.map((x) => x.ejemplo.respuesta)).toEqual(["revisar", "integrar"]);
    expect(v[0].similitud).toBeCloseTo(v[1].similitud, 6);
  });

  it("respeta el número pedido y descarta lo que no comparte palabras", () => {
    const libreta = Array.from({ length: 7 }, (_, i) => ejemplo({ respuesta: `r${i}` }));
    expect(vecinos(libreta, ESTADO, 3, "pagina")).toHaveLength(3);
    expect(vecinos([ejemplo({ estado: "perro gato rata" })], ESTADO, 5, "pagina")).toHaveLength(0);
  });
});
describe("votar", () => {
  it("con menos de 5 vecinos no hay voto", () => {
    expect(MIN_VECINOS).toBe(5);
    const v = [vecino("revisar"), vecino("revisar"), vecino("revisar"), vecino("revisar")];
    expect(votar(v)).toBeNull();
  });

  it("sin desenlace no vota", () => {
    expect(votar(Array.from({ length: 6 }, () => vecino("revisar", { desenlaceOk: null })))).toBeNull();
  });

  it("gana la respuesta que más peso apoya y se dice cuánto apoya", () => {
    const v = [vecino("revisar"), vecino("revisar"), vecino("revisar"), vecino("revisar"), vecino("integrar"), vecino("integrar")];
    const voto = votar(v);
    expect(voto?.respuesta).toBe("revisar");
    expect(voto?.apoyo).toBeCloseTo(4 / 6, 6);
  });

  it("con un apoyo de 0,6 justo sí vota, y por debajo no", () => {
    expect(UMBRAL_APOYO).toBe(0.6);
    const justo = [vecino("integrar"), vecino("integrar"), vecino("integrar"), vecino("revisar"), vecino("revisar")];
    expect(votar(justo)?.apoyo).toBeCloseTo(0.6, 6);
    const bajo = [vecino("revisar"), vecino("revisar"), vecino("integrar"), vecino("integrar"), vecino("descartar")];
    expect(votar(bajo)).toBeNull();
  });

  it("los que fallaron no sostienen su respuesta", () => {
    const v = [vecino("integrar", { desenlaceOk: false }), vecino("integrar", { desenlaceOk: false }),
      vecino("integrar", { desenlaceOk: false }), vecino("revisar"), vecino("revisar")];
    const voto = votar(v);
    expect(voto?.respuesta).toBe("revisar");
    expect(voto?.apoyo).toBeCloseTo(1, 6);
  });

  it("de la libreta al voto: la capa de ejemplos responde junto a Laya", () => {
    const libreta = [...Array.from({ length: 4 }, () => ejemplo({ respuesta: "revisar" })), ...Array.from({ length: 2 }, () => ejemplo({ respuesta: "integrar" }))];
    const voto = votar(vecinos(libreta, ESTADO, 6, "pagina"));
    expect(voto?.respuesta).toBe("revisar");
    expect(voto?.apoyo).toBeCloseTo(4 / 6, 6);
  });
});
