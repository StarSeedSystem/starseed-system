/**
 * Contrato entre el puente (`puente-herramientas.ts`) y los documentos de los átomos propios.
 * Los dos lados se escribieron por separado (F1A y F1C) y no hablaban el mismo protocolo: el OS
 * mandaba `establecer {parametroId, valor}` y el sintetizador esperaba `{parametro: {id, valor}}`,
 * así que ningún control movía el sonido. Aquí el documento se EJECUTA con un navegador de mentira
 * (solo en la prueba; el producto nunca ejecuta nada ajeno) y se le habla con las funciones reales del puente.
 *
 * El navegador de mentira es estricto donde lo es el de verdad: `setValueAtTime` lanza ante un valor que no es
 * finito, una rampa exponencial no admite 0, un oscilador solo arranca una vez y no se detiene sin haber arrancado.
 * Todo lo que lanza queda en `fallos`: el documento se traga las excepciones de su oyente, así que sin esa lista
 * una cadena rota pasaría por «ignorar el valor».
 */
import { describe, it, expect } from "vitest";
import { ATOMOS_PROPIOS } from "./index";
import { SINTETIZADOR } from "./sintetizador";
import type { Parametro } from "../tipos";
import { mensajeParaMarco, procesarMensaje, MENSAJES_POR_SEGUNDO, type Marco } from "../puente-herramientas";
import { limpiarRegistro, registrarAtomo } from "../registro-atomos";

const TOKEN = "c".repeat(32);
const dB = (v: number) => 10 ** (v / 20);

type Evento = [tipo: string, valor: number, tiempo: number];

/** Cómo está el audio del navegador simulado: con Web Audio, sin él, o con él pero bloqueado por una política (el constructor lanza). */
type EstadoAudio = "normal" | "ausente" | "bloqueado";
const MOTIVO_BLOQUEO = "Autoplay bloqueado por la política del navegador";

/** Ejecuta el <script> del documento con ventana, padre, documento y AudioContext simulados. */
function ejecutar(html: string, audio: EstadoAudio = "normal") {
  const script = /<script>([\s\S]*)<\/script>/.exec(html.replace("__PM_CANAL__", TOKEN))?.[1] ?? "";
  const fallos: string[] = [];
  const falla = (motivo: string): never => {
    fallos.push(motivo);
    throw new Error(motivo);
  };
  const param = () => {
    const eventos: Evento[] = [];
    return {
      valor: undefined as number | undefined,
      eventos,
      setValueAtTime(v: number, t: number) { if (!Number.isFinite(v)) falla(`setValueAtTime(${v})`); this.valor = v; eventos.push(["fija", v, t]); },
      linearRampToValueAtTime(v: number, t: number) { if (!Number.isFinite(v)) falla(`linearRamp(${v})`); eventos.push(["lineal", v, t]); },
      exponentialRampToValueAtTime(v: number, t: number) { if (!(v > 0)) falla(`exponentialRamp(${v})`); eventos.push(["exponencial", v, t]); },
      cancelScheduledValues(t: number) { eventos.push(["cancela", 0, t]); },
    };
  };
  const nodo = () => ({
    type: "", inicios: 0, paradas: 0, salidas: [] as unknown[],
    frequency: param(), Q: param(), delayTime: param(), gain: param(),
    connect(destino: unknown) { this.salidas.push(destino); },
    start() { if (this.inicios > 0) falla("start() dos veces"); this.inicios++; },
    stop() { if (this.inicios === 0) falla("stop() sin start()"); this.paradas++; },
  });
  const nodos: ReturnType<typeof nodo>[] = [];
  const contextos: { cerrado: boolean }[] = [];
  class AudioSimulado {
    currentTime = 0; destination = { destino: true }; cerrado = false;
    constructor() { contextos.push(this); }
    private nuevo() { const n = nodo(); nodos.push(n); return n; }
    createOscillator() { return this.nuevo(); }
    createBiquadFilter() { return this.nuevo(); }
    createDelay() { return this.nuevo(); }
    createGain() { return this.nuevo(); }
    close() { this.cerrado = true; }
  }
  class AudioBloqueado {
    constructor() { throw new Error(MOTIVO_BLOQUEO); }
  }
  const enviados: Record<string, unknown>[] = [];
  const padre = { postMessage: (m: Record<string, unknown>) => { enviados.push(m); } };
  let alMensaje: (e: { source: unknown; data: unknown }) => void = () => {};
  let alClic: () => void = () => {};
  const contexto = audio === "normal" ? { AudioContext: AudioSimulado } : audio === "bloqueado" ? { AudioContext: AudioBloqueado } : {};
  const ventana = { ...contexto, addEventListener: (t: string, f: typeof alMensaje) => { if (t === "message") alMensaje = f; } };
  const documento = { getElementById: () => ({ addEventListener: (_: string, f: () => void) => { alClic = f; } }) };
  new Function("window", "parent", "document", script)(ventana, padre, documento);
  return {
    enviados, nodos, padre, fallos, contextos,
    clic: () => alClic(),
    /** Lo que el OS le manda: siempre construido con `mensajeParaMarco`. */
    osLeDice: (tipo: Parameters<typeof mensajeParaMarco>[0], carga: Record<string, unknown>, token = TOKEN, source: unknown = padre) =>
      alMensaje({ source, data: mensajeParaMarco(tipo, carga, token) }),
  };
}

