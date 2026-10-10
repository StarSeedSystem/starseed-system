/**
 * Modelo de la transmisión paramétrica: posición de quien llega tarde, fase, transiciones,
 * resumen de la línea, fusión, saneado, serialización y enlaces.
 */
import { describe, expect, it } from "vitest";
import {
  aplicarAccion,
  codificarFicha,
  compactarLinea,
  enlaceDeSesion,
  entonacionDesdeOmniConfig,
  entonacionDesdeOsciladores,
  esEnlaceEnVivo,
  fusionarEstados,
  inicioEnFase,
  leerEnlaceSesion,
  leerEstado,
  leerFichaCodificada,
  numeroAccion,
  posicionEn,
  sanearFicha,
  serializarEstado,
  valoresOscilador,
  type AccionLinea,
  type EstadoSesion,
  type FichaSesion,
  type OsciladorParam,
} from "../transmision-parametrica";

const PK = "B".repeat(87);
const ficha: FichaSesion = {
  v: 1,
  id: "abcdefghijklmnopqrstuv",
  fuente: "omnifrecuencias",
  titulo: "Meditación 432",
  enlace: "https://omnifrecuencias.vercel.app/entonaciones/abc",
  pk: PK,
  privada: false,
  params: { tipo: "omnifrecuencias", entonacion: { volumen: 0.7, osciladores: [{ id: "a", f: 432, onda: "sine", vol: 0.5, x: 0, y: 0, z: 0 }] } },
  creada: 1,
};

let n = 0;
const acc = (t: number, tipo: AccionLinea["tipo"], extra: Partial<AccionLinea> = {}): AccionLinea => ({ n: ++n, t, tipo, ...extra });
const con = (...a: AccionLinea[]): EstadoSesion => a.reduce((e, x) => aplicarAccion(e, x), { ficha, linea: [], rev: 0 } as EstadoSesion);

describe("posicionEn · dónde va la sesión (quien llega tarde)", () => {
  const e = con(acc(1000, "iniciar"), acc(4000, "pausar"), acc(10_000, "reanudar"), acc(20_000, "terminar"));

  it("antes de empezar: esperando", () => {
    const p = posicionEn(e, 500);
    expect(p.fase).toBe("esperando");
    expect(p.posicionMs).toBe(0);
    expect(p.proxima?.tipo).toBe("iniciar");
  });

  it("sonando: la posición y el ancla salen de la línea", () => {
    const p = posicionEn(e, 2500);
    expect(p.fase).toBe("sonando");
    expect(p.posicionMs).toBe(1500);
    expect(p.ancla).toBe(1000);
  });

  it("en pausa: la posición se congela", () => {
    expect(posicionEn(e, 7000)).toMatchObject({ fase: "pausada", posicionMs: 3000, ancla: null });
  });

  it("tras reanudar, quien llega tarde calcula lo mismo que quien estuvo desde el principio", () => {
    const p = posicionEn(e, 12_345);
    expect(p.fase).toBe("sonando");
    expect(p.posicionMs).toBe(3000 + 2345);
    expect(p.ancla).toBe(10_000 - 3000);
  });

  it("terminada: acumula hasta el final y no vuelve a sonar con reanudar", () => {
    const t = aplicarAccion(e, acc(25_000, "reanudar"));
    expect(posicionEn(t, 30_000)).toMatchObject({ fase: "terminada", posicionMs: 13_000 });
  });

  it("iniciar de nuevo vuelve a cero", () => {
    const t = aplicarAccion(e, acc(30_000, "iniciar"));
    expect(posicionEn(t, 31_000)).toMatchObject({ fase: "sonando", posicionMs: 1000, ancla: 30_000 });
  });

  it("parámetros y volumen cuentan desde su instante, no antes", () => {
    const otra = { tipo: "omnifrecuencias" as const, entonacion: { volumen: 0.7, osciladores: [{ id: "b", f: 528, onda: "sine" as const, vol: 0.5, x: 0, y: 0, z: 0 }] } };
    const t = con(acc(0, "iniciar"), acc(5000, "parametros", { params: otra }), acc(6000, "volumen", { volumen: 0.2 }));
    expect(posicionEn(t, 4999).params).toBe(ficha.params);
    expect(posicionEn(t, 5000).params).toEqual(otra);
    expect(posicionEn(t, 5999).volumen).toBe(0.7);
    expect(posicionEn(t, 6000).volumen).toBe(0.2);
  });
});

