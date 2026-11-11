import { describe, expect, it } from "vitest";
import { esperaTimbre, textoBuscandoVia, timbreConCola, VENTANA_TIMBRE_MS } from "@/lib/malla/cola-timbre";

/** Reloj falso: `esperar` avanza el tiempo hasta el plazo o hasta que alguien despierte. */
function reloj() {
  let t = 0;
  let despertar: (() => void) | null = null;
  const eventos: { en: number; fn: () => void }[] = [];
  return {
    ahora: () => t,
    programar(en: number, fn: () => void) {
      eventos.push({ en, fn });
    },
    esperar: async (ms: number, d: (cb: () => void) => void) => {
      let hecho = false;
      d(() => {
        hecho = true;
      });
      const fin = t + ms;
      despertar = null;
      while (t < fin && !hecho) {
        t += 10;
        for (const e of eventos.filter((x) => x.en <= t)) {
          eventos.splice(eventos.indexOf(e), 1);
          e.fn();
        }
      }
      void despertar;
    },
  };
}

describe("cola del timbre (MLL1111C)", () => {
  it("prueba 35: sin vía al llamar, el Bluetooth liga a los 5 s → el timbre sale solo", async () => {
    const r = reloj();
    let arriba = false;
    const oyentes = new Set<(v: string) => void>();
    r.programar(5_000, () => {
      arriba = true;
      oyentes.forEach((cb) => cb("bluetooth"));
    });
    const lineas: string[] = [];
    const buscando: boolean[] = [];
    const res = await timbreConCola({
      avisar: async () => arriba,
      alVia: (cb) => (oyentes.add(cb), () => void oyentes.delete(cb)),
      anotar: (d) => lineas.push(d),
      alBuscar: (b) => buscando.push(b),
      ahora: r.ahora,
      esperar: r.esperar,
    });
    expect(res.ok).toBe(true);
    expect(res.ms).toBeGreaterThanOrEqual(5_000);
    expect(res.ms).toBeLessThan(5_100);
    expect(res.motivo).toBe("via-nueva:bluetooth");
    expect(buscando).toEqual([true, false]);
    expect(lineas[0]).toMatch(/^en-cola intento=1/);
    expect(lineas.at(-1)).toMatch(/^ok intento=\d+ tras=50\d\dms motivo=via-nueva:bluetooth/);
    expect(lineas.some((l) => /^fallo/.test(l))).toBe(false);
    expect(oyentes.size).toBe(0);
  });

  it("primer intento bueno: ni cola ni ventana de búsqueda", async () => {
    const buscando: boolean[] = [];
    const lineas: string[] = [];
    const res = await timbreConCola({ avisar: async () => true, alBuscar: (b) => buscando.push(b), anotar: (d) => lineas.push(d) });
    expect(res).toMatchObject({ ok: true, intentos: 1, motivo: "primer-intento" });
    expect(buscando).toEqual([]);
    expect(lineas).toEqual([]);
  });

  it("un aviso que falla por una vía se reintenta (por la siguiente que esté viva)", async () => {
    const r = reloj();
    const vias = ["ble-caida", "red-local"];
    let i = 0;
    const res = await timbreConCola({ avisar: async () => vias[i++] === "red-local", ahora: r.ahora, esperar: r.esperar });
    expect(res.ok).toBe(true);
    expect(res.intentos).toBe(2);
    expect(res.ms).toBe(1_000);
  });

  it("sin vía en toda la ventana: falla con sus reintentos anotados, nunca en silencio", async () => {
    const r = reloj();
    const lineas: string[] = [];
    const res = await timbreConCola({ avisar: async () => false, anotar: (d) => lineas.push(d), ahora: r.ahora, esperar: r.esperar });
    expect(res.ok).toBe(false);
    expect(res.motivo).toBe("plazo");
    expect(res.ms).toBeGreaterThanOrEqual(VENTANA_TIMBRE_MS);
    expect(res.intentos).toBeGreaterThan(5);
    expect(lineas.at(-1)).toMatch(/^agotada intentos=\d+ tras=30\d\d\dms ventana=30000ms/);
  });

  it("si la persona cuelga mientras se busca, se deja de intentar", async () => {
    const r = reloj();
    let colgada = false;
    r.programar(2_000, () => {
      colgada = true;
    });
    const res = await timbreConCola({ avisar: async () => false, cancelada: () => colgada, ahora: r.ahora, esperar: r.esperar });
    expect(res).toMatchObject({ ok: false, motivo: "cancelada" });
  });

  it("una excepción del aviso cuenta como intento fallido", async () => {
    const r = reloj();
    let n = 0;
    const res = await timbreConCola({
      avisar: async () => {
        n++;
        if (n === 1) throw new Error("sin canal");
        return true;
      },
      ahora: r.ahora,
      esperar: r.esperar,
    });
    expect(res.ok).toBe(true);
    expect(res.intentos).toBe(2);
  });

  it("ritmo y texto", () => {
    expect([2, 3, 4, 5, 9].map(esperaTimbre)).toEqual([1_000, 2_000, 3_000, 3_000, 3_000]);
    expect(textoBuscandoVia("Maggaboard")).toBe("Buscando una vía hasta Maggaboard…");
    expect(textoBuscandoVia(null)).toBe("Buscando una vía hasta el otro aparato…");
  });
});
