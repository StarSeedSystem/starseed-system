/**
 * LLA1110D — carriles por flujo: histéresis, enfriamiento, forzado, desempate y que nada salte.
 */
import { describe, expect, it } from "vitest";
import { LimiteRegistro, SelectorCarriles, carrilSano, soyDirector, textoCarriles, type Flujo, type Carril, type MuestraCarril } from "@/lib/llamadas/carriles";
import { evaluarDescripcion, soyCortes } from "@/lib/llamadas/negociacion";

const ble = (arriba = true, x: Partial<MuestraCarril> = {}): MuestraCarril => ({ carril: "ble-l2cap", arriba, rttMs: 80, ...x });
const web = (arriba = true, x: Partial<MuestraCarril> = {}): MuestraCarril => ({ carril: "webrtc", arriba, rttMs: 20, ...x });
const puede = (_f: Flujo, c: Carril) => c === "webrtc" || c === "ble-l2cap";

/** Corre el selector `ms` milisegundos con un tic de 500 ms y muestras que da `f(t)`. */
function correr(s: SelectorCarriles, desde: number, ms: number, f: (t: number) => MuestraCarril[], solo?: Flujo[]) {
  const cambios = [];
  for (let t = desde; t <= desde + ms; t += 500) cambios.push(...s.actualizar(f(t), t, puede, solo));
  return cambios;
}

