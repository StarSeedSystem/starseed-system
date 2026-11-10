/**
 * (BLE1108B) El «Registro del enlace»: anillo por neurona, exportable, unido al de la app nativa; y la escala de
 * reconexión/caída del motor (2 s, 5 s, 15 s).
 *   NODE_ENV=test npx vitest run src/lib/malla/__tests__/registro-enlace-ble.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  MAX_EVENTOS_POR_NEURONA,
  acotarBytes,
  colapsarRepetidas,
  crearRegistroEnlaces,
  lineasPosteriores,
  marcaDeLinea,
  tocaEspejoContinuo,
  unirRegistros,
} from "@/lib/malla/registro-enlace-ble";
import { ESCALA_CAIDA_BLE_MS, esperaCaidaBle } from "@/lib/malla/bluetooth-directo-motor";

describe("crearRegistroEnlaces", () => {
  it("guarda como mucho N eventos por neurona (los más nuevos) sin tocar a las demás", () => {
    let t = 1_000;
    const r = crearRegistroEnlaces({ ahora: () => t++ });
    for (let i = 0; i < MAX_EVENTOS_POR_NEURONA + 25; i++) r.anotar("hola", "n1", `saludo ${i}`);
    r.anotar("abierto", "n2", "b9");
    expect(r.lista("n1")).toHaveLength(MAX_EVENTOS_POR_NEURONA);
    expect(r.lista("n1").at(-1)?.detalle).toBe(`saludo ${MAX_EVENTOS_POR_NEURONA + 24}`);
    expect(r.lista("n2")).toHaveLength(1);
  });

  it("exporta una línea por evento con el instante, el tipo y el motivo, y avisa a los oyentes", () => {
    const vistos: string[] = [];
    const r = crearRegistroEnlaces({ ahora: () => Date.UTC(2026, 10, 8, 12, 30, 5, 123), alAnotar: (l) => vistos.push(l) });
    let avisos = 0;
    r.suscribir(() => avisos++);
    r.anotar("perdido", "e0b9faf2", "silencio del otro lado\ny más", "b3");
    const txt = r.exportar("e0b9faf2");
    expect(txt.split("\n")).toHaveLength(1);
    expect(txt).toContain("2026-11-08T12:30:05.123Z");
    expect(txt).toContain("perdido");
    expect(txt).toContain("b3");
    expect(vistos).toHaveLength(1);
    expect(avisos).toBe(1);
  });
});

describe("unirRegistros", () => {
  it("mezcla lo de la web y lo de la app nativa por orden de tiempo y filtra por neurona", () => {
    const r = crearRegistroEnlaces({ ahora: () => 2_000 });
    r.anotar("ligado", "n1", "hola firmado", "b1");
    const lineas = unirRegistros(
      r.lista(),
      [
        { seq: 1, ms: 1_000, tipo: "enlace-abierto", enlace: "b1", neurona: null, detalle: "mtu 247" },
        { seq: 2, ms: 3_000, tipo: "enlace-cerrado", enlace: "b1", neurona: "n1", detalle: "motivo=silencio" },
        { seq: 3, ms: 4_000, tipo: "enlace-cerrado", enlace: "b2", neurona: "otra", detalle: "x" },
      ],
      "n1",
    );
    expect(lineas).toHaveLength(3);
    expect(lineas[0]).toContain("nativa");
    expect(lineas[1]).toContain("web");
    expect(lineas[2]).toContain("motivo=silencio");
  });
});

describe("escala de caída del Bluetooth", () => {
  it("2 s, 5 s y luego 15 s fijos (antes 30 s)", () => {
    expect(ESCALA_CAIDA_BLE_MS).toEqual([2000, 5000, 15000]);
    expect([1, 2, 3, 4, 9].map(esperaCaidaBle)).toEqual([2000, 5000, 15000, 15000, 15000]);
    expect(esperaCaidaBle(0)).toBe(2000);
  });
});

describe("BLE1110A · registro compacto y espejo continuo", () => {
  const L = (t: string, resto: string) => `2026-11-09T23:33:${t}Z · nativa · ${resto}`;

  it("colapsa líneas idénticas consecutivas (salvo la hora) en «… (×N)» y deja intactas las distintas", () => {
    const rep = Array.from({ length: 68 }, (_, i) => L(`${10 + (i % 40)}.000`, "autocuracion · tormenta"));
    const sal = colapsarRepetidas([L("01.000", "ligado"), ...rep, L("59.000", "hola")]);
    expect(sal).toHaveLength(3);
    expect(sal[1]).toMatch(/ · autocuracion · tormenta … \(×68\)$/);
    expect(sal[0]).toContain("ligado");
    expect(sal[2]).toContain("hola");
    // Dos rachas separadas por otra línea no se juntan.
    expect(colapsarRepetidas([L("01.000", "a"), L("02.000", "b"), L("03.000", "a")])).toHaveLength(3);
  });

  it("suma un «… (×N)» que ya traía la línea y respeta el «(nombre) » del espejo", () => {
    const sal = colapsarRepetidas([`(Maggaboard) ${L("01.000", "x")} … (×3)`, `(Maggaboard) ${L("02.000", "x")}`, L("03.000", "x")]);
    expect(sal).toEqual([`(Maggaboard) ${L("02.000", "x")} … (×4)`, L("03.000", "x")]);
  });

  it("lineasPosteriores: solo lo nuevo, y marcaDeLinea lee la hora con o sin nombre", () => {
    const l = [L("01.000", "a"), L("02.000", "b"), L("03.000", "c")];
    expect(lineasPosteriores(l, null)).toHaveLength(3);
    expect(lineasPosteriores(l, "2026-11-09T23:33:02.000Z", new Set([l[1]]))).toEqual([l[2]]);
    expect(marcaDeLinea(`(Mac) ${l[0]}`)).toBe("2026-11-09T23:33:01.000Z");
    expect(marcaDeLinea("sin hora")).toBeNull();
  });

  it("acotarBytes deja las más nuevas dentro del tope", () => {
    const l = Array.from({ length: 50 }, (_, i) => `linea-${String(i).padStart(3, "0")}-${"x".repeat(80)}`);
    const a = acotarBytes(l, 1_000);
    expect(a.join("\n").length).toBeLessThanOrEqual(1_000);
    expect(a.at(-1)).toBe(l.at(-1));
    expect(acotarBytes(["y".repeat(5_000)], 100)[0]).toHaveLength(100);
  });

  it("tocaEspejoContinuo: cada ~25 s, nunca con voz o vídeo en cola ni con muchos datos esperando", () => {
    const base = { ahora: 100_000, ultimo: 70_000, cadaMs: 25_000, bytesVoz: 0, bytesVideo: 0, bytesDatos: 0, maxDatos: 4_096 };
    expect(tocaEspejoContinuo(base)).toBe(true);
    expect(tocaEspejoContinuo({ ...base, ultimo: 80_000 })).toBe(false);
    expect(tocaEspejoContinuo({ ...base, ultimo: undefined })).toBe(true);
    expect(tocaEspejoContinuo({ ...base, bytesVoz: 1 })).toBe(false);
    expect(tocaEspejoContinuo({ ...base, bytesVideo: 1 })).toBe(false);
    expect(tocaEspejoContinuo({ ...base, bytesDatos: 4_097 })).toBe(false);
  });
});

describe("BLE1110A · lineasPosteriores con la misma hora", () => {
  it("dos líneas del mismo milisegundo no se pierden ni se repiten", () => {
    const a = "2026-11-09T23:33:01.000Z · nativa · a";
    const b = "2026-11-09T23:33:01.000Z · nativa · b";
    expect(lineasPosteriores([a, b], "2026-11-09T23:33:01.000Z", new Set([a]))).toEqual([b]);
    expect(lineasPosteriores([a, b], "2026-11-09T23:33:01.000Z", new Set([a, b]))).toEqual([]);
  });
});
