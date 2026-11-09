/**
 * BLE1109B — el ajuste «Canal rápido Bluetooth (experimental)»: apagado por defecto, migración de lo guardado
 * por versiones anteriores y espejo del registro de enlaces.
 */
import { describe, expect, it } from "vitest";
import {
  AJUSTE_CANAL_RAPIDO_DEFECTO,
  MAX_LINEAS_ESPEJO_BLE,
  fijarCanalRapido,
  leerAjusteCanalRapido,
  leerEspejoRegistro,
  necesitaMigrarCanalRapido,
  recortarEspejoRegistro,
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
  it("por defecto está APAGADO", () => {
    expect(AJUSTE_CANAL_RAPIDO_DEFECTO.activo).toBe(false);
    expect(leerAjusteCanalRapido(null).activo).toBe(false);
    expect(leerAjusteCanalRapido("basura{").activo).toBe(false);
  });

  it("un valor sin versión o de versión anterior se lee como apagado y pide migrar", () => {
    expect(leerAjusteCanalRapido('{"activo":true}').activo).toBe(false);
    expect(leerAjusteCanalRapido('{"activo":true,"v":1}').activo).toBe(false);
    expect(necesitaMigrarCanalRapido('{"activo":true}')).toBe(true);
    expect(necesitaMigrarCanalRapido("nada{")).toBe(true);
    expect(necesitaMigrarCanalRapido(null)).toBe(false);
    expect(necesitaMigrarCanalRapido(serializarAjusteCanalRapido(true))).toBe(false);
    expect(leerAjusteCanalRapido(serializarAjusteCanalRapido(true)).activo).toBe(true);
  });

  it("al arrancar apaga en la app nativa lo que quedó de una versión anterior", async () => {
    const { d, reg } = deps('{"activo":true}', true);
    expect(await sincronizarCanalRapido(d)).toBe(false);
    expect(reg.nativo).toBe(false);
    expect(leerAjusteCanalRapido(reg.guardado).activo).toBe(false);
  });

  it("lo encendido a propósito (versión actual) se respeta; sin app nativa no hace nada", async () => {
    const a = deps(serializarAjusteCanalRapido(true), true);
    expect(await sincronizarCanalRapido(a.d)).toBe(true);
    expect(a.reg.llamadas).toEqual([undefined]);
    const b = deps(null, null);
    expect(await sincronizarCanalRapido(b.d)).toBeNull();
  });

  it("fijar guarda primero en la app nativa y luego el espejo", async () => {
    const { d, reg } = deps(null, false);
    expect(await fijarCanalRapido(d, true)).toEqual({ ok: true, activo: true });
    expect(reg.nativo).toBe(true);
    expect(leerAjusteCanalRapido(reg.guardado).activo).toBe(true);
    const sin = deps(null, null);
    expect(await fijarCanalRapido(sin.d, true)).toEqual({ ok: false, activo: false });
  });

  it("el estado nativo acepta los nuevos estados del canal rápido", () => {
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
