import { describe, expect, it } from "vitest";
import {
  AMBITOS, DURACIONES, crearSilencio, fusionar, hastaDe, leerSilencios, poner, quitar, serializarSilencios,
  silenciadaPor, silenciosActivos, textoHasta, vigente, VIDA_LAPIDA_MS, type AmbitoSilencio, type Silencio,
} from "../silencio-llamadas";

const AHORA = new Date(2026, 10, 9, 17, 0, 0).getTime();
const MIN = 60_000;
const q = { uid: "u1", neurona: "n1", chat: "c1", medio: "bluetooth" };

function hacer(ambito: AmbitoSilencio, clave: string | null, duracion: (typeof DURACIONES)[number] = "1h", ahora = AHORA) {
  const s = crearSilencio({ ambito, clave, duracion, ahora, etiqueta: "x" });
  if (!s) throw new Error("no se creó");
  return s;
}

describe("duraciones", () => {
  it("15 min, 1 h y 8 h suman exactamente", () => {
    expect(hastaDe("15m", AHORA)).toBe(AHORA + 15 * MIN);
    expect(hastaDe("1h", AHORA)).toBe(AHORA + 60 * MIN);
    expect(hastaDe("8h", AHORA)).toBe(AHORA + 480 * MIN);
  });
  it("«hasta mañana» cae después de ahora y «siempre» no tiene fin", () => {
    const m = hastaDe("manana", AHORA);
    expect(m).not.toBeNull();
    expect(m as number).toBeGreaterThan(AHORA);
    expect(m as number).toBeLessThanOrEqual(AHORA + 36 * 60 * MIN);
    expect(hastaDe("siempre", AHORA)).toBeNull();
  });
});

describe("ámbitos × duraciones × caducidad", () => {
  const claves: Record<AmbitoSilencio, string> = { persona: "u1", neurona: "n1", chat: "c1", medio: "bluetooth", todas: "*" };
  for (const ambito of AMBITOS) {
    for (const d of DURACIONES) {
      it(`${ambito} / ${d}: cubre la llamada y caduca`, () => {
        const s = hacer(ambito, claves[ambito], d);
        expect(silenciadaPor([s], q, AHORA + 1)?.id).toBe(s.id);
        if (s.hasta === null) {
          expect(silenciadaPor([s], q, AHORA + 400 * 24 * 60 * MIN)).not.toBeNull();
        } else {
          expect(vigente(s, s.hasta - 1)).toBe(true);
          expect(silenciadaPor([s], q, s.hasta)).toBeNull();
        }
      });
    }
  }
  it("no cubre a otra persona, otra neurona, otro chat ni otro medio", () => {
    expect(silenciadaPor([hacer("persona", "u2")], q, AHORA)).toBeNull();
    expect(silenciadaPor([hacer("neurona", "n2")], q, AHORA)).toBeNull();
    expect(silenciadaPor([hacer("chat", "c2")], q, AHORA)).toBeNull();
    expect(silenciadaPor([hacer("medio", "internet")], q, AHORA)).toBeNull();
  });
  it("sin dato en la llamada no cubre (salvo «todas»)", () => {
    expect(silenciadaPor([hacer("persona", "u1")], { medio: "bluetooth" }, AHORA)).toBeNull();
    expect(silenciadaPor([hacer("todas", "*")], {}, AHORA)).not.toBeNull();
  });
  it("con varios, devuelve el que dura más", () => {
    const corto = hacer("persona", "u1", "15m");
    const largo = hacer("neurona", "n1", "8h");
    expect(silenciadaPor([corto, largo], q, AHORA)?.id).toBe(largo.id);
    const sin = hacer("medio", "bluetooth", "siempre");
    expect(silenciadaPor([largo, sin], q, AHORA)?.id).toBe(sin.id);
  });
  it("un ámbito sin clave no se crea", () => {
    expect(crearSilencio({ ambito: "persona", clave: null, duracion: "1h", ahora: AHORA })).toBeNull();
  });
});

describe("quitar, deshacer y lápidas", () => {
  it("quitar deja lápida y la llamada vuelve a sonar", () => {
    const s = hacer("persona", "u1");
    const l = quitar([s], s.id, AHORA + 5);
    expect(l[0].quitado).toBe(true);
    expect(silenciadaPor(l, q, AHORA + 6)).toBeNull();
    expect(silenciosActivos(l, AHORA + 6)).toHaveLength(0);
  });
  it("poner con el mismo id sustituye", () => {
    const s = hacer("persona", "u1", "15m");
    const l = poner([s], { ...s, hasta: null, mod: s.mod + 1 });
    expect(l).toHaveLength(1);
    expect(l[0].hasta).toBeNull();
  });
  it("las lápidas viejas se tiran al fusionar", () => {
    const s = { ...hacer("persona", "u1"), quitado: true, mod: AHORA };
    expect(fusionar([s], [], AHORA + VIDA_LAPIDA_MS + 1)).toHaveLength(0);
    expect(fusionar([s], [], AHORA + 1)).toHaveLength(1);
  });
});

describe("fusión y serialización", () => {
  it("gana el mod más reciente y una lápida nueva vence al silencio viejo", () => {
    const s = hacer("persona", "u1", "siempre");
    const lapida: Silencio = { ...s, quitado: true, mod: s.mod + 10 };
    const f = fusionar([s], [lapida], AHORA + 20);
    expect(f).toHaveLength(1);
    expect(f[0].quitado).toBe(true);
    expect(fusionar([lapida], [s], AHORA + 20)[0].quitado).toBe(true);
  });
  it("ida y vuelta por JSON", () => {
    const l = [hacer("persona", "u1"), hacer("todas", "*", "siempre")];
    expect(leerSilencios(serializarSilencios(l))).toEqual(l);
  });
  it("lo malformado se descarta sin lanzar", () => {
    expect(leerSilencios("{no json")).toEqual([]);
    expect(leerSilencios(null)).toEqual([]);
    expect(leerSilencios({ silencios: [{ id: "a", ambito: "nada", clave: "x", creado: 1 }, 5, null] })).toEqual([]);
  });
});

describe("texto", () => {
  it("hoy: «18:00»; sin fin: «hasta que lo reactives»", () => {
    expect(textoHasta(AHORA + 60 * MIN, AHORA)).toContain("18:00");
    expect(textoHasta(null, AHORA)).toBe("hasta que lo reactives");
  });
});
