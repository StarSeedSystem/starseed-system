"use client";
import { describe, it, expect } from "vitest";
import { planificarJuegoPc, rutaConfigEpic, validarSinCredencialesEpic, esUrlPermitidaRare, neuronaConPantallaYRare, neuronaSinPantalla, neuronaSinGPU, servidorPropioConGPU, servidorCompartidoConGPU, personaAcepta, personaNoAcepta, datosConfig } from "../index";

describe("planificarJuegoPc", () => {
  it("Ruta A: neurona propia con pantalla y Rare instalado", () => {
    const e: { neurona: any; servidores: any[]; persona: any } = { neurona: { ...neuronaConPantallaYRare, gpu: true } as any, servidores: [] as any[], persona: personaAcepta };
    const r = planificarJuegoPc(e);
    expect(r.ruta).toBe("neurona-propia");
    expect(r.motivo).toContain("neurona con pantalla y binario instalado");
    expect(r.pasos).toBe(2);
  });

  it("Ruta A cuando CONDICIONES_EPIC_DECIDIDAS es false (siempre)", () => {
    const e: { neurona: any; servidores: any[]; persona: any } = { neurona: { ...neuronaConPantallaYRare, gpu: true } as any, servidores: [] as any[], persona: personaAcepta };
    const r = planificarJuegoPc(e);
    expect(r.ruta).toBe("neurona-propia"); // A no depende de la constante
  });

  it("Ruta B bloqueada cuando CONDICIONES_EPIC_DECIDIDAS es false", () => {
    const e: { neurona: any; servidores: any[]; persona: any } = {
      neurona: { sistema: "linux", tienePantalla: false, binarioRare: true, gpu: true, memoriaMB: 8192 },
      servidores: [servidorPropioConGPU],
      persona: personaNoAcepta,
    };
    const r = planificarJuegoPc(e);
    expect(r.ruta).toBe("ninguna");
    expect(r.motivo).toContain("condiciones Epic no decididas");
  });

  it("Ruta C bloqueada cuando CONDICIONES_EPIC_DECIDIDAS es false", () => {
    const e: { neurona: any; servidores: any[]; persona: any } = {
      neurona: { sistema: "linux", tienePantalla: false, binarioRare: true, gpu: true, memoriaMB: 8192 },
      servidores: [servidorCompartidoConGPU] as any[],
      persona: personaNoAcepta,
    };
    const r = planificarJuegoPc(e);
    expect(r.ruta).toBe("ninguna");
    expect(r.motivo).toContain("condiciones Epic no decididas");
  });

  it("Mac sin pantalla: ninguna ruta disponible", () => {
    const e: { neurona: any; servidores: any[]; persona: any } = { neurona: neuronaSinPantalla as any, servidores: [] as any[], persona: personaAcepta };
    const r = planificarJuegoPc(e);
    expect(r.ruta).toBe("ninguna");
    expect(r.motivo).toContain("sin pantalla");
  });

  it("Mac A1 sin GPU: aviso en Route A", () => {
    const e: { neurona: any; servidores: any[]; persona: any } = { neurona: neuronaSinGPU as any, servidores: [] as any[], persona: personaAcepta };
    const r = planificarJuegoPc(e);
    expect(r.ruta).toBe("neurona-propia");
    expect(r.avisos).toContain("el A1 de Oracle (sin GPU) no sirve para juegos 3D");
  });

  it("Ruta C bloqueada sin aceptar condiciones Epic", () => {
    const e: { neurona: any; servidores: any[]; persona: any } = {
      neurona: { sistema: "linux", tienePantalla: false, binarioRare: true, gpu: true, memoriaMB: 8192 },
      servidores: [servidorCompartidoConGPU] as any[],
      persona: personaNoAcepta,
    };
    const r = planificarJuegoPc(e);
    expect(r.ruta).toBe("ninguna");
  });
});

describe("rutaConfigEpic", () => {
  it("rutaConfigEpic con persona inválida", () => {
    const r = rutaConfigEpic(datosConfig, "invalid id with spaces");
    expect(r.ruta).toBe("");
    expect(r.modo).toBe(0);
  });

  it("rutaConfigEpic con persona válida", () => {
    const r = rutaConfigEpic(datosConfig, "valid-persona-123");
    expect(r.ruta).toBe("/datos/juegos/valid-persona-123/legendary");
    expect(r.modo).toBe(0o700);
  });
});

describe("validarSinCredencialesEpic", () => {
  it("validarSinCredencialesEpic detecta access_token sin tener clave real", () => {
    const texto = "texto con access_token embedded";
    const r = validarSinCredencialesEpic(texto);
    expect(r.ok).toBe(true);
    expect(r.hallazgos).toContain("access_token");
  });

  it("validarSinCredencialesEpic detecta refresh_token sin tener clave real", () => {
    const texto = "texto con refresh_token embedded";
    const r = validarSinCredencialesEpic(texto);
    expect(r.ok).toBe(true);
    expect(r.hallazgos).toContain("refresh_token");
  });

  it("validarSinCredencialesEpic detecta account_id sin tener clave real", () => {
    const texto = "texto con account_id embedded";
    const r = validarSinCredencialesEpic(texto);
    expect(r.ok).toBe(true);
    expect(r.hallazgos).toContain("account_id");
  });

  it("validarSinCredencialesEpic detecta exchange_code sin tener clave real", () => {
    const texto = ["cambio", "exchange_code", "abcdefgh"].join(" ");
    const r = validarSinCredencialesEpic(texto);
    expect(r.ok).toBe(true);
    expect(r.hallazgos).toContain("exchange_code");
  });

  it("validarSinCredencialesEpic no alarma con strings inofensivos", () => {
    const texto = ["solo", "texto", "normal", "sin", "claves"].join(" ");
    const r = validarSinCredencialesEpic(texto);
    expect(r.ok).toBe(false);
    expect(r.hallazgos).toEqual([]);
  });

  it("validarSinCredencialesEpic monta cadenas con ['eg1', '~abc'].join('') sin exponer claves reales", () => {
    const eg1Token = ["eg1", "~abc"].join("");
    const texto = `token=${eg1Token}`;
    const r = validarSinCredencialesEpic(texto);
    expect(r.hallazgos).toContain("token con prefijo eg1~");
    expect(r.hallazgos).not.toContain(eg1Token);
  });
});

describe("esUrlPermitidaRare", () => {
  it("esUrlPermitidaRare bloquea raredevs.github.io", () => {
    expect(esUrlPermitidaRare("https://raredevs.github.io/somefile.dmg")).toBe(false);
  });

  it("esUrlPermitidaRare bloquea protondb.com", () => {
    expect(esUrlPermitidaRare("https://protondb.com/test")).toBe(false);
  });

  it("esUrlPermitidaRare permite github.com/RareDevs/Rare/releases", () => {
    expect(esUrlPermitidaRare("https://github.com/RareDevs/Rare/releases/tag/1.12.0.237")).toBe(true);
  });

  it("esUrlPermitidaRare bloquea descargas remotas de Rare", () => {
    expect(esUrlPermitidaRare("https://example.com/Rare-linux.zip")).toBe(false);
  });
});
