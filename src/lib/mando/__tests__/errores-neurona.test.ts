import { describe, it, expect } from "vitest";
import { normalizarError, limpiarDatosPersonales, huella, agrupar } from "@/lib/mando/errores-neurona";

const PILA = [
  "Pánico de la neurona: proceso atascado",
  "    at /ordenador/node_modules/lib/index.js:1:2",
  "    at enColar (src/lib/mando/errores-neurona.ts:22:9)",
].join("\n");

function errorDe(mensaje: string): Error {
  const e = new Error(mensaje);
  e.stack = PILA;
  return e;
}

const CTX = { ambito: "neurona", neurona: "A1", proceso: "enColar" };

describe("limpiarDatosPersonales", () => {
  it("enmascara cada tipo de dato personal dentro del evento", () => {
    const tipos: Array<[string, string, string]> = [
      ["correo de carla@starseed.local llega", "carla@starseed.local", "[correo]"],
      ["llama al +34 600 123 456 ya", "+34 600 123 456", "[teléfono]"],
      ["cliente en 192.168.1.42 activo", "192.168.1.42", "[ip]"],
      ["clave sk-AAbbCCdd1234EEff vieja", "sk-AAbbCCdd1234EEff", "[token]"],
      ["clave gsk_11aaBBee3456 nueva", "gsk_11aaBBee3456", "[token]"],
      ["pila en /Users/carlos/.starseed/env", "carlos", "[anonimo]"],
    ];
    for (const [dato, token, mascara] of tipos) {
      const ev = normalizarError(errorDe(dato), CTX);
      const valor = limpiarDatosPersonales(ev).exception.values[0].value;
      expect(valor).toContain(mascara);
      expect(valor).not.toContain(token);
    }
  });

  it("Bearer y JWT pasan por la máscara, y las etiquetas también se limpian", () => {
    const ev = normalizarError(errorDe("Bearer t9x.eyJhbGciOiJIUzI1Ni9"), { ...CTX, neurona: "jefe@starseed.local" });
    const limpio = limpiarDatosPersonales(ev);
    expect(limpio.exception.values[0].value).toContain("Bearer [token]");
    expect(limpio.exception.values[0].value).toContain("[token]");
    expect(limpio.tags.neurona).toContain("[correo]");
  });
});

describe("normalizarError", () => {
  it("forma de evento estilo Sentry", () => {
    const ev = normalizarError(errorDe("el chat se colgó"), CTX);
    expect(ev.level).toBe("error");
    expect(ev.platform).toBe("javascript");
    expect(ev.event_id).toMatch(/^[0-9a-f]{32}$/);
    expect(ev.timestamp).toBeGreaterThan(0);
    expect(ev.exception.values).toHaveLength(1);
    expect(ev.exception.values[0].type).toBe("Error");
    expect(ev.exception.values[0].stacktrace.frames).toHaveLength(2);
    expect(ev.exception.values[0].stacktrace.frames[0].in_app).toBe(false);
    expect(ev.tags.ambito).toBe("neurona");
    expect(ev.fingerprint).toHaveLength(1);
  });

  it("ámbito no reconocido cae en 'proceso'; si no hay pila, sin marcos y sin caerse", () => {
    const ev = normalizarError("se cayó", { ambito: "inventado" });
    expect(ev.tags.ambito).toBe("proceso");
    expect(ev.exception.values[0].value).toBe("se cayó");
    expect(normalizarError({ name: "FalloCableado" }, CTX).exception.values[0].type).toBe("FalloCableado");
    expect(normalizarError(42, CTX).exception.values[0].stacktrace.frames).toEqual([]);
  });
});

describe("huella y agrupar", () => {
  const a = normalizarError(errorDe("id zN4 · el proceso se atascó"), CTX);
  const b = normalizarError(errorDe("id q0X · el proceso se atascó"), CTX);
  const otroAmbito = normalizarError(errorDe("id zN4 · el proceso se atascó"), { ambito: "proceso" });
  b.timestamp = a.timestamp + 120;

  it("dos errores iguales con mensajes de distinto id comparten huella; otro ámbito, no", () => {
    expect(a.event_id).not.toBe(b.event_id);
    expect(huella(a)).toBe(huella(b));
    expect(huella(otroAmbito)).not.toBe(huella(a));
  });

  it("agrupa por huella con veces, ventana temporal y ejemplo", () => {
    const grupos = agrupar([a, b, otroAmbito]);
    expect(grupos).toHaveLength(2);
    expect(grupos[0].veces).toBe(2);
    expect(grupos[0].huella).toBe(huella(a));
    expect(grupos[0].primero).toBe(a.timestamp);
    expect(grupos[0].ultimo).toBe(b.timestamp);
    expect(grupos[0].ejemplo).toBe(a);
    expect(grupos[1].huella).toBe(huella(otroAmbito));
  });
});
