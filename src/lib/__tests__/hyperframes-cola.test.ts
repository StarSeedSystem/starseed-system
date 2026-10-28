import { describe, expect, it, vi } from "vitest";
import {
  crearCola, entornoRender, FLAGS_PERMITIDOS, progresoDeLinea, rechazoDeArgs, sinRutas,
} from "../../../servicios/hyperframes/src/cola-render.mjs";

// Ejecutor falso PAUSABLE: no arranca ningún proceso; la prueba decide cuándo termina.
type Puerta = { esperar: Promise<void>; abre: () => void };
const puerta = (): Puerta => {
  let soltar = () => {};
  return { esperar: new Promise<void>((r) => { soltar = r; }), abre: () => soltar() };
};

// Reloj que solo avanza cuando la prueba se lo dice: nada de temporizadores reales.
const relojDePrueba = () => {
  let ms = 0;
  let pendientes: Array<{ fn: () => void; cuando: number }> = [];
  return {
    ahora: () => ms,
    avanza: (n: number) => {
      ms += n;
      const vivas = pendientes.filter((p) => p.cuando <= ms);
      pendientes = pendientes.filter((p) => p.cuando > ms);
      for (const p of vivas) p.fn();
    },
    programar: (fn: () => void, duracion: number) => {
      const e = { fn, cuando: ms + duracion };
      pendientes.push(e);
      return () => { pendientes = pendientes.filter((x) => x !== e); };
    },
  };
};

// Deja pasar los microtareas pendientes de la cola (encolar → iniciar → cerrar).
const listas = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

describe("cola de render · argumentos seguros y ayuda pura", () => {
  it("los args deben ser una lista y solo con flags de la lista blanca", () => {
    expect(rechazoDeArgs("hyperframes render")).toMatch(/lista/);
    expect(rechazoDeArgs(7)).toMatch(/lista/);
    expect(rechazoDeArgs(["--format", "mp4", "-o", "salida.mp4"])).toBeNull();
    expect(rechazoDeArgs([])).toBeNull();
    expect(rechazoDeArgs([7])).toMatch(/debe ser de texto/);
    expect(rechazoDeArgs(["--dry-run"])).toMatch(/no permitido/);
    expect(rechazoDeArgs(["--format=mp4"])).toMatch(/no permitido/);
    for (const flag of FLAGS_PERMITIDOS) expect(rechazoDeArgs([flag])).toBeNull();
  });

  it("el entorno del render lleva HYPERFRAMES_NO_TELEMETRY=1 aunque lo tapen", () => {
    expect(entornoRender()).toEqual({ HYPERFRAMES_NO_TELEMETRY: "1" });
    expect(entornoRender({ HYPERFRAMES_NO_TELEMETRY: "0" }).HYPERFRAMES_NO_TELEMETRY).toBe("1");
  });

  it("lee el progreso de las líneas @hf-progress y limpia las rutas de los errores", () => {
    expect(progresoDeLinea("@hf-progress {\"percent\":42}")).toEqual({ percent: 42 });
    expect(progresoDeLinea("otra línea normal")).toBeNull();
    expect(progresoDeLinea("@hf-progress sin llaves")).toBeNull();
    expect(progresoDeLinea(null)).toBeNull();
    expect(sinRutas("petó en /tmp/a/b y en /home/pepe/c")).toBe("petó en <ruta> y en <ruta>");
    expect(sinRutas("sin ruta")).toBe("sin ruta");
  });
});

