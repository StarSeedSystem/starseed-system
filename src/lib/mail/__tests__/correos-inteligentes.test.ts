import { describe, it, expect } from "vitest";

import {
  ACCIONES_REGLA,
  dominioDe,
  validarRegla,
  aplicarReglas,
  type ReglaCorreo,
} from "@/lib/mail/reglas-correo";
import {
  clasificarHilo,
  resumenSeguimiento,
  DEFECTO_SEGUIMIENTO,
  type HiloLite,
} from "@/lib/mail/seguimiento-respuestas";

const AHORA = new Date("2026-10-29T12:00:00Z");
const YO = "yo@star.seed";

function hilo(parcial: Partial<HiloLite> & { id: string }): HiloLite {
  return {
    asunto: "(sin asunto)",
    ultimoDe: "otro@ejemplo.org",
    ultimoEn: "2026-10-28T00:00:00Z",
    tieneAdjunto: false,
    etiquetas: [],
    ...parcial,
  };
}

function regla(parcial: Partial<ReglaCorreo> & { id: string }): ReglaCorreo {
  return {
    texto: "regla de prueba",
    cuando: { de: "otro@ejemplo.org" },
    hacer: "destacar",
    ...parcial,
  };
}

describe("reglas de correo como datos", () => {
  it("la lista de acciones es cerrada y ninguna acción envía ni borra (R2)", () => {
    expect(ACCIONES_REGLA).toEqual([
      "etiquetar",
      "mover",
      "destacar",
      "esperar-respuesta",
      "sugerir-borrador",
    ]);
    const prohibidas = ["enviar", "responder", "responder-solo", "borrar", "reenviar", "auto-enviar"];
    for (const prohibida of prohibidas) {
      expect(validarRegla(regla({ id: "r", hacer: prohibida as ReglaCorreo["hacer"] }))).toBeNull();
    }
  });

  it("acepta una regla bien formada", () => {
    const r = regla({ id: "r1", hacer: "etiquetar", parametro: "alcance" });
    expect(validarRegla(r)).toEqual(r);
  });

  it("rechaza campos extra (en la regla y dentro de cuando)", () => {
    expect(validarRegla({ ...regla({ id: "r" }), canal: "correo" })).toBeNull();
    expect(
      validarRegla({
        ...regla({ id: "r", cuando: { de: "a@b.c", adjunto: true } as ReglaCorreo["cuando"] }),
      }),
    ).toBeNull();
  });

  it("rechaza textos largos y datos mal typados", () => {
    expect(validarRegla(regla({ id: "r", texto: "x".repeat(281) }))).toBeNull();
    expect(validarRegla(regla({ id: "r", parametro: "x".repeat(121) }))).toBeNull();
    expect(validarRegla(regla({ id: "r", cuando: { tieneAdjunto: "sí" as unknown as boolean } }))).toBeNull();
    expect(validarRegla(regla({ id: "r", cuando: { antiguedadHorasMin: -1 } }))).toBeNull();
    expect(validarRegla(null)).toBeNull();
    expect(validarRegla("hola")).toBeNull();
    expect(validarRegla([])).toBeNull();
  });

  it("rechaza una regla sin condiciones (dispararía contra todo el correo)", () => {
    expect(validarRegla(regla({ id: "r", cuando: {} }))).toBeNull();
  });
});

describe("aplicarReglas", () => {
  it("dominioDe extrae el dominio en minúsculas", () => {
    expect(dominioDe("Ana@Ejemplo.ORG")).toBe("ejemplo.org");
    expect(dominioDe("sinarroba")).toBe("");
  });

  it("casa por remitente, dominio, asunto, adjunto y etiqueta", () => {
    const h = hilo({
      id: "h1",
      ultimoDe: "Ana@Ejemplo.ORG",
      asunto: "Sobre la carta de StarSeed",
      tieneAdjunto: true,
      etiquetas: ["Alcance"],
    });
    expect(aplicarReglas([regla({ id: "r", cuando: { de: "ana@ejemplo.org" } })], h)).toEqual([
      { reglaId: "r", hacer: "destacar" },
    ]);
    expect(aplicarReglas([regla({ id: "r", cuando: { dominio: "EJEMPLO.ORG" } })], h)).not.toEqual([]);
    expect(aplicarReglas([regla({ id: "r", cuando: { asuntoContiene: "CARTA DE" } })], h)).not.toEqual([]);
    expect(aplicarReglas([regla({ id: "r", cuando: { tieneAdjunto: true } })], h)).not.toEqual([]);
    expect(aplicarReglas([regla({ id: "r", cuando: { etiqueta: "alcance" } })], h)).not.toEqual([]);
    expect(aplicarReglas([regla({ id: "r", cuando: { de: "nadie@otro.org" } })], h)).toEqual([]);
    expect(aplicarReglas([regla({ id: "r", cuando: { tieneAdjunto: false } })], h)).toEqual([]);
  });

  it("exige la antigüedad mínima (regla para hilos viejos)", () => {
    const h = hilo({ id: "h1", ultimoEn: "2026-10-27T00:00:00Z" }); // 60 h antes de AHORA
    expect(aplicarReglas([regla({ id: "r", cuando: { antiguedadHorasMin: 48 } })], h)).not.toEqual([]);
    expect(aplicarReglas([regla({ id: "r", cuando: { antiguedadHorasMin: 72 } })], h)).toEqual([]);
  });

  it("devuelve las propuestas en orden y sin repetir (misma acción y parámetro)", () => {
    const reglas: ReglaCorreo[] = [
      regla({ id: "a", hacer: "etiquetar", parametro: "revisar" }),
      regla({ id: "b", cuando: { tieneAdjunto: true }, hacer: "etiquetar", parametro: "revisar" }),
      regla({ id: "c", cuando: { dominio: "ejemplo.org" }, hacer: "destacar" }),
    ];
    const h = hilo({ id: "h1", tieneAdjunto: true });
    expect(aplicarReglas(reglas, h)).toEqual([
      { reglaId: "a", hacer: "etiquetar", parametro: "revisar" },
      { reglaId: "c", hacer: "destacar" },
    ]);
  });
});