const marcoDe = (ventana: unknown): Marco => ({ ventana, token: TOKEN, origenEsperado: null, parametros: SINTETIZADOR.parametros });
const fichas = () => ({ fichas: MENSAJES_POR_SEGUNDO, proximaRecarga: 0 });
const documento = () => (SINTETIZADOR.vista?.tipo === "documento" ? SINTETIZADOR.vista.documento() : "");
/** Documento ya cargado y con el audio activado: [0] oscilador, [1] filtro, [2] retardo, [3] ganancia, [4] realimentación, [5] mezcla del eco. */
function activo() {
  const s = ejecutar(documento());
  s.clic();
  const [oscilador, filtro, retardo, ganancia, realimentacion, mezcla] = s.nodos;
  return { s, oscilador, filtro, retardo, ganancia, realimentacion, mezcla };
}

describe("sintetizador ⇄ puente", () => {
  it("lo que dice el documento (hola al cargar, listo al activar) lo acepta el puente", () => {
    const s = ejecutar(documento());
    s.clic();
    expect(s.enviados.map((m) => m.tipo)).toEqual(["hola", "listo"]);
    for (const m of s.enviados) {
      const r = procesarMensaje({ origin: "null", source: s.padre, data: m }, marcoDe(s.padre), 0, fichas());
      expect(r.motivo).toBeUndefined();
      expect(r.entrada?.tipo).toBe(m.tipo);
    }
  });
  it("el hola declara los 11 parámetros del sintetizador: el puente los devuelve tal cual y el registro los admite", () => {
    const s = ejecutar(documento());
    const hola = s.enviados.find((m) => m.tipo === "hola");
    const r = procesarMensaje({ origin: "null", source: s.padre, data: hola }, marcoDe(s.padre), 0, fichas());
    const declarados = r.entrada?.parametros as Parametro[];
    expect(declarados).toHaveLength(11);
    const clave = ({ id, nombre, tipo, min, max, paso, unidad, opciones, sinonimos }: Parametro) => ({ id, nombre, tipo, min, max, paso, unidad, opciones, sinonimos });
    expect(declarados.map(clave)).toEqual(SINTETIZADOR.parametros.map(clave)); // ni uno descartado ni uno recortado por el saneo del puente
    limpiarRegistro();
    expect(registrarAtomo({ ...SINTETIZADOR, parametros: declarados })).toEqual({ ok: true });
    limpiarRegistro();
  });
  it("establecer {parametroId, valor} mueve el sonido (y se acota al rango del parámetro)", () => {
    const { s, oscilador, filtro, retardo, realimentacion, mezcla } = activo();
    s.osLeDice("establecer", { parametroId: "frecuencia", valor: 880 });
    expect(oscilador.frequency.valor).toBe(880);
    s.osLeDice("establecer", { parametroId: "frecuencia", valor: 1e9 });
    expect(oscilador.frequency.valor).toBe(20000);
    s.osLeDice("establecer", { parametroId: "corte", valor: 1200 });
    expect(filtro.frequency.valor).toBe(1200);
    s.osLeDice("establecer", { parametroId: "resonancia", valor: 9 });
    expect(filtro.Q.valor).toBe(9);
    s.osLeDice("establecer", { parametroId: "eco", valor: 100 });
    expect(retardo.delayTime.valor).toBeCloseTo(0.45);
    expect(mezcla.gain.valor).toBe(1);
    expect(realimentacion.gain.valor).toBeCloseTo(0.6);
    expect(s.fallos).toEqual([]);
  });
  it("las cuatro ondas y los tres filtros llegan al oscilador y al filtro; una opción inventada no cambia nada", () => {
    const { s, oscilador, filtro } = activo();
    const ondas: Record<string, string> = { seno: "sine", cuadrada: "square", sierra: "sawtooth", triangulo: "triangle" };
    for (const [opcion, tipo] of Object.entries(ondas)) {
      s.osLeDice("establecer", { parametroId: "onda", valor: opcion });
      expect(oscilador.type).toBe(tipo);
    }
    const filtros: Record<string, string> = { "paso bajo": "lowpass", "paso alto": "highpass", banda: "bandpass" };
    for (const [opcion, tipo] of Object.entries(filtros)) {
      s.osLeDice("establecer", { parametroId: "filtro", valor: opcion });
      expect(filtro.type).toBe(tipo);
    }
    s.osLeDice("establecer", { parametroId: "onda", valor: "ruido" });
    s.osLeDice("establecer", { parametroId: "filtro", valor: "peine" });
    s.osLeDice("establecer", { parametroId: "onda", valor: 3 });
    expect(oscilador.type).toBe("triangle");
    expect(filtro.type).toBe("bandpass");
    s.osLeDice("estado", { valores: { onda: "ruido" } }); // la opción inventada tampoco entra por «estado»
    expect(oscilador.type).toBe("triangle");
  });
  it("estado {valores} aplica varios a la vez", () => {
    const { s, oscilador, filtro } = activo();
    s.osLeDice("estado", { valores: { frecuencia: 330, onda: "cuadrada", filtro: "banda" } });
    expect(oscilador.frequency.valor).toBe(330);
    expect(oscilador.type).toBe("square");
    expect(filtro.type).toBe("bandpass");
  });
  it("lo que el OS manda antes de activar el audio se recuerda y se aplica al crear la cadena", () => {
    const s = ejecutar(documento());
    s.osLeDice("estado", { valores: { frecuencia: 660, volumen: -6, sonando: true } }); // todavía no hay AudioContext: no debe lanzar
    s.clic();
    expect(s.nodos[0].frequency.valor).toBe(660);
    expect(s.nodos[3].gain.valor).toBeCloseTo(dB(-6));
    expect(s.nodos[0].inicios).toBe(1); // «sonando» pedido de antemano suena en cuanto hay audio
    expect(s.fallos).toEqual([]);
  });
  it("activar el audio otra vez cierra la cadena anterior y crea otra con lo ya establecido", () => {
    const { s, oscilador } = activo();
    s.osLeDice("estado", { valores: { frecuencia: 523, sonando: true } });
    s.clic();
    expect(s.contextos[0].cerrado).toBe(true);
    const nuevo = s.nodos[6]; // los seis nodos de la primera cadena y, detrás, el oscilador de la segunda
    expect(nuevo).not.toBe(oscilador);
    expect(nuevo.frequency.valor).toBe(523);
    expect(nuevo.inicios).toBe(1);
    expect(s.fallos).toEqual([]);
  });
});

