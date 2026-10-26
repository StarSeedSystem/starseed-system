import { describe, it, expect } from "vitest";
import { decidirEnvioOido } from "../oido-ambiental";

const base = {
  sentidos: { encendidos: true, siempreEscuchando: true },
  hayVoz: false,
  energia: 0.3,
  umbralEnergia: 0.1,
  tiempoDesdeUltimoEnvio: 30,
  intervaloMinimoSegundos: 10,
};

describe("decidirEnvioOido", () => {
  it("envía un tramo sin voz sobre el umbral y a separación regulada", () => {
    const d = decidirEnvioOido(base);
    expect(d.enviar).toBe(true);
    expect(d.motivo).toContain("sin voz");
  });

  it("nunca envía con los sentidos apagados, aunque el tramo sirviera", () => {
    const d = decidirEnvioOido({ ...base, sentidos: { encendidos: false, siempreEscuchando: true } });
    expect(d.enviar).toBe(false);
    expect(d.motivo).toBe("sentidos apagados");
  });

  it("nunca envía sin escucha activa («siempre escuchando» apagado)", () => {
    const d = decidirEnvioOido({
      ...base,
      sentidos: { encendidos: true, siempreEscuchando: false },
    });
    expect(d.enviar).toBe(false);
    expect(d.motivo).toBe("sin escucha activa");
  });

  it("no envía el tramo si el flujo detectó voz", () => {
    const d = decidirEnvioOido({ ...base, hayVoz: true });
    expect(d.enviar).toBe(false);
    expect(d.motivo).toContain("reconocimiento de habla");
  });

  it("no envía fragmentos por debajo del umbral de energía", () => {
    const d = decidirEnvioOido({ ...base, energia: base.umbralEnergia - 0.01 });
    expect(d.enviar).toBe(false);
    expect(d.motivo).toContain("umbral");
  });

  it("no envía fragmentos con energía no finita (ruido de medición)", () => {
    const d = decidirEnvioOido({ ...base, energia: NaN });
    expect(d.enviar).toBe(false);
  });

  it("respeta el intervalo mínimo entre envíos (ahorro de CPU)", () => {
    const d = decidirEnvioOido({ ...base, tiempoDesdeUltimoEnvio: base.intervaloMinimoSegundos - 1 });
    expect(d.enviar).toBe(false);
    expect(d.motivo).toContain("10 s");
  });

  it("envía justo al cumplirse el intervalo mínimo (borde)", () => {
    const d = decidirEnvioOido({ ...base, tiempoDesdeUltimoEnvio: base.intervaloMinimoSegundos });
    expect(d.enviar).toBe(true);
  });

  it("el orden manda: sentidos apagados antes que el resto de motivos", () => {
    const d = decidirEnvioOido({
      ...base,
      sentidos: { encendidos: false, siempreEscuchando: false },
      hayVoz: true,
      energia: 0,
    });
    expect(d.motivo).toBe("sentidos apagados");
  });
});