describe("seguimiento de respuestas («Reply Zero»)", () => {
  it("los márgenes por defecto son 24 h y 14 días (el 14, para el alcance)", () => {
    expect(DEFECTO_SEGUIMIENTO).toEqual({ horasPorResponder: 24, diasEsperando: 14 });
  });

  it("por-responder: el último es de otro y pasaron más de N horas sin mi respuesta", () => {
    const h = hilo({ id: "h", ultimoEn: "2026-10-28T06:00:00Z" }); // 30 h antes de AHORA
    expect(clasificarHilo(h, YO, AHORA)).toBe("por-responder");
  });

  it("resuelto: respuesta de otro recién llegada dentro del margen", () => {
    const h = hilo({ id: "h", ultimoEn: "2026-10-29T08:00:00Z" }); // 4 h antes
    expect(clasificarHilo(h, YO, AHORA)).toBe("resuelto");
  });

  it("esperando: el último es mío y ya pasaron más de 14 días (por defecto)", () => {
    const mío = hilo({ id: "h", ultimoDe: YO, ultimoEn: "2026-10-01T00:00:00Z" }); // 28 días
    expect(clasificarHilo(mío, YO, AHORA)).toBe("esperando");
    expect(clasificarHilo(mío, YO, AHORA, { diasEsperando: 30 })).toBe("resuelto");
    const reciente = hilo({ id: "h2", ultimoDe: YO, ultimoEn: "2026-10-20T00:00:00Z" });
    expect(clasificarHilo(reciente, YO, AHORA)).toBe("resuelto");
  });

  it("un hilo sin mensajes queda resuelto", () => {
    expect(clasificarHilo(hilo({ id: "h", ultimoEn: "" }), YO, AHORA)).toBe("resuelto");
  });

  it("márgenes propios: horasPorResponder ajusta el umbral de por-responder", () => {
    // 30 h con el margen por defecto ya habría pasado a «por-responder» (24 h).
    const treinta = hilo({ id: "h", ultimoEn: "2026-10-28T06:00:00Z" });
    expect(clasificarHilo(treinta, YO, AHORA, { horasPorResponder: 48 })).toBe("resuelto");
    const cincuenta = hilo({ id: "h", ultimoEn: "2026-10-27T10:00:00Z" }); // 50 h antes
    expect(clasificarHilo(cincuenta, YO, AHORA, { horasPorResponder: 48 })).toBe("por-responder");
  });

  it("una fecha rota se trata como ya caducada, no como fecha desconocida", () => {
    // De otro: «hace más de N horas» (fecha imposible → infinitas horas).
    expect(clasificarHilo(hilo({ id: "r", ultimoEn: "no-es-fecha" }), YO, AHORA)).toBe("por-responder");
    // Mío: «hace más de D días» → también pasa el margen.
    expect(clasificarHilo(hilo({ id: "m", ultimoDe: YO, ultimoEn: "no-es-fecha" }), YO, AHORA)).toBe(
      "esperando",
    );
  });

  it("resumenSeguimiento reparte los ids por estado", () => {
    const hilos: HiloLite[] = [
      hilo({ id: "a", ultimoEn: "2026-10-28T06:00:00Z" }), // por-responder
      hilo({ id: "b", ultimoDe: YO, ultimoEn: "2026-10-01T00:00:00Z" }), // esperando
      hilo({ id: "c", ultimoEn: "2026-10-29T08:00:00Z" }), // resuelto
      { ...hilo({ id: "z", ultimoEn: "" }), ultimoDe: "" }, // sin mensajes → resuelto
    ];
    expect(resumenSeguimiento(hilos, YO, AHORA)).toEqual({
      porResponder: ["a"],
      esperando: ["b"],
      resuelto: ["c", "z"],
    });
  });
});


