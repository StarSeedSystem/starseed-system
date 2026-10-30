import { describe, expect, it } from "vitest";
import {
    ESTADO_ORBE_INICIAL,
    parametrosVisuales,
    siguienteEstadoOrbe,
    type EstadoOrbe,
    type EventoOrbe,
} from "../estado-orbe";
import { entenderVoz, capaDe, type ContextoVoz, type ResultadoVoz } from "../../../../lib/xr/intenciones-voz";

const CTX: ContextoVoz = {
    grupos: [{ id: "g1", nombre: "Banda", miembros: 3 }],
    contactos: [{ id: "p1", nombre: "Ana" }],
    estaciones: [{ id: "e1", nombre: "Cumbre" }],
    servidores: [],
    enfoque: null,
    mundoActual: { id: "m1", nombre: "Ensayo" },
};
const ok = (r: ResultadoVoz) => {
    if (!r.ok) throw new Error(`Se esperaba ok y fue: ${r.razon} · ${r.pregunta}`);
    return r;
};
/** El primer evento `entendido` que manda XR1010P: la capa de `capaDe` sobre la última intención. */
const entendidoDe = (frase: string): EventoOrbe => {
    const pasos = ok(entenderVoz(frase, CTX)).pasos;
    return { tipo: "entendido", capa: capaDe(pasos[pasos.length - 1].intencion) };
};
const con = (prev: EstadoOrbe, ...eventos: EventoOrbe[]): EstadoOrbe =>
    eventos.reduce(siguienteEstadoOrbe, prev);

describe("el ciclo del orbe de Astraura (XR1010O)", () => {
  it("recorre reposo → escuchando → pensando → hablando → reposo", () => {
    const hablando = con(ESTADO_ORBE_INICIAL,
      { tipo: "escucha-inicio" },
      { tipo: "texto-parcial", texto: "crea…" },
      { tipo: "escucha-fin" },
      { tipo: "habla-inicio", texto: "Listo, el mundo está en tu cuenta." });
    expect(hablando.fase).toBe("hablando");
    const final = con(hablando, { tipo: "habla-fin" });
    expect(final.fase).toBe("reposo");
    expect(final.texto).toBe("Listo, el mundo está en tu cuenta.");
  });

  it("un «habla-fin» o un «escucha-fin» fuera de su turno no cambia la fase (nunca en bucle)", () => {
    expect(siguienteEstadoOrbe(ESTADO_ORBE_INICIAL, { tipo: "escucha-fin" }).fase).toBe("reposo");
    expect(siguienteEstadoOrbe(ESTADO_ORBE_INICIAL, { tipo: "habla-fin" }).fase).toBe("reposo");
    const reposo = con(ESTADO_ORBE_INICIAL, { tipo: "habla-inicio", texto: "ok" }, { tipo: "habla-fin" });
    expect(siguienteEstadoOrbe(reposo, { tipo: "escucha-fin" }).fase).toBe("reposo");
    const pensando = con(ESTADO_ORBE_INICIAL, { tipo: "escucha-inicio" }, { tipo: "escucha-fin" });
    expect(siguienteEstadoOrbe(pensando, { tipo: "habla-fin" }).fase).toBe("pensando");
  });

  it("el error vuelve a reposo con el texto del fallo y sin capa", () => {
    const enMedio = con(ESTADO_ORBE_INICIAL, { tipo: "escucha-inicio" }, { tipo: "entendido", capa: "razon" }, { tipo: "escucha-fin" });
    const error = con(enMedio, { tipo: "error", texto: "El micrófono está ocupado. Toca de nuevo." });
    expect(error.fase).toBe("reposo");
    expect(error.texto).toBe("El micrófono está ocupado. Toca de nuevo.");
    expect(error.capa).toBeNull();
  });

  it("la capa sale de `capaDe` de intenciones-voz: mundo libre → razón; orden cerrada → reflejo", () => {
    const libre = con(ESTADO_ORBE_INICIAL, entendidoDe("crea un mundo con bosque y luciérnagas"));
    expect(libre.capa).toBe("razon");
    const cerrada = con(ESTADO_ORBE_INICIAL, entendidoDe("llévame a la estación Cumbre"));
    expect(cerrada.capa).toBe("reflejo");
  });

  it("el texto parcial se sustituye y no pisa la respuesta final", () => {
    const escuchando = con(ESTADO_ORBE_INICIAL, { tipo: "escucha-inicio" }, { tipo: "texto-parcial", texto: "crea un" });
    expect(escuchando.texto).toBe("crea un");
    expect(con(escuchando, { tipo: "texto-parcial", texto: "crea un mundo" }).texto).toBe("crea un mundo");
    const hablando = con(escuchando, { tipo: "escucha-fin" }, { tipo: "habla-inicio", texto: "Hecho." });
    expect(con(hablando, { tipo: "texto-parcial", texto: "parcial tardío" }).texto).toBe("Hecho.");
  });

  it("`habla-fin` conserva el texto y la capa que se enseñaron", () => {
    const final = con(ESTADO_ORBE_INICIAL,
      entendidoDe("súbelo a la biblioteca"),
      { tipo: "habla-inicio", texto: "Guardado en tu biblioteca." },
      { tipo: "habla-fin" });
    expect(final.fase).toBe("reposo");
    expect(final.texto).toBe("Guardado en tu biblioteca.");
    expect(final.capa).toBe("reflejo");
  });

  it("el nivel de voz se acota a 0..1", () => {
    expect(siguienteEstadoOrbe(ESTADO_ORBE_INICIAL, { tipo: "voz", nivel: 2 }).nivelVoz).toBe(1);
    expect(siguienteEstadoOrbe(ESTADO_ORBE_INICIAL, { tipo: "voz", nivel: -1 }).nivelVoz).toBe(0);
    expect(siguienteEstadoOrbe(ESTADO_ORBE_INICIAL, { tipo: "voz", nivel: 0.5 }).nivelVoz).toBe(0.5);
  });

  it("con movimiento reducido el pulso es 0 en todas las fases", () => {
    for (const fase of [
      ESTADO_ORBE_INICIAL,
      con(ESTADO_ORBE_INICIAL, { tipo: "escucha-inicio" }),
      con(ESTADO_ORBE_INICIAL, { tipo: "escucha-inicio" }, { tipo: "escucha-fin" }),
      con(ESTADO_ORBE_INICIAL, { tipo: "habla-inicio", texto: "…" }),
    ]) {
      expect(parametrosVisuales(fase, true).pulso).toBe(0);
      expect(parametrosVisuales(fase, false).pulso).toBeGreaterThan(0);
    }
  });

  it("los colores son los de `COLORES_NODO.zenith` y el orbe reacciona al nivel de voz", () => {
    const reposo = parametrosVisuales(ESTADO_ORBE_INICIAL, false);
    expect(reposo.color).toBe("#007FFF");
    const escuchandoCallado = parametrosVisuales(con(ESTADO_ORBE_INICIAL, { tipo: "escucha-inicio" }), false);
    const escuchandoFuerte = parametrosVisuales(
      con(ESTADO_ORBE_INICIAL, { tipo: "escucha-inicio" }, { tipo: "voz", nivel: 1 }), false);
    expect(escuchandoCallado.color).toBe("#007FFF");
    expect(escuchandoFuerte.radio).toBeGreaterThan(escuchandoCallado.radio);
    expect(escuchandoFuerte.brillo).toBeGreaterThan(reposo.brillo);
  });
});
