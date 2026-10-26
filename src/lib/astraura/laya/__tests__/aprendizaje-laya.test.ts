// Pruebas del aprendizaje de Laya (tarea M de la Ola 1018L). Sin red, sin disco y sin modelos:
// los casos son de ejemplo con la forma real (answer_confidence calibrada) y el registro es puro.
import { describe, expect, it } from "vitest";
import { anotar, exportarJSONL, huellaEstado, umbralRecalibrado, MIN_CASOS_RECALIBRADO,
  type EntradaRegistroLaya, type RegistroLaya } from "../aprendizaje-laya";

const base = (cambios: Partial<EntradaRegistroLaya> = {}): EntradaRegistroLaya => ({
  punto: "reflejo.herramienta", ambito: "chat", p: 0.8, donde: "a1",
  ms: 2100, resultado: "aceptada", privado: false, estado: { mensaje: "hola" }, ...cambios,
});

const lote = (n: number, cambios: Partial<EntradaRegistroLaya>, previo: RegistroLaya = []): RegistroLaya => {
  let r = previo;
  for (let i = 0; i < n; i++) r = anotar(r, base(cambios));
  return r;
};

describe("anotar · registro y privacidad", () => {
  it("añade un caso público con su estado y no muta el registro anterior", () => {
    const r = anotar([], base());
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      punto: "reflejo.herramienta", ambito: "chat", p: 0.8, resultado: "aceptada",
      privado: false, estado: { mensaje: "hola" },
    });
    expect(anotar(r, base({ ambito: "  grupo  " }))[1].ambito).toBe("grupo");
    expect(r).toHaveLength(1);
  });

  it("lo privado se guarda SOLO como huella: ni el texto ni el JSON original", () => {
    const estado = { telefono: "+34 600 123 456" };
    const r = anotar([], base({ privado: true, estado }));
    expect(r[0]).toMatchObject({ privado: true, huella: huellaEstado(estado) });
    expect("estado" in r[0]).toBe(false);
    const guardado = JSON.stringify(r);
    expect(guardado).not.toContain("600 123 456");
    expect(guardado).toContain("huella");
  });

  it("la huella es estable con cualquier orden de claves y distinta por estado", () => {
    expect(huellaEstado({ a: 1, b: "x" })).toBe(huellaEstado({ b: "x", a: 1 }));
    expect(huellaEstado("uno")).not.toBe(huellaEstado("dos"));
    expect(huellaEstado(null)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("rechaza datos que envenenarían la recalibración", () => {
    const invalidos: Partial<EntradaRegistroLaya>[] = [
      { p: 1.2 }, { p: -0.1 }, { p: Number.NaN }, { ms: -1 }, { ambito: "   " },
      { resultado: "otra" as never },
    ];
    for (const cambios of invalidos) expect(() => anotar([], base(cambios))).toThrow();
  });
});

describe("umbralRecalibrado", () => {
  it("con menos de 30 casos por punto y ámbito no mueve el umbral del catálogo", () => {
    const r = lote(MIN_CASOS_RECALIBRADO - 1, { p: 0.99, resultado: "corregida" });
    expect(umbralRecalibrado(r, "reflejo.herramienta", "chat")).toBe(0.6);
    expect(umbralRecalibrado([], "privacidad.subir", "chat")).toBe(0.5);
  });

  it("con 30 casos sube el umbral justo por encima de lo que se corrige", () => {
    const r = lote(20, { p: 0.85, resultado: "corregida" }, lote(20, { p: 0.95, resultado: "aceptada" }));
    expect(r).toHaveLength(40);
    expect(umbralRecalibrado(r, "reflejo.herramienta", "chat")).toBe(0.86);
  });

  it("separa por punto y por ámbito (con espacios de más en el ámbito)", () => {
    const chat = lote(20, { p: 0.85, resultado: "corregida" }, lote(20, { p: 0.95, resultado: "aceptada" }));
    const grupo = lote(30, { ambito: "grupo", p: 0.9, resultado: "corregida" });
    const r = [...chat, ...grupo];
    expect(umbralRecalibrado(r, "reflejo.herramienta", "chat")).toBe(0.86);
    expect(umbralRecalibrado(r, "reflejo.herramienta", "  grupo ")).toBe(0.91);
    expect(umbralRecalibrado(r, "voz.tono", "chat")).toBe(0.6);
  });

  it("lo escalado también cuenta como corrección: deja de aceptar esas decisiones", () => {
    expect(umbralRecalibrado(lote(30, { p: 0.9, resultado: "escalada" }), "reflejo.herramienta", "chat")).toBe(0.91);
  });
});

describe("exportarJSONL · cuaderno de afinado", () => {
  it("saca una línea por caso público, en el formato del cuaderno, y omite lo privado", () => {
    let r = anotar([], base({ estado: { mensaje: "hola" } }));
    r = anotar(r, base({ privado: true, estado: { mensaje: "secreto" } }));
    r = anotar(r, base({ estado: { mensaje: "adiós" }, resultado: "corregida" }));
    const jsonl = exportarJSONL(r);
    expect(jsonl.endsWith("\n")).toBe(true);
    const lineas = jsonl.trimEnd().split("\n");
    expect(lineas).toHaveLength(2);
    expect(jsonl).not.toContain("secreto");
    const primera = JSON.parse(lineas[0]) as Record<string, unknown>;
    expect(Object.keys(primera)).toEqual(
      ["punto", "ambito", "estado", "answer_confidence", "resultado", "donde", "ms"]);
    expect(primera).toEqual({
      punto: "reflejo.herramienta", ambito: "chat", estado: { mensaje: "hola" },
      answer_confidence: 0.8, resultado: "aceptada", donde: "a1", ms: 2100,
    });
  });

  it("sin casos públicos devuelve una cadena vacía", () => {
    expect(exportarJSONL(anotar([], base({ privado: true })))).toBe("");
  });
});
