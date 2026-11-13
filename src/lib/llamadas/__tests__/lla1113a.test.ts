/**
 * LLA1113A · Lo que la prueba 40 enseñó en el aparato, reproducido con las piezas DE VERDAD (no con la entrada ya cocinada):
 *  · A: la red nativa hacia la tableta (Wi-Fi apagado) cae 30 s y vuelve sola con el rtt de un envío de hace minutos.
 *    `hayRutaIpHacia`/`rutaIpConTrafico`/`fuenteRutaIpHacia` reales (con la lista de enlaces que da la red nativa) y la decisión
 *    de LLA1112A, tic a tic como el motor. En el aparato: 32 reintentos de WebRTC en 12 min, cada vuelta «intento=1».
 *  · B: el reloj de la llamada sigue con su Worker cuando la página corre una vez por segundo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const red = vi.hoisted(() => ({ nativo: null as null | { abierto: boolean; rtt: number | null } }));

vi.mock("@/lib/malla/transporte-universal", () => ({
  enlacesDisponibles: async () =>
    red.nativo ? [{ id: "nativo:x", tipo: "nativo", etiqueta: "Maggaboard · red local", alcanza: { neuronDeviceId: "tab" }, abierto: red.nativo.abierto, rttMs: red.nativo.rtt }] : [],
}));
vi.mock("@/lib/malla/registro-enlaces-locales", () => ({ enlaceVivoMasNuevoCon: () => null }));
vi.mock("@/lib/malla/enlace-wifi-orquestacion", () => ({ enlaceWifiDe: () => null }));

import * as T from "@/lib/llamadas/voz-datos/transporte";
import { decidirReintentoIce } from "@/lib/llamadas/carriles";
import { PERIODO_TIC_MS, RelojEstable, UMBRAL_PAGINA_LENTA_MS, type TicWorker } from "@/lib/llamadas/reloj-estable";

async function avanzar(ms: number) {
  vi.advanceTimersByTime(ms);
  await vi.dynamicImportSettled();
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

/**
 * La llamada 2 de la prueba 40 (01:37:01–01:42:04, solo Bluetooth, Wi-Fi de la tableta apagado), tic de 500 ms como el
 * vigilante: la red nativa se ve abierta unos 24 s (lo que tarda en juntar seis envíos sin acuse) y caída 30 s (`CAIDA_MS`),
 * siempre con el rtt del último envío que salió bien (12 ms). Devuelve los reintentos y los descartes por «sin-trafico».
 */
async function llamadaSinWifi(opc: { segundos: number; abierta: (s: number) => boolean; rtt?: (s: number) => number }) {
  (T as unknown as { __olvidarRutasIp?: () => void }).__olvidarRutasIp?.();
  red.nativo = { abierto: false, rtt: 12 };
  const reintentos: Array<{ s: number; n: number; motivo: string }> = [];
  let sinTrafico = 0;
  let antes: boolean | null = null;
  let intentos = 0;
  let ultimo = -Infinity;
  let fuenteAnterior: string | null = null;
  let conexion = "conectando";
  for (let t = 0; t <= opc.segundos * 1000; t += 500) {
    const s = t / 1000;
    red.nativo = { abierto: opc.abierta(s), rtt: opc.rtt ? opc.rtt(s) : 12 };
    const ip = T.hayRutaIpHacia("tab");
    if (ip === true) {
      const fuente = T.fuenteRutaIpHacia("tab");
      const d = decidirReintentoIce({ ahora: t, ip, antes, conTrafico: T.rutaIpConTrafico("tab"), fuente, fuenteAnterior, conexion, intentos, ultimoIntento: ultimo });
      if (d.reintentar) {
        reintentos.push({ s, n: d.n, motivo: d.motivo });
        ultimo = t;
        intentos = d.n;
        fuenteAnterior = fuente;
        conexion = "reconectando";
      } else if (d.motivo === "sin-trafico") sinTrafico++;
    }
    antes = ip;
    await avanzar(500);
  }
  return { reintentos, sinTrafico };
}

/** Abierta 24 s, caída 30 s, desde los 22 s (en el aparato: 01:37:24, 01:38:15, 01:39:06, 01:39:55…). */
const abiertaComoPrueba40 = (s: number) => s >= 22 && (s - 22) % 54 < 24;

