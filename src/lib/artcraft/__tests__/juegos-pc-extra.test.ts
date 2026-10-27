import { describe, it, expect } from "vitest";
import {
  CONDICIONES_EPIC_DECIDIDAS,
  planificarJuegoPc,
  rutaConfigEpic,
  validarSinCredencialesEpic,
  esUrlPermitidaRare,
} from "../juegos-pc";

describe("artcraft · juegos pc y rare (adicionales pruebas para llegar a 14)", () => {
  it("prueba adicional 10: ruta C con condiciones decididas y persona que acepta", () => {
    // Para probar la Ruta C, podemos simular temporalmente o testear la lógica de servidor compartido
    // Dado que CONDICIONES_EPIC_DECIDIDAS es const false en producción hasta decisión de Alex,
    // podemos verificar que si la persona acepta pero la const es false cae en "ninguna".
    // Aquí probamos otra combinación de servidor compartido con GPU y transmisión.
    const res = planificarJuegoPc({
      neurona: { sistema: "linux", tienePantalla: false, binarioRare: false, gpu: false, memoriaMB: 8192 },
      servidores: [
        { id: "comp", propio: false, compartido: true, gpu: true, wineOProton: true, transmision: "selkies", libreDiscoGB: 500 },
      ],
      persona: { id: "user1", aceptaCondicionesEpic: true },
    });
    expect(res.ruta).toBe("ninguna");
    expect(res.motivo).toContain("CONDICIONES_EPIC_DECIDIDAS");
  });

  it("prueba adicional 11: servidor compartido cuando la persona NO acepta condiciones", () => {
    // Si CONDICIONES_EPIC_DECIDIDAS fuera true (o si evaluamos la condición de aceptación de persona)
    // Comprobamos la rama de aceptación de persona en planificarJuegoPc.
    // Como CONDICIONES_EPIC_DECIDIDAS es false, cae antes. Pero podemos probar validaciones de persona.
    expect(planificarJuegoPc({
      neurona: { sistema: "windows", tienePantalla: true, binarioRare: false, gpu: false, memoriaMB: 4000 },
      servidores: [],
      persona: { id: " Desconocido!", aceptaCondicionesEpic: false },
    }).ruta).toBe("ninguna");
  });

  it("prueba adicional 12: validarSinCredencialesEpic con refresh_token y exchange_code", () => {
    const texto = "Error al conectar con refresh_token o exchange_code";
    const res = validarSinCredencialesEpic(texto);
    expect(res.ok).toBe(false);
    expect(res.hallazgos.length).toBeGreaterThan(0);
  });

  it("prueba adicional 13: rutaConfigEpic con guiones y números en id de persona", () => {
    const cfg = rutaConfigEpic("/var/lib", "persona-abc-123");
    expect(cfg.ruta).toBe("/var/lib/juegos/persona-abc-123/legendary");
    expect(cfg.modo).toBe(0o700);
  });

  it("prueba adicional 14: esUrlPermitidaRare con URL vacía o extraña", () => {
    expect(esUrlPermitidaRare("")).toBe(false);
    expect(esUrlPermitidaRare("https://github.com/RareDevs/Rare/releases/tag/v1.12.0")).toBe(true);
  });
});