describe("fase y transiciones", () => {
  it("inicioEnFase deja al que llega tarde en el cruce por cero que le toca", () => {
    const ancla = 1_000_000.25;
    for (const f of [432, 7.83, 528.5, 1000]) {
      const t = inicioEnFase(ancla, 1_003_210.7, f);
      expect(t).toBeGreaterThanOrEqual(1_003_210.7);
      const ciclos = ((t - ancla) * f) / 1000;
      expect(Math.abs(ciclos - Math.round(ciclos))).toBeLessThan(1e-6);
      expect(t - 1_003_210.7).toBeLessThanOrEqual(1000 / f + 1e-9);
    }
    expect(inicioEnFase(5000, 1000, 432)).toBe(5000); // si aún no empezó, empieza en el ancla
  });

  const osc: OsciladorParam = {
    id: "t", f: 100, onda: "sine", vol: 0.5, x: 0, y: 0, z: 0,
    trans: { a: { f: 100, vol: 0, x: -1, y: 0, z: 0, onda: "sine" }, b: { f: 200, vol: 1, x: 1, y: 0, z: 0, onda: "square" }, dur: 10, vueltas: 1 },
  };

  it("ida y vuelta con `vueltas` extra, como en la app; al acabar se queda en el final", () => {
    expect(valoresOscilador(osc, 0).f).toBe(100);
    expect(valoresOscilador(osc, 5).f).toBe(150);
    expect(valoresOscilador(osc, 10).f).toBe(200); // fin de la ida = inicio de la vuelta
    expect(valoresOscilador(osc, 15).f).toBe(150);
    expect(valoresOscilador(osc, 20).f).toBe(100); // terminó la vuelta
    expect(valoresOscilador(osc, 99).f).toBe(100);
    expect(valoresOscilador(osc, 5)).toMatchObject({ onda: "sine", onda2: "square", mezcla: 0.5, x: 0 });
  });

  it("infinito sigue yendo y viniendo", () => {
    const inf = { ...osc, trans: { ...osc.trans!, vueltas: "infinito" as const } };
    expect(valoresOscilador(inf, 1005).f).toBe(150);
    expect(valoresOscilador(inf, 1010).f).toBe(200);
  });

  it("sin transición devuelve el oscilador tal cual", () => {
    expect(valoresOscilador({ id: "x", f: 432, onda: "triangle", vol: 0.3, x: 0.2, y: 0, z: 0 }, 77)).toMatchObject({ f: 432, onda: "triangle", vol: 0.3, x: 0.2, mezcla: 0 });
  });
});

describe("resumen y fusión de la línea", () => {
  it("compactar no cambia la posición en ningún instante posterior", () => {
    const linea: AccionLinea[] = [];
    let t = 0;
    const tipos: AccionLinea["tipo"][] = ["iniciar", "pausar", "reanudar", "volumen", "pausar", "reanudar"];
    for (let i = 0; i < 90; i++) {
      t += 137 + (i % 7) * 11;
      const tipo = tipos[i % tipos.length];
      linea.push(acc(t, tipo, tipo === "volumen" ? { volumen: (i % 10) / 10 } : {}));
    }
    const largo: EstadoSesion = { ficha, linea, rev: 0 };
    const corto: EstadoSesion = { ficha, linea: compactarLinea(ficha, linea, 20), rev: 0 };
    expect(corto.linea.length).toBe(20);
    expect(corto.linea[0].tipo).toBe("base");
    const desde = corto.linea[0].t;
    for (let x = desde; x <= t + 5000; x += 333) {
      const a = posicionEn(largo, x);
      const b = posicionEn(corto, x);
      expect(b.fase).toBe(a.fase);
      expect(b.posicionMs).toBeCloseTo(a.posicionMs, 6);
      expect(b.volumen).toBe(a.volumen);
    }
  });

  it("fusionar une por número y es idempotente", () => {
    const a = con(acc(0, "iniciar"), acc(1000, "pausar"));
    const b = aplicarAccion(a, acc(2000, "reanudar"));
    const f = fusionarEstados(a, b);
    expect(f.linea.map((x) => x.tipo)).toEqual(["iniciar", "pausar", "reanudar"]);
    expect(fusionarEstados(f, b)).toEqual(f);
    expect(aplicarAccion(f, f.linea[0])).toBe(f); // repetida: no cambia
  });

  it("numeroAccion respeta el orden del tiempo", () => {
    expect(numeroAccion(1000, 999)).toBeLessThan(numeroAccion(1001, 0));
  });
});

