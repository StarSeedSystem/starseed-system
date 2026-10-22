import { describe, it, expect } from "vitest";
import {
  RUTA_AJUSTES,
  crearAdaptadorAjustes,
  esClaveAjustePermitida,
  idDeAjuste,
  validarParcheAjustes,
  type AlmacenPreferencias,
} from "../ajustes";

/** Almacenamiento en memoria para las pruebas: sin disco, sin DOM. */
function almacenFalso(): AlmacenPreferencias & { tiene(clave: string): boolean } {
  const datos = new Map<string, string>();
  return {
    getItem: (clave) => datos.get(clave) ?? null,
    setItem: (clave, valor) => { datos.set(clave, valor); },
    removeItem: (clave) => { datos.delete(clave); },
    tiene: (clave) => datos.has(clave),
  };
}

/** Guardado en la cuenta inyectado que cuenta sus llamadas (nunca lanza). */
function guardadoFalso() {
  let llamadas = 0;
  return {
    get llamadas() { return llamadas; },
    pushPreferences: async () => { llamadas += 1; return { ok: true, message: "ok" }; },
  };
}

describe("ajustes · familia de variaciones públicas", () => {
  it("solo permite claves sincronizadas que no sean de cuenta, claves ni privacidad", () => {
    for (const clave of Object.values(RUTA_AJUSTES)) expect(esClaveAjustePermitida(clave), clave).toBe(true);
    expect(esClaveAjustePermitida("starseed.brain.c1.moa")).toBe(true); // prefijo permitido
    for (const prohibida of [
      "starseed.ai.providers", "starseed.connectors.creds.v1", // claves y secretos del dispositivo
      "starseed.privacy.ghost", "starseed.privacy.telemetry", "starseed.mesh.privacy.v1", "starseed.connectivity.settings.v1", // privacidad
      "starseed.brain.c1.memory-mirror.v1", // espejo/caché pesada: nunca viajan
      "starseed_user_memory", "starseed.profile.active.v1", "starseed_defaults_version", // identidad de la cuenta
      "starseed.fuera.synced", // ni exacta ni por prefijo sincronizado
    ]) expect(esClaveAjustePermitida(prohibida), prohibida).toBe(false);
  });

  it("resuelve la clave ajuste:<id> con ajustes del mapa y nada más", () => {
    expect(idDeAjuste("ajuste:accesibilidad")).toBe("accesibilidad");
    expect(idDeAjuste("ajuste:rendimiento")).toBe("rendimiento");
    for (const otra of ["tema:synthwave", "ajuste:vuelo", "ajuste:"]) {
      expect(idDeAjuste(otra), otra).toBeNull();
    }
  });

  it("valida un parche con entradas del mapa y valores JSON planos, y rechaza lo demás", () => {
    const bueno = validarParcheAjustes({ rendimiento: { modo: "eco" } });
    expect(bueno.ok).toBe(true);
    if (bueno.ok) expect(bueno.parche.rendimiento).toEqual({ modo: "eco" });
    const casos: Array<[unknown, string]> = [
      [[], "debe ser un objeto"],
      [null, "debe ser un objeto"],
      [{}, "está vacío"],
      [{ vuelo: 1 }, "no es un ajuste de la familia"],
      [{ rendimiento: "sk-abc123def456ghi789" }, "token"],
      [{ rendimiento: () => 1 }, "no serializable"],
      [{ cursor: { html: "<b>hola</b>" } }, "código"],
    ];
    for (const [payload, esperado] of casos) {
      const resultado = validarParcheAjustes(payload);
      expect(resultado.ok, esperado).toBe(false);
      if (!resultado.ok) expect(resultado.motivos.join(" "), esperado).toContain(esperado);
    }
  });

  it("aplica el parche en el almacen y guarda con pushPreferences inyectado; deshacer restaura", () => {
    const almacen = almacenFalso();
    const guardado = guardadoFalso();
    const adaptador = crearAdaptadorAjustes({ pushPreferences: guardado.pushPreferences, almacen });
    const aplicado = adaptador.aplicar("ajuste:rendimiento", { rendimiento: { modo: "eco" } });
    expect(almacen.getItem("starseed.perf.v1")).toBe(JSON.stringify({ modo: "eco" }));
    expect(guardado.llamadas).toBe(1);
    aplicado.deshacer();
    expect(almacen.tiene("starseed.perf.v1")).toBe(false); // no existía antes: se quita
    expect(guardado.llamadas).toBe(2); // deshacer también guarda en la cuenta
  });

  it("deshacer devuelve el valor que el ajuste tenía antes de aplicar la variación", () => {
    const almacen = almacenFalso();
    const guardado = guardadoFalso();
    almacen.setItem("starseed.perf.v1", JSON.stringify({ modo: "alto" }));
    const adaptador = crearAdaptadorAjustes({ pushPreferences: guardado.pushPreferences, almacen });
    adaptador.aplicar("ajuste:rendimiento", { rendimiento: { modo: "eco" } }).deshacer();
    expect(almacen.getItem("starseed.perf.v1")).toBe(JSON.stringify({ modo: "alto" }));
  });

  it("no ejecuta nada sin validar: un parche rechazado no toca el almacen ni guarda", () => {
    const almacen = almacenFalso();
    const guardado = guardadoFalso();
    const adaptador = crearAdaptadorAjustes({ pushPreferences: guardado.pushPreferences, almacen });
    expect(() => adaptador.aplicar("ajuste:vuelo", { vuelo: 1 })).toThrow("rechazada");
    expect(() => adaptador.aplicar("ajuste:cursor", { cursor: { html: "<b>x</b>" } })).toThrow("rechazada");
    expect(almacen.tiene("starseed.cursorfx.v1")).toBe(false);
    expect(guardado.llamadas).toBe(0);
  });

  it("captura el estado actual del ajuste desde el almacen inyectado, y su familia es ajuste", () => {
    const almacen = almacenFalso();
    almacen.setItem("starseed.perf.v1", '{"modo":"alto"}');
    const guardado = guardadoFalso();
    const adaptador = crearAdaptadorAjustes({ pushPreferences: guardado.pushPreferences, almacen });
    expect(adaptador.familia).toBe("ajuste");
    expect(adaptador.capturar("ajuste:rendimiento")).toEqual({ rendimiento: { modo: "alto" } });
    expect(adaptador.capturar("tema:synthwave")).toBeNull();
    expect(adaptador.capturar("ajuste:visualizador")).toBeNull(); // sin valor actual: nada que capturar
    expect(adaptador.validar({ rendimiento: "eco" })).toEqual({ ok: true, payload: { rendimiento: "eco" } });
  });
});