describe("A · una ruta IP que cae y vuelve con un rtt viejo no hace reintentar WebRTC", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-13T01:37:01Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("prueba 40, llamada 2: ningún reintento en 5 min y la ruta queda «sin usar»", async () => {
    const r = await llamadaSinWifi({ segundos: 300, abierta: abiertaComoPrueba40 });
    // Antes de LLA1113A: 3 reintentos por vuelta de la ruta («intento=1,2,3» y vuelta a empezar), como en el aparato.
    expect(r.reintentos).toEqual([]);
    expect(r.sinTrafico).toBeGreaterThan(0);
  });

  it("si la ruta lleva algo otra vez (un envío sale bien: rtt nuevo), WebRTC se reintenta por ella", async () => {
    // El Wi-Fi de la tableta vuelve a los 130 s: el siguiente envío por la red nativa sale bien (rtt 9) y la ruta se queda.
    const r = await llamadaSinWifi({ segundos: 200, abierta: (s) => (s >= 130 ? true : abiertaComoPrueba40(s)), rtt: (s) => (s >= 131 ? 9 : 12) });
    expect(r.reintentos.length).toBeGreaterThan(0);
    expect(r.reintentos[0].s).toBeGreaterThanOrEqual(131);
    expect(r.reintentos[0].s).toBeLessThan(135);
  });
});

/** Un Worker de mentira: su tic lo da el reloj falso de vitest con un temporizador propio (no el de la «página»). */
function workerFalso(intervaloReal: (fn: () => void, ms: number) => unknown, parar: (id: unknown) => void): TicWorker {
  let id: unknown = null;
  const w: TicWorker = {
    onmessage: null,
    postMessage: (m) => {
      if (id !== null) parar(id);
      id = null;
      const ms = (m as { ms?: number })?.ms ?? 0;
      if (ms > 0) id = intervaloReal(() => w.onmessage?.({ data: 1 }), ms);
    },
    terminate: () => {
      if (id !== null) parar(id);
      id = null;
    },
  };
  return w;
}

describe("B · el reloj de la llamada no se para con la página lenta", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Temporizadores de la página que, con `lenta`, corren como mucho una vez por segundo (WebKit, página oculta). */
  function paginaLentaSi(lenta: { v: boolean }) {
    return {
      setInterval: (fn: () => void, ms: number) => {
        let ult = -Infinity;
        return setInterval(() => {
          if (lenta.v && Date.now() - ult < 990) return;
          ult = Date.now();
          fn();
        }, ms);
      },
      clearInterval: (id: unknown) => clearInterval(id as ReturnType<typeof setInterval>),
    };
  }

  it("con Worker, una vuelta de 20 ms sigue a ~50/s con la página a 1/s, y lo deja en el registro", () => {
    const lenta = { v: false };
    const lineas: string[] = [];
    const reloj = new RelojEstable({ pagina: paginaLentaSi(lenta), crearWorker: () => workerFalso((f, ms) => setInterval(f, ms), (id) => clearInterval(id as ReturnType<typeof setInterval>)), anotar: (d) => lineas.push(d), visibilidad: () => "hidden" });
    let n = 0;
    const baja = reloj.cada(() => n++, PERIODO_TIC_MS);
    vi.advanceTimersByTime(2000);
    const normal = n;
    expect(normal).toBeGreaterThanOrEqual(80);
    expect(normal).toBeLessThanOrEqual(101);
    lenta.v = true;
    n = 0;
    vi.advanceTimersByTime(10_000);
    expect(n).toBeGreaterThanOrEqual(400);
    expect(lineas.some((l) => /reloj temporizadores-pagina lentos hueco=\d+ms worker=si .*visible=hidden/.test(l))).toBe(true);
    lenta.v = false;
    vi.advanceTimersByTime(8000);
    expect(lineas.some((l) => /reloj temporizadores-pagina normales tras=\d+s/.test(l))).toBe(true);
    baja();
    reloj.detener();
  });

  it("sin Worker corre con la página, exactamente como antes (y dice que no hay Worker)", () => {
    const lenta = { v: true };
    const lineas: string[] = [];
    const reloj = new RelojEstable({ pagina: paginaLentaSi(lenta), crearWorker: () => null, anotar: (d) => lineas.push(d) });
    let n = 0;
    reloj.cada(() => n++, 20);
    vi.advanceTimersByTime(5000);
    expect(n).toBeLessThanOrEqual(6);
    expect(lineas[0]).toMatch(/reloj sin-worker/);
    expect(UMBRAL_PAGINA_LENTA_MS).toBeGreaterThan(PERIODO_TIC_MS * 5);
    reloj.detener();
  });

  it("detener suelta el Worker y los temporizadores", () => {
    let vivos = 0;
    const reloj = new RelojEstable({
      pagina: { setInterval: (fn, ms) => (vivos++, setInterval(fn, ms)), clearInterval: (id) => (vivos--, clearInterval(id as ReturnType<typeof setInterval>)) },
      crearWorker: () => workerFalso((f, ms) => (vivos++, setInterval(f, ms)), (id) => (vivos--, clearInterval(id as ReturnType<typeof setInterval>))),
    });
    reloj.cada(() => undefined, 20);
    reloj.cada(() => undefined, 1000);
    expect(vivos).toBe(3);
    reloj.detener();
    expect(vivos).toBe(0);
    expect(reloj.estado().conWorker).toBe(false);
  });
});
