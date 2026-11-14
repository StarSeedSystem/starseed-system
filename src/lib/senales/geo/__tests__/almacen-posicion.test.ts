// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { anuncioParaMiCuenta, fijarPreferenciaPosicion, guardarPosicionCruda, leerPreferenciaPosicion, olvidarPosicionCruda, CLAVE_POSICION } from "../almacen-posicion";

const cruda = { lat: 41.38879, lon: 2.15899, precisionM: 9, t: 1_800_000_000_000, fuente: "gps" as const };

describe("almacén de posición del aparato", () => {
  beforeEach(() => { localStorage.clear(); });

  it("con la preferencia por defecto NO sale nada hacia la cuenta aunque haya posición guardada", () => {
    guardarPosicionCruda(cruda);
    expect(leerPreferenciaPosicion()).toEqual({ cuenta: "no", publica: "no", autorizados: {} });
    expect(anuncioParaMiCuenta()).toBeNull();
  });

  it("con «zona» sale la celda, sin el punto; con «exacta», el punto; retirarlo es inmediato", () => {
    guardarPosicionCruda(cruda);
    fijarPreferenciaPosicion({ cuenta: "zona" });
    const z = anuncioParaMiCuenta()!;
    expect(z.k).toBe("zona");
    expect(JSON.stringify(z)).not.toContain("41.38879");
    fijarPreferenciaPosicion({ cuenta: "exacta" });
    expect(anuncioParaMiCuenta()).toMatchObject({ k: "exacta", lat: 41.38879 });
    fijarPreferenciaPosicion({ cuenta: "no" });
    expect(anuncioParaMiCuenta()).toBeNull();
  });

  it("olvidar la ubicación borra el punto crudo; un valor corrupto se ignora", () => {
    fijarPreferenciaPosicion({ cuenta: "exacta" });
    guardarPosicionCruda(cruda);
    olvidarPosicionCruda();
    expect(localStorage.getItem(CLAVE_POSICION)).toBeNull();
    expect(anuncioParaMiCuenta()).toBeNull();
    localStorage.setItem(CLAVE_POSICION, "{{no es json");
    localStorage.setItem("starseed.mapa.posicion.pref.v1", "{\"cuenta\":\"todo\",\"publica\":7}");
    expect(anuncioParaMiCuenta()).toBeNull();
    expect(leerPreferenciaPosicion()).toEqual({ cuenta: "no", publica: "no", autorizados: {} });
  });
});
