/**
 * Reloj común: desfase y precisión con relojes simulados (desfase conocido, retardos simétricos,
 * asimétricos y con colas), saneado de muestras y ritmo de sondeo.
 */
import { describe, expect, it } from "vitest";
import { estimarDesfase, muestraNtp, programarSondeo, RelojComun, type MuestraReloj } from "../reloj-comun";

/** Simula N intercambios entre una referencia (hora T) y un cliente (hora T + desfase). */
function simular(desfaseCliente: number, retardos: [number, number][], proceso = 0.3) {
  let T = 1_700_000_000_000;
  const ref = new RelojComun({ esReferencia: true, relojLocal: () => T });
  const cli = new RelojComun({ relojLocal: () => T + desfaseCliente });
  for (const [ida, vuelta] of retardos) {
    const ping = cli.nuevoPing();
    T += ida;
    const t1 = ref.horaLocal();
    T += proceso;
    const pong = ref.atenderPing(ping, t1)!;
    T += vuelta;
    expect(cli.recibirPong(pong, cli.horaLocal())).toBe(true);
    T += 500;
  }
  return { cli, ahoraVerdad: () => T };
}

describe("muestraNtp", () => {
  it("calcula desfase y retardo con la fórmula de NTP", () => {
    // Cliente adelantado 100 ms; 10 ms de ida, 10 de vuelta, 2 de proceso.
    const m = muestraNtp(1100, 1010, 1012, 1122)!;
    expect(m.desfaseMs).toBeCloseTo(-100, 6);
    expect(m.retardoMs).toBeCloseTo(20, 6);
  });

  it("descarta instantes imposibles", () => {
    expect(muestraNtp(0, 10, 5, 20)).toBeNull(); // t2 < t1
    expect(muestraNtp(10, 0, 0, 5)).toBeNull(); // t3 < t0
    expect(muestraNtp(0, 100, 150, 10)).toBeNull(); // la referencia «tardó» más que la ida y vuelta
    expect(muestraNtp(Number.NaN, 0, 0, 0)).toBeNull();
  });
});

describe("estimarDesfase", () => {
  it("sin muestras no inventa precisión", () => {
    expect(estimarDesfase([])).toBeNull();
  });

  it("se queda con las muestras de menor retardo y la mediana (inmune a colas)", () => {
    const buenas: MuestraReloj[] = [10, 11, 12, 10.5, 11.5].map((r, i) => ({ desfaseMs: -250 + (i % 2 ? 0.4 : -0.4), retardoMs: r, estrato: 1, at: i }));
    const malas: MuestraReloj[] = [300, 450, 600, 900, 1200].map((r, i) => ({ desfaseMs: -250 + r / 3, retardoMs: r, estrato: 1, at: 10 + i }));
    const e = estimarDesfase([...malas, ...buenas])!;
    expect(Math.abs(e.desfaseMs + 250)).toBeLessThan(0.5);
    expect(e.retardoMinMs).toBe(10);
    expect(e.cotaMs).toBeLessThanOrEqual(6);
  });

  it("prefiere el estrato más bajo", () => {
    const e = estimarDesfase([
      { desfaseMs: 5, retardoMs: 1, estrato: 2, at: 0 },
      { desfaseMs: 9, retardoMs: 40, estrato: 1, at: 1 },
    ])!;
    expect(e.estrato).toBe(1);
    expect(e.desfaseMs).toBe(9);
  });
});

describe("RelojComun con relojes simulados", () => {
  it("con retardos simétricos clava el desfase (error < 0,01 ms)", () => {
    const { cli, ahoraVerdad } = simular(1234.5, Array.from({ length: 8 }, () => [15, 15] as [number, number]));
    expect(Math.abs(cli.ahora() - ahoraVerdad())).toBeLessThan(0.01);
    const e = cli.estado();
    expect(e.modo).toBe("sincronizado");
    expect(e.precisionMs).not.toBeNull();
    expect(e.cotaMs).toBeCloseTo(15, 1);
  });

  it("con camino asimétrico el error real queda DENTRO de la cota anunciada", () => {
    const { cli, ahoraVerdad } = simular(-777, Array.from({ length: 8 }, () => [10, 30] as [number, number]));
    const error = Math.abs(cli.ahora() - ahoraVerdad());
    expect(error).toBeCloseTo(10, 1); // (30 − 10) / 2
    expect(cli.estado().cotaMs!).toBeGreaterThanOrEqual(error);
  });

  it("en red local (≈2 ms) llega a precisión de milisegundo pese a ráfagas lentas", () => {
    const retardos: [number, number][] = [
      [1, 1.2], [0.9, 1.1], [80, 5], [1.1, 0.9], [1, 1], [3, 60], [0.95, 1.05], [1.05, 1],
    ];
    const { cli, ahoraVerdad } = simular(42_000, retardos);
    expect(Math.abs(cli.ahora() - ahoraVerdad())).toBeLessThan(1);
    expect(cli.estado().precisionMs!).toBeLessThan(1);
    expect(cli.estado().cotaMs!).toBeLessThan(2);
  });

  it("ignora respuestas que no son suyas o repetidas", () => {
    let T = 0;
    const ref = new RelojComun({ esReferencia: true, relojLocal: () => T });
    const a = new RelojComun({ relojLocal: () => T + 5 });
    const b = new RelojComun({ relojLocal: () => T - 5 });
    const ping = a.nuevoPing();
    const pong = ref.atenderPing(ping, ref.horaLocal())!;
    expect(b.recibirPong(pong, b.horaLocal())).toBe(false);
    expect(a.recibirPong(pong, a.horaLocal())).toBe(true);
    expect(a.recibirPong(pong, a.horaLocal())).toBe(false);
  });

  it("sin referencia no contesta la hora (no propaga una hora sin medir)", () => {
    const c = new RelojComun({ relojLocal: () => 0 });
    expect(c.atenderPing({ id: "x", de: "y", t0: 0 }, 0)).toBeNull();
    expect(c.estado().modo).toBe("sin-referencia");
  });

  it("caduca las muestras viejas", () => {
    let T = 0;
    const ref = new RelojComun({ esReferencia: true, relojLocal: () => T });
    const cli = new RelojComun({ relojLocal: () => T + 100, caducidadMs: 1000 });
    const medir = (ida: number, vuelta: number) => {
      const p = cli.nuevoPing();
      T += ida;
      const pong = ref.atenderPing(p, ref.horaLocal())!;
      T += vuelta;
      cli.recibirPong(pong, cli.horaLocal());
    };
    medir(1, 1);
    T += 5000;
    medir(50, 50);
    expect(cli.estado().muestras).toBe(1);
    expect(cli.estado().retardoMinMs).toBe(100);
  });
});

