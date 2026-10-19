import { describe, it, expect } from "vitest";
import { pantallaPara } from "../pantalla-video";
import type { NivelCalidad } from "../tipos";

describe("pantallaPara", () => {
  it("should calculate correct values for media quality", () => {
    const resultado = pantallaPara({
      ancho: 1920,
      alto: 1080,
      distanciaM: 2,
      calidadXR: "media" as NivelCalidad,
    });
    expect(resultado).toEqual({
      anchoMetros: 1.0717967697244908,
      altoMetros: 0.6028856829700261,
      texturaAnchoPx: 1920,
      texturaAltoPx: 1080,
      usarRenderizado: false,
    });
  });
});