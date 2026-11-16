/**
 * BLE1109B — el ajuste «Canal rápido Bluetooth (experimental)»: encendido por defecto (apagable) y espejo del registro de enlaces.
 */
import { describe, expect, it } from "vitest";
import {
  AJUSTE_CANAL_RAPIDO_DEFECTO,
  MAX_LINEAS_ESPEJO_BLE,
  fijarCanalRapido,
  leerAjusteCanalRapido,
  leerEspejoRegistro,
  necesitaMigrarCanalRapido,
  RE_LINEA_DE_LLAMADA_BLE,
  recortarEspejoRegistro,
  RE_MARCA_DE_LLAMADA_BLE,
  MAX_LINEAS_MARCAS_ESPEJO_BLE,
  repartirEspejoConLlamada,
  serializarAjusteCanalRapido,
  sincronizarCanalRapido,
  textoEspejoRegistro,
  type DepsAjusteCanalRapido,
} from "@/lib/malla/canal-rapido-ajuste";
import { leerEstadoBle } from "@/lib/malla/bluetooth-directo";

function deps(guardado: string | null, nativo: boolean | null) {
  const reg = { guardado, nativo, llamadas: [] as Array<boolean | undefined> };
  const d: DepsAjusteCanalRapido = {
    leer: () => reg.guardado,
    escribir: (v) => void (reg.guardado = v),
    nativo: async (a) => {
      reg.llamadas.push(a);
      if (reg.nativo === null) return null;
      if (a !== undefined) reg.nativo = a;
      return reg.nativo;
    },
  };
  return { d, reg };
}

describe("canal rápido · ajuste", () => {
  it("por defecto está ENCENDIDO (prueba.31 no tenía ajuste: nada que migrar a apagado)", () => {
    expect(AJUSTE_CANAL_RAPIDO_DEFECTO.activo).toBe(true);
    expect(leerAjusteCanalRapido(null).activo).toBe(true);
    expect(leerAjusteCanalRapido("basura{").activo).toBe(true);
    expect(leerAjusteCanalRapido('{"activo":false}').activo).toBe(true); // sin versión: no es una elección de la persona
  });

  it("lo elegido a propósito se respeta; lo viejo solo pide ponerle versión", () => {
    expect(leerAjusteCanalRapido(serializarAjusteCanalRapido(false)).activo).toBe(false);
    expect(leerAjusteCanalRapido(serializarAjusteCanalRapido(true)).activo).toBe(true);
    expect(necesitaMigrarCanalRapido('{"activo":true}')).toBe(true);
    expect(necesitaMigrarCanalRapido("nada{")).toBe(true);
    expect(necesitaMigrarCanalRapido(null)).toBe(false);
    expect(necesitaMigrarCanalRapido(serializarAjusteCanalRapido(false))).toBe(false);
  });

  it("al arrancar no cambia el valor de la app nativa: solo deja el espejo al día", async () => {
    const a = deps('{"activo":true}', true);
    expect(await sincronizarCanalRapido(a.d)).toBe(true);
    expect(a.reg.llamadas).toEqual([undefined]); // solo lee
    expect(leerAjusteCanalRapido(a.reg.guardado).activo).toBe(true);
    const apagado = deps(serializarAjusteCanalRapido(false), false);
    expect(await sincronizarCanalRapido(apagado.d)).toBe(false);
    expect(apagado.reg.nativo).toBe(false);
    const b = deps(null, null);
    expect(await sincronizarCanalRapido(b.d)).toBeNull();
  });

  it("fijar guarda primero en la app nativa y luego el espejo", async () => {
    const { d, reg } = deps(null, true);
    expect(await fijarCanalRapido(d, false)).toEqual({ ok: true, activo: false });
    expect(reg.nativo).toBe(false);
    expect(leerAjusteCanalRapido(reg.guardado).activo).toBe(false);
    const sin = deps(null, null);
    expect(await fijarCanalRapido(sin.d, false)).toEqual({ ok: false, activo: false });
  });

  it("el estado nativo acepta los estados del canal rápido apagado y desactivado", () => {
    for (const x of ["apagado", "desactivado"]) {
      const e = { id: "b1", rol: "central", canal_rapido: x };
      const r = leerEstadoBle({ disponible: true, activo: true, radio: "encendida", plataforma: "macos", roles: [], enlaces: [e], vecinos: [] });
      expect(r?.enlaces[0]?.canal_rapido).toBe(x);
    }
  });
});