describe("selector de carriles (LLA1110D)", () => {
  it("la voz que funciona por Bluetooth se queda aunque WebRTC aparezca; el vídeo sube a WebRTC tras la evidencia", () => {
    const s = new SelectorCarriles();
    s.fijar("voz", "ble-l2cap", 0);
    // Solo Bluetooth al principio: el vídeo va ligero por él.
    expect(s.actualizar([ble(), web(false)], 0, puede, ["voz", "video"]).map((c) => `${c.flujo}:${c.a}`)).toEqual(["video:ble-l2cap"]);
    // WebRTC conecta: durante 2.5 s nada cambia (histéresis); a los 3 s sube el vídeo, la voz NO.
    expect(correr(s, 500, 2400, () => [ble(), web()], ["voz", "video"])).toEqual([]);
    const c = correr(s, 3000, 500, () => [ble(), web()], ["voz", "video"]);
    expect(c.map((x) => `${x.flujo}:${x.a}:${x.motivo}`)).toEqual(["video:webrtc:webrtc-mejor-sostenido"]);
    expect(s.carril("voz")).toBe("ble-l2cap");
  });

  it("con dos carriles arriba durante 5 minutos y ruido, los cambios se cuentan con los dedos de una mano", () => {
    const s = new SelectorCarriles();
    s.fijar("voz", "ble-l2cap", 0);
    // WebRTC parpadea cada 1.3 s (el peor caso: dos medios que se contradicen); Bluetooth estable.
    const cambios = correr(s, 0, 300_000, (t) => [ble(), web(Math.floor(t / 1300) % 2 === 0)], ["voz", "video", "pantalla"]);
    expect(cambios.length).toBeLessThanOrEqual(4);
    expect(cambios.filter((c) => c.flujo === "voz")).toEqual([]);
  });

  it("la voz se mueve UNA vez cuando su carril se cae de forma sostenida, y vuelve con enfriamiento", () => {
    const s = new SelectorCarriles();
    s.fijar("voz", "ble-l2cap", 0);
    // Bluetooth se cae: media evidencia (3 s) y pasa a WebRTC.
    const c1 = correr(s, 0, 5000, () => [ble(false), web()], ["voz"]);
    expect(c1.map((c) => `${c.de}>${c.a}:${c.motivo}`)).toEqual(["ble-l2cap>webrtc:ble-l2cap-caido"]);
    // Bluetooth vuelve: la voz NO vuelve (se queda donde funciona).
    expect(correr(s, 5500, 60_000, () => [ble(), web()], ["voz"])).toEqual([]);
    // WebRTC se degrada (pérdida 20 %) pocos segundos: nada; sostenido 6 s y pasado el enfriamiento (30 s): una vez.
    expect(correr(s, 66_000, 4000, () => [ble(), web(true, { perdidaPct: 20 })], ["voz"])).toEqual([]);
    const c2 = correr(s, 70_500, 10_000, () => [ble(), web(true, { perdidaPct: 20 })], ["voz"]);
    expect(c2.map((c) => `${c.de}>${c.a}`)).toEqual(["webrtc>ble-l2cap"]);
  });

  it("cada flujo cae por su cuenta: perder WebRTC baja el vídeo y no toca la voz por Bluetooth", () => {
    const s = new SelectorCarriles();
    s.fijar("voz", "ble-l2cap", 0);
    correr(s, 0, 4000, () => [ble(), web()], ["voz", "video"]);
    expect(s.carril("video")).toBe("webrtc");
    const c = correr(s, 4500, 3000, () => [ble(), web(false)], ["voz", "video"]);
    expect(c.map((x) => `${x.flujo}:${x.a}`)).toEqual(["video:ble-l2cap"]);
    expect(s.carril("voz")).toBe("ble-l2cap");
  });

  it("forzado por la persona: manda si está arriba; si no, la elección automática", () => {
    const s = new SelectorCarriles();
    correr(s, 0, 4000, () => [ble(), web()], ["video"]);
    expect(s.carril("video")).toBe("webrtc");
    s.forzar("video", "ble-l2cap");
    expect(s.actualizar([ble(), web()], 4500, puede, ["video"]).map((c) => c.motivo)).toEqual(["forzado"]);
    s.forzar("video", "wifi-direct"); // no está arriba: no cambia nada
    expect(s.actualizar([ble(), web()], 5000, puede, ["video"])).toEqual([]);
    expect(s.foto().video).toEqual({ carril: "ble-l2cap", forzado: "wifi-direct" });
    s.forzar("video", null);
    expect(textoCarriles(s.foto())).toBe("Vídeo: Bluetooth");
  });

  it("seguir al otro extremo cuenta como cambio (enfriamiento) y no necesita evidencia propia", () => {
    const s = new SelectorCarriles();
    s.fijar("voz", "ble-l2cap", 0);
    expect(s.seguir("voz", "webrtc", 1000)?.motivo).toBe("sigue-al-director");
    // Bluetooth sigue arriba y sano: la voz no vuelve sola.
    expect(correr(s, 1500, 60_000, () => [ble(), web()], ["voz"])).toEqual([]);
  });

  it("sano: pérdida o latencia altas no cuentan", () => {
    expect(carrilSano(ble())).toBe(true);
    expect(carrilSano(ble(true, { perdidaPct: 100 }))).toBe(false);
    expect(carrilSano(ble(true, { rttMs: 1500 }))).toBe(false);
    expect(carrilSano(ble(false))).toBe(false);
  });

  it("desempate: director = descortés de la negociación, el mismo en los dos extremos", () => {
    expect(soyDirector("a:1", "b:2")).toBe(true);
    expect(soyDirector("b:2", "a:1")).toBe(false);
    expect(soyDirector("a:1", "b:2")).toBe(!soyCortes("a:1", "b:2"));
  });

  it("el registro se limita a unas pocas líneas por minuto y clave", () => {
    const l = new LimiteRegistro(4, 60_000);
    const ok = Array.from({ length: 120 }, (_, i) => l.puede("voz", i * 500)).filter(Boolean).length;
    expect(ok).toBe(4);
    expect(l.puede("voz", 61_000)).toBe(true);
  });
});

describe("perfect negotiation: máquina de estados (LLA1110D)", () => {
  it("ofertas cruzadas: el descortés ignora, el cortés cede; sin cruce, nadie ignora", () => {
    const cortes = { cortes: true, haciendoOferta: true, aplicandoRespuesta: false };
    const descortes = { cortes: false, haciendoOferta: true, aplicandoRespuesta: false };
    expect(evaluarDescripcion("offer", descortes, "have-local-offer")).toEqual({ colision: true, ignorar: true });
    expect(evaluarDescripcion("offer", cortes, "have-local-offer")).toEqual({ colision: true, ignorar: false });
    expect(evaluarDescripcion("offer", { ...descortes, haciendoOferta: false }, "stable")).toEqual({ colision: false, ignorar: false });
    expect(evaluarDescripcion("answer", descortes, "have-local-offer")).toEqual({ colision: false, ignorar: false });
    // Aplicando una respuesta (setRemoteDescription en vuelo) una oferta nueva NO es colisión.
    expect(evaluarDescripcion("offer", { cortes: false, haciendoOferta: false, aplicandoRespuesta: true }, "have-local-offer")).toEqual({ colision: false, ignorar: false });
  });
});