describe("deriva del reloj", () => {
  /** Reloj del aparato 50 ppm más rápido y 3 s adelantado; rondas a 0, 30 s, 1, 2 y 4 min; luego 5 min sin preguntar. */
  function derivando(jitter: [number, number]) {
    let T = 1_700_000_000_000;
    const T0 = T;
    const ref = new RelojComun({ esReferencia: true, relojLocal: () => T });
    const cli = new RelojComun({ relojLocal: () => T0 + 3000 + (T - T0) * (1 + 50e-6) });
    let semilla = 7;
    const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
    const [base, ancho] = jitter;
    const ronda = (n: number) => {
      for (let i = 0; i < n; i++) {
        const p = cli.nuevoPing();
        T += base + azar() * ancho;
        const pong = ref.atenderPing(p, ref.horaLocal())!;
        T += base + azar() * ancho;
        cli.recibirPong(pong, cli.horaLocal());
        T += 150;
      }
    };
    ronda(8);
    for (const espera of [30_000, 60_000, 120_000, 240_000]) {
      T += espera;
      ronda(3);
    }
    T += 300_000;
    return { cli, error: Math.abs(cli.ahora() - T) };
  }

  it("red local: un reloj que corre 50 ppm rápido sigue en < 1 ms 5 min después de la última medida", () => {
    const { cli, error } = derivando([1, 1]);
    // +50 ppm: este reloj adelanta 50 µs por segundo.
    expect(cli.estado().derivaPpm).toBeGreaterThan(45);
    expect(cli.estado().derivaPpm).toBeLessThan(55);
    expect(error).toBeLessThan(1); // sin compensar serían 15 ms
  });

  it("internet con ±3 ms de vaivén: el error queda dentro de la cota que se enseña", () => {
    const { cli, error } = derivando([8, 6]);
    expect(cli.estado().derivaPpm).toBeGreaterThan(40);
    expect(cli.estado().derivaPpm).toBeLessThan(60);
    expect(error).toBeLessThan(15 / 4);
    expect(error).toBeLessThanOrEqual(cli.estado().cotaMs!);
  });

  it("con pocas rondas no se inventa una deriva", () => {
    const r = estimarDesfase([
      { desfaseMs: 10, retardoMs: 5, estrato: 1, at: 0 },
      { desfaseMs: 11, retardoMs: 5, estrato: 1, at: 100_000 },
    ])!;
    expect(r.derivaPpm).toBe(0);
  });
});

describe("programarSondeo", () => {
  it("ráfaga al principio y luego rondas cada vez más espaciadas (pocos mensajes)", () => {
    const esperas: number[] = [];
    const cola: (() => void)[] = [];
    let preguntas = 0;
    const parar = programarSondeo(() => preguntas++, {
      rafaga: 3,
      rafagaMs: 100,
      porVuelta: 2,
      periodoMs: 1000,
      periodoMaxMs: 3000,
      poner: ((fn: () => void, ms: number) => {
        esperas.push(ms);
        cola.push(fn);
        return cola.length as unknown as ReturnType<typeof setTimeout>;
      }) as unknown as typeof setTimeout,
      quitar: (() => undefined) as unknown as typeof clearTimeout,
    });
    for (let i = 0; i < 9; i++) cola.shift()!();
    expect(preguntas).toBe(9);
    expect(esperas).toEqual([0, 100, 100, 1000, 100, 2000, 100, 3000, 100, 3000]);
    parar();
    cola.shift()!();
    expect(preguntas).toBe(9);
  });
});