describe("registro de enlaces · espejo", () => {
  it("recorta a las últimas 50 líneas, limpias, y respeta el tope de tamaño", () => {
    const l = Array.from({ length: 80 }, (_, i) => `línea ${i}\n\u0007`);
    const r = recortarEspejoRegistro(l);
    expect(r.length).toBe(MAX_LINEAS_ESPEJO_BLE);
    expect(r[r.length - 1]).toBe("línea 79");
    expect(r.join("").includes("\n")).toBe(false);
    const gordas = recortarEspejoRegistro(Array.from({ length: 50 }, () => "x".repeat(500)));
    expect(JSON.stringify(gordas).length).toBeLessThan(10_000);
  });

  it("ida y vuelta, y se descarta lo que no es un espejo", () => {
    const t = textoEspejoRegistro(["a", "b"]);
    expect(leerEspejoRegistro(t)).toEqual(["a", "b"]);
    expect(leerEspejoRegistro('{"t":"nl.reg","l":"no"}')).toBeNull();
    expect(leerEspejoRegistro('{"t":"nl.reg","l":[]}')).toBeNull();
    expect(leerEspejoRegistro('{"t":"otro","l":["x"]}')).toBeNull();
    expect(leerEspejoRegistro("x")).toBeNull();
  });
});

describe("BLE1115C · la medida de una llamada llega entera por el espejo", () => {
  const pre = "2026-11-15T05:27:05.000Z · nativa · ble-enlace-llamada · b3 · neurona 0f9a7c1e-1111-2222-3333-444455556666 · ";
  const resumen = `${pre}n=24 dur-s=120 escrituras/s=1.2/9.8/14.1 bytes/escritura=138 ms-acuse=40/55/300/410 ms-puente=0.2 ms-socket=0.5 intervalo=- phy=2M mtu=515 rol=periferico perdidas=0 fuente=radio`;
  const muestras = `2026-11-15T05:27:05.000Z · nativa · ble-enlace-muestras · b3 · neurona 0f9a7c1e-1111-2222-3333-444455556666 · t0=05:25:07 paso=5 m=${Array.from({ length: 20 }, () => "12.4/138/49").join(";")}`;

  it("las líneas de llamada se reconocen y conservan hasta 480 caracteres; las demás, 240", () => {
    expect(RE_LINEA_DE_LLAMADA_BLE.test(resumen)).toBe(true);
    expect(RE_LINEA_DE_LLAMADA_BLE.test("2026-11-15T05:27:05.000Z · nativa · ble-enlace · b3 · escrituras/s=1")).toBe(false);
    expect(muestras.length).toBeGreaterThan(240);
    expect(recortarEspejoRegistro([muestras, resumen])).toEqual([muestras, resumen]);
    const larga = "2026-11-15T05:27:05.000Z · nativa · otra · " + "x".repeat(400);
    expect(recortarEspejoRegistro([larga])[0].length).toBe(240);
  });

  it("con 40 líneas normales detrás, el resumen y las muestras no caen por el tope de bytes", () => {
    const normales = Array.from({ length: 40 }, (_, i) => `2026-11-15T05:27:${String(10 + (i % 40)).padStart(2, "0")}.000Z · web · llamada · b3 · ${"y".repeat(150)} ${i}`);
    const r = repartirEspejoConLlamada(normales, [muestras, resumen], 3_500);
    expect(r.slice(-2)).toEqual([muestras, resumen]);
    expect(r.slice(0, -2).reduce((s, x) => s + x.length + 1, 0)).toBeLessThanOrEqual(3_500 + 240);
    expect(r.length).toBeLessThan(40);
  });

  it("una llamada larga (20 min) pierde las muestras viejas antes que el resumen", () => {
    const muchas = Array.from({ length: 12 }, (_, i) => muestras.replace("t0=05:25:07", `t0=05:${String(i).padStart(2, "0")}:00`));
    const r = repartirEspejoConLlamada([], [...muchas, resumen], 3_500);
    expect(r[r.length - 1]).toBe(resumen);
    expect(r.reduce((s, x) => s + x.length + 1, 0)).toBeLessThanOrEqual(4_200 + 480);
    expect(r.length).toBeLessThan(13);
    expect(JSON.stringify({ t: "nl.reg", l: r }).length).toBeLessThan(9_000);
  });
});