describe("sintetizador · «sonando» sostiene el tono y «nota» es una envolvente", () => {
  it("sonando=true sostiene el tono al volumen elegido, sin rampa de bajada", () => {
    const { s, oscilador, ganancia } = activo();
    expect(oscilador.inicios).toBe(0); // activar el audio crea la cadena, no hace sonar nada
    s.osLeDice("establecer", { parametroId: "sonando", valor: true });
    expect(oscilador.inicios).toBe(1);
    expect(ganancia.gain.valor).toBeCloseTo(dB(-12));
    expect(ganancia.gain.eventos.filter(([tipo]) => tipo === "lineal" || tipo === "exponencial")).toEqual([]);
    s.osLeDice("establecer", { parametroId: "volumen", valor: 0 }); // con tono sostenido, el volumen se oye
    expect(ganancia.gain.valor).toBe(1);
    s.osLeDice("establecer", { parametroId: "sonando", valor: true }); // pedirlo otra vez no relanza el oscilador ni lanza una excepción
    expect(oscilador.inicios).toBe(1);
    expect(s.fallos).toEqual([]);
  });
  it("sonando=false detiene el oscilador y deja otro listo; sonando=true lo arranca", () => {
    const { s, oscilador, filtro } = activo();
    s.osLeDice("establecer", { parametroId: "frecuencia", valor: 300 });
    s.osLeDice("establecer", { parametroId: "sonando", valor: true });
    s.osLeDice("establecer", { parametroId: "sonando", valor: "no" }); // no es un booleano: no apaga nada
    expect(oscilador.paradas).toBe(0);
    s.osLeDice("establecer", { parametroId: "sonando", valor: false });
    expect(oscilador.paradas).toBe(1);
    const siguiente = s.nodos[6];
    expect(siguiente.salidas).toContain(filtro);
    expect(siguiente.frequency.valor).toBe(300);
    expect(siguiente.inicios).toBe(0);
    s.osLeDice("establecer", { parametroId: "sonando", valor: true });
    expect(siguiente.inicios).toBe(1);
    expect(s.fallos).toEqual([]);
  });
  it("disparar «nota» sin tono sostenido: sube en «ataque», baja en «liberacion» y vuelve al silencio sin tocar «sonando»", () => {
    const { s, oscilador, ganancia } = activo();
    s.osLeDice("establecer", { parametroId: "ataque", valor: 0.5 });
    s.osLeDice("establecer", { parametroId: "liberacion", valor: 2 });
    s.osLeDice("establecer", { parametroId: "volumen", valor: -6 });
    const antes = ganancia.gain.eventos.length;
    s.osLeDice("disparar", { parametroId: "nota" });
    expect(oscilador.inicios).toBe(1);
    const eventos = ganancia.gain.eventos.slice(antes);
    expect(eventos.map(([tipo, , tiempo]) => [tipo, tiempo])).toEqual([["cancela", 0], ["fija", 0], ["lineal", 0.5], ["exponencial", 2.5], ["fija", 2.5]]);
    expect(eventos.map(([, valor]) => valor)[1]).toBe(0.001); // arranca desde el silencio
    expect(eventos[2][1]).toBeCloseTo(dB(-6)); // sube hasta el volumen elegido
    expect(eventos[3][1]).toBe(0.001); // baja al silencio
    expect(eventos[4][1]).toBe(0); // y se queda en 0, no en -60 dB
    // «sonando» sigue apagado: mover el volumen no hace reaparecer el tono (antes devolvía la ganancia y el oscilador seguía vivo)
    s.osLeDice("establecer", { parametroId: "volumen", valor: 0 });
    expect(ganancia.gain.valor).toBe(0);
    s.osLeDice("disparar", { parametroId: "nota" }); // una segunda nota no vuelve a arrancar el oscilador
    expect(oscilador.inicios).toBe(1);
    expect(s.fallos).toEqual([]);
  });
  it("con tono sostenido, la nota re-articula y vuelve a sostener: no hay rampa de bajada", () => {
    const { s, ganancia } = activo();
    s.osLeDice("establecer", { parametroId: "sonando", valor: true });
    const antes = ganancia.gain.eventos.length;
    s.osLeDice("disparar", { parametroId: "nota" });
    const eventos = ganancia.gain.eventos.slice(antes);
    expect(eventos.map(([tipo]) => tipo)).toEqual(["cancela", "fija", "lineal"]);
    expect(eventos[2][1]).toBeCloseTo(dB(-12));
    expect(s.fallos).toEqual([]);
  });
  it("un disparo que no es de este átomo no hace nada", () => {
    const { s, oscilador, ganancia } = activo();
    const antes = ganancia.gain.eventos.length;
    s.osLeDice("disparar", { parametroId: "otra-cosa" });
    expect(oscilador.inicios).toBe(0);
    expect(ganancia.gain.eventos.length).toBe(antes);
  });
});