describe("saneado, serialización y enlaces", () => {
  it("serializar y leer devuelve el mismo estado", () => {
    const e = con(acc(10, "iniciar"), acc(20, "volumen", { volumen: 0.4 }));
    const leido = leerEstado(serializarEstado(e));
    expect(leido).toEqual({ ...e, linea: e.linea });
  });

  it("rechaza basura, enlaces peligrosos y estados enormes", () => {
    expect(leerEstado("{no es json")).toBeNull();
    expect(leerEstado(JSON.stringify({ ficha: { ...ficha, enlace: "javascript:alert(1)" }, linea: [] }))).toBeNull();
    expect(leerEstado(JSON.stringify({ ficha: { ...ficha, id: "corto" }, linea: [] }))).toBeNull();
    expect(leerEstado("x".repeat(30_000))).toBeNull();
    expect(sanearFicha({ ...ficha, enlace: "//evil.example" })).toBeNull();
  });

  it("acota los parámetros y descarta osciladores rotos", () => {
    const f = sanearFicha({
      ...ficha,
      params: { tipo: "omnifrecuencias", entonacion: { volumen: 9, osciladores: [{ f: 99_999, onda: "ruido", vol: -1, x: 7 }, { f: "nada" }, { f: 10 }] } },
    })!;
    const o = f.params.tipo === "omnifrecuencias" ? f.params.entonacion : null;
    expect(o!.volumen).toBe(1);
    expect(o!.osciladores).toHaveLength(2);
    expect(o!.osciladores[0]).toMatchObject({ f: 24_000, onda: "sine", vol: 0, x: 1 });
  });

  it("ficha codificada ida y vuelta", () => {
    expect(leerFichaCodificada(codificarFicha(ficha))).toEqual(ficha);
    expect(leerFichaCodificada("%%%")).toBeNull();
  });

  it("pública: la ficha va en la query; privada: todo en el fragmento", () => {
    const pub = enlaceDeSesion(ficha);
    expect(pub.startsWith(`/estaciones/vivo/${ficha.id}?f=`)).toBe(true);
    expect(esEnlaceEnVivo(pub)).toBe(true);
    expect(leerEnlaceSesion(pub)).toMatchObject({ id: ficha.id, ficha, token: null, control: null });

    const priv = { ...ficha, privada: true };
    const enlace = enlaceDeSesion(priv, { token: "tok_EN-123", control: "ctrl" });
    expect(enlace).not.toContain("?");
    const [ruta, frag] = enlace.split("#");
    expect(ruta).toBe(`/estaciones/vivo/${ficha.id}`);
    expect(frag).toContain("k=tok_EN-123");
    expect(leerEnlaceSesion(`https://os.example${enlace}`)).toMatchObject({ id: ficha.id, ficha: priv, token: "tok_EN-123", control: "ctrl" });
  });

  it("una ficha de OTRA sesión en el enlace no se acepta", () => {
    const otro = enlaceDeSesion(ficha).replace(ficha.id, "zyxwvutsrqponmlkjihgfe");
    expect(leerEnlaceSesion(otro)?.ficha).toBeNull();
  });
});

describe("conversión desde las apps", () => {
  it("osciladores de la app completa (con transición)", () => {
    const e = entonacionDesdeOsciladores([
      {
        id: "x", frequency: 432, type: "sine", volume: 0.5, panX: -0.5, panY: 0, panZ: 0.2, name: "Base",
        transition: {
          enabled: true, start: { frequency: 432, volume: 0.5, panX: 0, panY: 0, panZ: 0, type: "sine" },
          end: { frequency: 528, volume: 0.2, panX: 1, panY: 0, panZ: 0, type: "triangle" },
          duration: 30, loopCount: "infinite", isPlaying: true, progress: 0, currentLoop: 0, direction: "forward",
        },
      },
    ])!;
    expect(e.osciladores[0]).toMatchObject({ f: 432, x: -0.5, z: 0.2, nombre: "Base" });
    expect(e.osciladores[0].trans).toMatchObject({ dur: 30, vueltas: "infinito" });
  });

  it("presets del widget: el binaural se vuelve dos osciladores izquierda/derecha", () => {
    const e = entonacionDesdeOmniConfig({
      name: "Theta",
      masterVolume: 0.5,
      tones: [{ id: "t", freq: 200, waveform: "sine", gain: 0.6, pan: 0, binauralBeat: 6, pulseHz: 0 }],
    })!;
    expect(e.osciladores.map((o) => [o.f, o.x])).toEqual([[200, -1], [206, 1]]);
    expect(e.volumen).toBe(0.5);
  });
});
