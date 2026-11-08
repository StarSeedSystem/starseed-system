import { describe, expect, it } from "vitest";
import {
  CLAVE_DEFECTOS_ANTENAS,
  MARCA_VACIA,
  VERSION_DEFECTOS_ANTENAS,
  ajusteWifiPorDefecto,
  leerMarca,
  marcarExplicito,
  planDefectos,
  serializarMarca,
} from "../defectos-antenas";
import { aplicarDefectosAntenas, type DepsDefectos } from "../../nativa/defectos-antenas-aplicar";
import { CLAVE_AJUSTE_WIFI } from "../enlace-wifi-orquestacion";

describe("defecto del Wi-Fi directo por neurona", () => {
  it("Android sin radio única: Automático (Android ↔ Android se enlazan solos)", () => {
    expect(ajusteWifiPorDefecto({ plataforma: "android", radioUnica: false })).toBe("automatico");
  });
  it("Android con radio única: Preguntar (soltaría la Wi-Fi de casa)", () => {
    expect(ajusteWifiPorDefecto({ plataforma: "android", radioUnica: true })).toBe("preguntar");
  });
  it("el Mac siempre pregunta: deja su Wi-Fi de casa mientras dura el enlace", () => {
    expect(ajusteWifiPorDefecto({ plataforma: "macos", radioUnica: false })).toBe("preguntar");
    expect(ajusteWifiPorDefecto(null)).toBe("preguntar");
  });
});

describe("migración de defectos", () => {
  it("quien nunca tocó nada recibe el faro encendido si estaba apagado", () => {
    const p = planDefectos(MARCA_VACIA, { bluetoothActivo: true, faroApagado: true, wifiGuardado: null });
    expect(p.encenderFaro).toBe(true);
    expect(p.marca).toEqual({ version: VERSION_DEFECTOS_ANTENAS, explicitos: [] });
  });
  it("el faro no tenía interruptor: un apagado sin marca no fue decisión de nadie", () => {
    expect(planDefectos(MARCA_VACIA, { bluetoothActivo: null, faroApagado: true, wifiGuardado: null }).encenderFaro).toBe(true);
  });
  it("un faro apagado a propósito (marcado) se respeta", () => {
    const m = marcarExplicito(MARCA_VACIA, "faro");
    expect(planDefectos(m, { bluetoothActivo: true, faroApagado: true, wifiGuardado: null }).encenderFaro).toBe(false);
  });
  it("un Bluetooth apagado antes de la migración solo pudo salir del botón: se respeta y se marca", () => {
    const p = planDefectos(MARCA_VACIA, { bluetoothActivo: false, faroApagado: false, wifiGuardado: null });
    expect(p.marca?.explicitos).toContain("bluetooth");
  });
  it("lo que la persona eligió en Wi-Fi directo se marca y no se cambia", () => {
    const p = planDefectos(MARCA_VACIA, { bluetoothActivo: true, faroApagado: false, wifiGuardado: "nunca" });
    expect(p.marca?.explicitos).toEqual(["wifi"]);
  });
  it("es idempotente: con la versión al día no hace nada", () => {
    const m = { version: VERSION_DEFECTOS_ANTENAS, explicitos: [] };
    expect(planDefectos(m, { bluetoothActivo: false, faroApagado: true, wifiGuardado: "nunca" })).toEqual({ encenderFaro: false, marca: null });
  });
  it("la marca se lee y se escribe sin perder nada ni aceptar basura", () => {
    const m = marcarExplicito(marcarExplicito(MARCA_VACIA, "wifi"), "wifi");
    expect(m.explicitos).toEqual(["wifi"]);
    expect(leerMarca(serializarMarca(m))).toEqual(m);
    expect(leerMarca("no json")).toBe(MARCA_VACIA);
    expect(leerMarca(JSON.stringify({ version: 1, explicitos: ["wifi", "x", 3] })).explicitos).toEqual(["wifi"]);
  });
});

function deps(parcial: Partial<DepsDefectos> = {}) {
  const almacen = new Map<string, string>();
  const escrituras: Array<{ faro_apagado?: boolean }> = [];
  const d: DepsDefectos = {
    esNativa: () => true,
    leerAlmacen: (k) => almacen.get(k) ?? null,
    escribirAlmacen: (k, v) => void almacen.set(k, v),
    bluetoothActivo: async () => true,
    leerConfig: async () => ({ faro_apagado: true, ...{ nas: false } }) as { faro_apagado?: boolean },
    escribirConfig: async (c) => {
      escrituras.push(c);
      return true;
    },
    ...parcial,
  };
  return { d, almacen, escrituras };
}

describe("aplicarDefectosAntenas", () => {
  it("enciende el faro conservando el resto de la config y guarda la marca", async () => {
    const { d, almacen, escrituras } = deps();
    const r = await aplicarDefectosAntenas(d);
    expect(r).toEqual({ hecho: true, faroEncendido: true });
    expect(escrituras).toEqual([{ faro_apagado: false, nas: false }]);
    expect(leerMarca(almacen.get(CLAVE_DEFECTOS_ANTENAS)).version).toBe(VERSION_DEFECTOS_ANTENAS);
  });
  it("la segunda vez no toca nada", async () => {
    const { d, escrituras } = deps();
    await aplicarDefectosAntenas(d);
    const r = await aplicarDefectosAntenas(d);
    expect(r.hecho).toBe(false);
    expect(escrituras).toHaveLength(1);
  });
  it("si no se pudo escribir la config, no se marca (se reintenta la próxima vez)", async () => {
    const { d, almacen } = deps({ escribirConfig: async () => false });
    expect((await aplicarDefectosAntenas(d)).hecho).toBe(false);
    expect(almacen.has(CLAVE_DEFECTOS_ANTENAS)).toBe(false);
  });
  it("en la web normal no hace nada", async () => {
    const { d, almacen } = deps({ esNativa: () => false });
    expect((await aplicarDefectosAntenas(d)).hecho).toBe(false);
    expect(almacen.size).toBe(0);
  });
  it("respeta el selector de Wi-Fi guardado y nunca lanza", async () => {
    const { d, almacen } = deps({ leerConfig: async () => { throw new Error("x"); } });
    almacen.set(CLAVE_AJUSTE_WIFI, "nunca");
    await expect(aplicarDefectosAntenas(d)).resolves.toEqual({ hecho: false, faroEncendido: false });
    expect(almacen.get(CLAVE_AJUSTE_WIFI)).toBe("nunca");
  });
});