describe("sintetizador · si el audio no se puede crear, lo dice", () => {
  it.each([
    ["el navegador no tiene Web Audio", "ausente", "este navegador no tiene Web Audio"],
    ["una política del navegador lo bloquea", "bloqueado", MOTIVO_BLOQUEO],
  ] as const)("%s: manda «error» con el motivo, nunca «listo», y el puente lo acepta", (_nombre, audio, motivo) => {
    const s = ejecutar(documento(), audio);
    s.clic();
    expect(s.enviados.map((m) => m.tipo)).toEqual(["hola", "error"]);
    const error = s.enviados[1];
    expect(error.mensaje).toBe(`No se pudo activar el audio: ${motivo}`);
    const r = procesarMensaje({ origin: "null", source: s.padre, data: error }, marcoDe(s.padre), 0, fichas());
    expect(r.motivo).toBeUndefined();
    expect(r.entrada).toMatchObject({ tipo: "error", mensaje: error.mensaje });
    expect(s.nodos).toEqual([]);
  });
  it("después del fallo el documento sigue vivo: recuerda lo que manda el OS, no lanza y vuelve a intentarlo", () => {
    const s = ejecutar(documento(), "bloqueado");
    s.clic();
    s.osLeDice("estado", { valores: { frecuencia: 660, sonando: true } });
    s.osLeDice("disparar", { parametroId: "nota" });
    s.clic();
    expect(s.enviados.map((m) => m.tipo)).toEqual(["hola", "error", "error"]);
    expect(s.fallos).toEqual([]);
  });
});