describe("cola de render · flujo en-cola → renderizando → hecho", () => {
  const PUERTA = puerta();
  let recibido: { id: string; proyecto: string; args: string[] } | null = null;
  let canalRecibido: { linea: (t: string) => void; cancelada: () => boolean; entorno: unknown } | null = null;
  const cola = crearCola({
    reloj: relojDePrueba(),
    ejecutar: async (t: never, canal: never) => {
      recibido = t as typeof recibido; canalRecibido = canal as typeof canalRecibido;
      await PUERTA.esperar;
      return "/salidas/render.mp4";
    },
  });

  it("enciende el trabajo, pasa el trabajo limpio y el entorno al ejecutor, y lee progreso", async () => {
    const id = cola.encolar({ proyecto: "<html></html>", args: ["--format", "mp4"] });
    expect(id).toMatch(/^hf-/);
    // con un hueco libre la cola arranca en el mismo encolar (leer «en-cola»… solo si estaba el hueco ocupado)
    expect(cola.estado(id)).toMatchObject({ id, proyecto: "<html></html>", args: ["--format", "mp4"], estado: "renderizando" });
    await listas();
    expect(recibido).toEqual({ id, proyecto: "<html></html>", args: ["--format", "mp4"] });
    expect(canalRecibido?.entorno).toEqual({ HYPERFRAMES_NO_TELEMETRY: "1" });
    canalRecibido?.linea("@hf-progress {\"percent\":10}");
    expect(cola.estado(id)).toMatchObject({ estado: "renderizando", progreso: { percent: 10 } });
  });

  it("al abrir la puerta queda «hecho» con el resultado y el progreso leído", async () => {
    PUERTA.abre();
    await listas();
    expect(cola.estado("hf-1")).toMatchObject({ estado: "hecho", resultado: "/salidas/render.mp4", motivo: null, progreso: { percent: 10 } });
  });

  it("encolar rechaza proyectos vacíos, args en cadena y flags raros", () => {
    expect(() => cola.encolar({ proyecto: "  " })).toThrow(/proyecto/);
    expect(() => cola.encolar({ proyecto: "a", args: "--format mp4" })).toThrow(/lista/);
    expect(() => cola.encolar({ proyecto: "a", args: ["--no-telemetry"] })).toThrow(/no permitido/);
    expect(cola.estado("no-existe")).toBeNull();
  });
});

describe("cola de render · simultaneos y cancelación", () => {
  it("con un tope de 1, el segundo queda «en-cola» hasta que el primero termina", async () => {
    const p1 = puerta();
    const p2 = puerta();
    const porId = new Map<string, Promise<void>>([["hf-1", p1.esperar], ["hf-2", p2.esperar]]);
    const enMarcha: string[] = [];
    const colaDos = crearCola({
      maxSimultaneos: 1,
      reloj: relojDePrueba(),
      ejecutar: async (t: { id: string }) => {
        enMarcha.push(t.id);
        await porId.get(t.id);
        return "x";
      },
    });
    const a = colaDos.encolar({ proyecto: "A" });
    const b = colaDos.encolar({ proyecto: "B" });
    await listas(); // el ejecutor corre en microtareas: ya entró el hf-1, el hueco sigue ocupado
    expect(colaDos.estado(a).estado).toBe("renderizando"); // arrancó al encolar
    expect(colaDos.estado(b).estado).toBe("en-cola"); // hueco ocupado
    expect(enMarcha).toEqual(["hf-1"]);
    p1.abre();
    await listas();
    expect(colaDos.estado(a).estado).toBe("hecho");
    expect(colaDos.estado(b).estado).toBe("renderizando");
    expect(enMarcha).toEqual(["hf-1", "hf-2"]);
    p2.abre();
    await listas();
    expect(colaDos.estado(b).estado).toBe("hecho");
  });

  it("con dos simultáneos, ambas se lanzan a la vez para el hueco", async () => {
    const p = puerta();
    const porId = new Map<string, Promise<void>>([["hf-1", p.esperar], ["hf-2", p.esperar]]);
    const enMarcha: string[] = [];
    const colaDoble = crearCola({
      maxSimultaneos: 2,
      reloj: relojDePrueba(),
      ejecutar: async (t: { id: string }) => { enMarcha.push(t.id); await porId.get(t.id); return "ok"; },
    });
    const a = colaDoble.encolar({ proyecto: "A" });
    const b = colaDoble.encolar({ proyecto: "B" });
    await listas();
    expect(colaDoble.estado(a).estado).toBe("renderizando");
    expect(colaDoble.estado(b).estado).toBe("renderizando");
    expect(enMarcha).toEqual(["hf-1", "hf-2"]);
    p.abre();
    await listas();
    expect(colaDoble.estado(a).estado).toBe("hecho");
    expect(colaDoble.estado(b).estado).toBe("hecho");
  });

  it("cancelar() marca el corte en el momento y se descarta el resultado tardío", async () => {
    const p = puerta();
    let viva = true;
    let descanso = 0;
    const colaCorta = crearCola({
      reloj: relojDePrueba(),
      maxSimultaneos: 1,
      ejecutar: async (t: { id: string }, canal: { linea: (s: string) => void; cancelada: () => boolean }) => {
        while (viva && descanso === 0) {
          if (canal.cancelada()) break;
          await p.esperar;
        }
        canal.linea("@hf-progress {\"percent\":99}");
        return "/tardio.mp4";
      },
    });
    const enR = colaCorta.encolar({ proyecto: "viva" });
    const enC = colaCorta.encolar({ proyecto: "caduca" });
    await listas();
    expect(colaCorta.estado(enC).estado).toBe("en-cola"); // hueco ocupado por «viva»
    expect(colaCorta.cancelar(enC)).toBe(true); // la cancelación de «en-cola» es inmediata
    expect(colaCorta.estado(enC)).toMatchObject({ estado: "cancelado", motivo: "se pidió cancelar" });
    expect(colaCorta.estado(enR).estado).toBe("renderizando");
    viva = false;
    expect(colaCorta.cancelar(enR)).toBe(true);
    expect(colaCorta.estado(enR)).toMatchObject({ estado: "cancelado", motivo: "se pidió cancelar" });
    descanso = 1;
    p.abre();
    await listas();
    // el ejecutor sale y devuelve /tardio.mp4 más progreso, pero el estado ya es terminal: se descarta
    expect(colaCorta.estado(enR)).toMatchObject({ estado: "cancelado", motivo: "se pidió cancelar", resultado: null });
    expect(colaCorta.cancelar(enR)).toBe(false);
    expect(colaCorta.cancelar(enC)).toBe(false);
    expect(colaCorta.cancelar("fantasma")).toBe(false);
  });
});

