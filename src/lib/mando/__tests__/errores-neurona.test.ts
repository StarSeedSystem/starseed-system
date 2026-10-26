import { describe, it, expect } from "vitest";
import {
  agrupar,
  huella,
  limpiarDatosPersonales,
  normalizarError,
  type ContextoError,
} from "../errores-neurona";

/** Contexto de prueba: una neurona de la Mac, proceso de Genesis. */
const CONTEXTO: ContextoError = { ambito: "neurona", neurona: "mac-local", proceso: "genesis" };

/** Error con pila controlada: `stack` sustituido por líneas deterministas. */
function errorDePrueba(mensaje: string, archivo: string, linea: number): Error {
  const error = new Error(mensaje);
  error.stack = `Error: ${mensaje}\n    at correr (/Users/alex/repo/${archivo}:${linea}:7)`;
  return error;
}

describe("normalizarError", () => {
  it("produce el evento estilo Sentry con su estructura completa", () => {
    const evento = normalizarError(errorDePrueba("falló el latido", "src/lib/latido.ts", 12), CONTEXTO);
    expect(evento.platform).toBe("javascript");
    expect(evento.level).toBe("error");
    expect(evento.tags).toEqual({ ambito: "neurona", neurona: "mac-local", proceso: "genesis" });
    expect(evento.exception.values[0].type).toBe("Error");
    expect(evento.exception.values[0].value).toBe("falló el latido");
    const marcos = evento.exception.values[0].stacktrace.frames;
    expect(marcos[0].propio).toBe(true);
    expect(marcos[0].linea).toBe(12);
    expect(evento.event_id).toBeTruthy();
    expect(evento.timestamp).toBeTruthy();
    expect(evento.fingerprint.length).toBe(3);
  });

  it("acepta valores que no son Error sin lanzar", () => {
    const evento = normalizarError("cadena rota", { ambito: "proceso" });
    expect(evento.exception.values[0].value).toBe("cadena rota");
    expect(evento.tags.ambito).toBe("proceso");
  });
});

describe("huella", () => {
  it("dos errores iguales con mensajes de id distinto comparten huella", () => {
    const primero = normalizarError(errorDePrueba("fallo A (id 83)", "src/lib/x.ts", 20), CONTEXTO);
    const segundo = normalizarError(errorDePrueba("fallo B (id 91)", "src/lib/x.ts", 20), CONTEXTO);
    expect(segundo.event_id).not.toBe(primero.event_id);
    expect(huella(segundo)).toEqual(huella(primero));
  });

  it("un error de otro ámbito no comparte huella", () => {
    const neurona = normalizarError(errorDePrueba("mismo origen", "src/lib/x.ts", 20), CONTEXTO);
    const cerebro = normalizarError(errorDePrueba("mismo origen", "src/lib/x.ts", 20), {
      ambito: "cerebro",
    });
    expect(huella(cerebro)).not.toEqual(huella(neurona));
  });

  it("sin marco propio da una huella estable", () => {
    const error = new Error("sin pila");
    error.stack = "Error: sin pila\n    at node_modules/.pnpm/runtime.js:1:1";
    const evento = normalizarError(error, CONTEXTO);
    expect(huella(evento)).toEqual(["Error", "sin-marco-propio", "neurona"]);
  });
});

describe("limpiarDatosPersonales", () => {
  it("enmascara correos, IP y claves en el mensaje", () => {
    const error = new Error(
      "avisó ana@starseed.io desde 192.168.1.5 con clave sk-abc123XYZ999 y gsk_pqrSTU123456",
    );
    const limpio = limpiarDatosPersonales(normalizarError(error, CONTEXTO));
    const mensaje = limpio.exception.values[0].value;
    expect(mensaje).not.toContain("ana@starseed.io");
    expect(mensaje).toContain("[correo]");
    expect(mensaje).not.toContain("192.168.1.5");
    expect(mensaje).toContain("[ip]");
    expect(mensaje).not.toContain("sk-abc123XYZ999");
    expect(mensaje).not.toContain("gsk_pqrSTU123456");
    expect(mensaje).toContain("[token]");
  });

  it("enmascara teléfono, Bearer/JWT y rutas de usuario en marcos", () => {
    const error = new Error("llamada a +34 600 123 456 con Bearer eyJtokenLargo.v.f");
    error.stack =
      "Error: x\n    at f (/Users/alex/repo/src/lib/x.ts:3:1)\n    at g (node_modules/x/index.js:9:1)";
    const limpio = limpiarDatosPersonales(normalizarError(error, CONTEXTO));
    const valor = limpio.exception.values[0];
    expect(valor.value).not.toContain("+34 600 123 456");
    expect(valor.value).toContain("[teléfono]");
    expect(valor.value).not.toContain("eyJ");
    expect(valor.stacktrace.frames[0].archivo).toBe("/Users/[usuario]/repo/src/lib/x.ts");
    expect(valor.stacktrace.frames[1].archivo).toBe("node_modules/x/index.js");
  });

  it("no muta el evento de entrada", () => {
    const evento = normalizarError(new Error("escribe ana@starseed.io"), CONTEXTO);
    const copia = JSON.parse(JSON.stringify(evento)) as typeof evento;
    limpiarDatosPersonales(evento);
    expect(JSON.parse(JSON.stringify(evento))).toEqual(copia);
  });
});

describe("agrupar", () => {
  it("agrupa por huella con veces, primero, ultimo y ejemplo", () => {
    const mismos = [
      normalizarError(errorDePrueba("mismo origen", "src/lib/x.ts", 20), CONTEXTO),
      normalizarError(errorDePrueba("otro texto", "src/lib/x.ts", 20), CONTEXTO),
      normalizarError(errorDePrueba("mismo origen", "src/lib/x.ts", 20), { ambito: "cerebro" }),
    ];
    const [mayor, menor] = agrupar(mismos);
    expect(mayor.huella).toBe(huella(mismos[0]).join("|"));
    expect(mayor.veces).toBe(2);
    expect(menor.veces).toBe(1);
    expect(mayor.ejemplo.event_id).toBeTruthy();
    expect(mayor.primero).toBe(mismos[0].timestamp);
    expect(mayor.ultimo).toBe(mismos[1].timestamp);
    expect(agrupar(mismos)).toHaveLength(2);
  });

  it("da la lista vacía para la lista vacía", () => {
    expect(agrupar([])).toEqual([]);
  });
});