describe("sintetizador · eco", () => {
  it("la realimentación pasa por una ganancia menor que 1: el retardo nunca se alimenta a sí mismo sin atenuar", () => {
    const { s, retardo, realimentacion, mezcla, ganancia } = activo();
    expect(retardo.salidas).not.toContain(retardo);
    expect(retardo.salidas).toEqual(expect.arrayContaining([mezcla, realimentacion]));
    expect(realimentacion.salidas).toEqual([retardo]);
    expect(ganancia.salidas).toContain(retardo); // el eco sale de la ganancia: la envolvente de la nota no lo corta
    for (const eco of [0, 1, 50, 100]) {
      s.osLeDice("establecer", { parametroId: "eco", valor: eco });
      expect(realimentacion.gain.valor).toBeLessThan(1);
      expect(mezcla.gain.valor).toBeCloseTo(eco / 100);
    }
  });
  it("con eco 0 no se oye eco: ni mezcla ni realimentación", () => {
    const { mezcla, realimentacion } = activo();
    expect(mezcla.gain.valor).toBe(0);
    expect(realimentacion.gain.valor).toBe(0);
  });
});

describe("sintetizador · lo que no se debe creer", () => {
  it.each([["no numérico", "abc"], ["NaN", NaN], ["Infinity", Infinity], ["-Infinity", -Infinity], ["ausente", undefined], ["booleano", true], ["lista", [1]]])(
    "un valor %s no mueve ningún parámetro numérico ni rompe la cadena",
    (_nombre, valor) => {
      const { s, oscilador, filtro, retardo, ganancia } = activo();
      s.osLeDice("establecer", { parametroId: "sonando", valor: true }); // así el volumen también toca la ganancia
      const ids = SINTETIZADOR.parametros.filter((p) => p.tipo === "numero").map((p) => p.id);
      for (const id of ids) s.osLeDice("establecer", { parametroId: id, valor });
      s.osLeDice("estado", { valores: Object.fromEntries(ids.map((id) => [id, valor])) });
      expect(s.fallos).toEqual([]); // el navegador de verdad lanzaría con NaN: aquí se vio que nadie llegó a pedirlo
      expect(oscilador.frequency.valor).toBe(440);
      expect(filtro.frequency.valor).toBe(4000);
      expect(retardo.delayTime.valor).toBeCloseTo(0.15);
      expect(ganancia.gain.valor).toBeCloseTo(dB(-12));
      s.osLeDice("establecer", { parametroId: "frecuencia", valor: 500 }); // sigue obedeciendo después
      expect(oscilador.frequency.valor).toBe(500);
    },
  );
  it("ignora otro canal, otra ventana y la forma antigua {parametro: {id, valor}}", () => {
    const { s, oscilador } = activo();
    s.osLeDice("establecer", { parametroId: "frecuencia", valor: 700 }, "otro-canal");
    s.osLeDice("establecer", { parametroId: "frecuencia", valor: 700 }, TOKEN, {});
    s.osLeDice("establecer", { parametro: { id: "frecuencia", valor: 700 } });
    expect(oscilador.frequency.valor).toBe(440);
  });
  it("cada parámetro que no es un disparo tiene su rama en el documento", () => {
    const html = documento();
    for (const p of SINTETIZADOR.parametros.filter((q) => q.tipo !== "disparo")) expect(html).toContain(`case "${p.id}"`);
  });
});

describe("todos los átomos con documento", () => {
  it("nombran el protocolo del puente y ninguna forma antigua", () => {
    for (const def of ATOMOS_PROPIOS) {
      if (def.vista?.tipo !== "documento") continue;
      const html = def.vista.documento();
      expect(html).toContain("protomolecula:1");
      expect(html).not.toContain("msg.parametro.");
    }
  });
});