describe("FBM1116 · las marcas de una llamada sobreviven al espejo", () => {
  const web = (seg: number, detalle: string) => `2026-11-15T21:05:${String(seg).padStart(2, "0")}.000Z · web · llamada · b3 · neurona 0f9a7c1e-1111 · ${detalle}`;
  const contesta = web(1, "banco contesta esc=corte-ip-vuelve serie=s1 n=1 camara=si");
  const orden = web(2, 'banco orden contestar resultado=ok');
  const sim = web(3, "banco simulacion corte-ip medio_real=no");
  const ice = web(4, "medio=webrtc par=PAR2:2 ice=connected tras-reintentos=0");
  const ruido = (n: number) => Array.from({ length: n }, (_, i) => web(10 + (i % 40), `voz-datos rx n=${i} ${"y".repeat(120)}`));

  it("se reconocen las marcas del banco, el fin, contestada e ice=connected; el ruido no", () => {
    for (const m of [contesta, orden, sim, ice, web(5, 'fin por=colgar motivo="orden" contestada=si dur-s=116'), web(6, "contestada tipo=video")]) expect(RE_MARCA_DE_LLAMADA_BLE.test(m)).toBe(true);
    expect(RE_MARCA_DE_LLAMADA_BLE.test(ruido(1)[0])).toBe(false);
    expect(RE_MARCA_DE_LLAMADA_BLE.test(`2026-11-15T21:05:01.000Z · llamada · neurona x · banco contesta esc=a serie=b n=1 camara=si`)).toBe(true); // forma del archivo nativo
  });

  it("con 300 líneas de voz detrás, las marcas del principio llegan (antes se perdían)", () => {
    const nuevas = [contesta, orden, sim, ice, ...ruido(300)];
    const r = repartirEspejoConLlamada(nuevas, [], 3_500);
    for (const m of [contesta, orden, sim, ice]) expect(r).toContain(m);
    expect(r.filter((x) => !RE_MARCA_DE_LLAMADA_BLE.test(x)).reduce((s, x) => s + x.length + 1, 0)).toBeLessThanOrEqual(3_500 + 240);
    expect(r.join("\n").length).toBeLessThan(10_800);
  });

  it("el que recibe tampoco las recorta: ida y vuelta con ruido", () => {
    const l = repartirEspejoConLlamada([contesta, orden, sim, ice, ...ruido(300)], [], 3_500);
    const vuelta = leerEspejoRegistro(textoEspejoRegistro(l));
    expect(vuelta).not.toBeNull();
    for (const m of [contesta, orden, sim, ice]) expect(vuelta).toContain(m);
  });

  it("las marcas tienen tope propio (no crecen sin límite)", () => {
    const muchas = Array.from({ length: 100 }, (_, i) => web(i % 60, `banco orden micro resultado=ok i=${i}`));
    const r = recortarEspejoRegistro(muchas);
    expect(r.length).toBe(MAX_LINEAS_MARCAS_ESPEJO_BLE);
  });
});