describe("cola de render · tiempo máximo y fallos", () => {
  it("si se pasa del tiempo máximo queda «fallo» y el resultado tardío se descarta", async () => {
    const reloj = relojDePrueba();
    const p = puerta();
    const colaLenta = crearCola({
      reloj, maxSegundos: 5,
      ejecutar: async () => { await p.esperar; return "/tarde.mp4"; },
    });
    const id = colaLenta.encolar({ proyecto: "<html></html>" });
    await listas();
    expect(colaLenta.estado(id).estado).toBe("renderizando");
    reloj.avanza(4000);
    expect(colaLenta.estado(id).estado).toBe("renderizando"); // aún dentro del plazo
    reloj.avanza(1000);
    expect(colaLenta.estado(id)).toMatchObject({ estado: "fallo", motivo: "agotó el tiempo máximo (5 s)" });
    p.abre();
    await listas();
    expect(colaLenta.estado(id)).toMatchObject({ estado: "fallo", resultado: null }); // el resultado tardío no pisa el estado
  });

  it("el ejecutor que lanza da «fallo» con el motivo sin rutas y suelta el hueco", async () => {
    const colaFallora = crearCola({
      reloj: relojDePrueba(),
      maxSimultaneos: 1,
      ejecutar: async (t: { id: string }) => {
        if (t.id === "hf-1") throw new Error("petó en /home/alex/x/y.html");
        return "ok";
      },
    });
    const malo = colaFallora.encolar({ proyecto: "<a></a>" });
    const bueno = colaFallora.encolar({ proyecto: "<b></b>" });
    await listas();
    expect(colaFallora.estado(malo)).toMatchObject({ estado: "fallo", motivo: "petó en <ruta>" });
    expect(colaFallora.estado(bueno).estado).toBe("hecho"); // el hueco se liberó sin ayuda
  });

  it("crearCola es honesta con lo que le falta y recorta los topes a sus límites", async () => {
    expect(() => crearCola({ reloj: relojDePrueba() })).toThrow(/ejecutar/);
    expect(() => crearCola({})).toThrow(/ejecutar/);
    expect(() => crearCola({ ejecutar: async () => null, reloj: null as never })).toThrow(/reloj/);
    const p = puerta();
    const colaTopada = crearCola({ ejecutar: async () => { await p.esperar; return null; }, maxSimultaneos: 99, maxSegundos: 7200 });
    const a = colaTopada.encolar({ proyecto: "A" });
    expect(colaTopada.estado(a).estado).toBe("renderizando");
  });
});
