"use strict";

import { describe, it, expect } from "vitest";
import { planificarJuegoPc, CONDICIONES_EPIC_DECIDIDAS, rutaConfigEpic, validarSinCredencialesEpic, esUrlPermitidaRare } from "../juegos-pc";
import { type Neurona, type Servidor, type Persona } from "../juegos-pc";

describe("planificarJuegoPc", () => {
  const neuronaConPantallaYRare: Neurona = {
    sistema: "macos",
    tienePantalla: true,
    binarioRare: true,
    gpu: true,
    memoriaMB: 16384
  };
  const servidorPropioConGPU: Servidor = {
    id: "servidor1",
    propio: true,
    compartido: false,
    gpu: true,
    wineOProton: false,
    transmision: "selkies",
    libreDiscoGB: 100
  };
  const servidorCompartidoConGPU: Servidor = {
    id: "compartido1",
    propio: false,
    compartido: true,
    gpu: true,
    wineOProton: false,
    transmision: "sunshine",
    libreDiscoGB: 200
  };
  const neuronaSinPantalla: Neurona = {
    sistema: "macos",
    tienePantalla: false,
    binarioRare: true,
    gpu: true,
    memoriaMB: 16384
  };
  const neuronaSinGPU: Neurona = {
    sistema: "linux",
    tienePantalla: true,
    binarioRare: true,
    gpu: false,
    memoriaMB: 8192
  };
  const personaAcepta: Persona = {
    id: "valid-persona-123",
    aceptaCondicionesEpic: true
  };
  const personaNoAcepta: Persona = {
    id: "persona-no-acepta",
    aceptaCondicionesEpic: false
  };

  it("Ruta A: neurona propia con pantalla y Rare instalado", () => {
    const e = {
      neurona: neuronaConPantallaYRare,
      servidores: [] as Servidor[],
      persona: personaAcepta
    };
    const r = planificarJuegoPc(e);
    expect(r.ruta).toBe("neurona-propia");
    expect(r.motivo).toContain("neurona con pantalla y binario instalado");
    expect(r.pasos).toHaveLength(2);
  });

  it("Ruta A cuando CONDICIONES_EPIC_DECIDIDAS es false (siempre)", () => {
    const e = {
      neurona: neuronaConPantallaYRare,
      servidores: [] as Servidor[],
      persona: personaAcepta
    };
    const r = planificarJuegoPc(e);
    expect(r.ruta).toBe("neurona-propia");
  });

  it("Ruta B bloqueada cuando CONDICIONES_EPIC_DECIDIDAS es false", () => {
    const e = {
      neurona: { sistema: "linux", tienePantalla: true, binarioRare: true, gpu: true, memoriaMB: 8192 } as Neurona,
      servidores: [servidorPropioConGPU],
      persona: personaAcepta
    };
    const r = planificarJuegoPc(e);
    expect(r.ruta).toBe("ninguna");
    expect(r.motivo).toContain("condiciones Epic no decididas");
  });

  it("Ruta C bloqueada cuando CONDICIONES_EPIC_DECIDIDAS es false", () => {
    const e = {
      neurona: { sistema: "linux", tienePantalla: true, binarioRare: true, gpu: true, memoriaMB: 8192 } as Neurona,
      servidores: [servidorCompartidoConGPU] as Servidor[],
      persona: personaAcepta
    };
    const r = planificarJuegoPc(e);
    expect(r.ruta).toBe("ninguna");
    expect(r.motivo).toContain("condiciones Epic no decididas");
  });

  it("Mac sin pantalla: ninguna ruta disponible", () => {
    const e = {
      neurona: neuronaSinPantalla,
      servidores: [] as Servidor[],
      persona: personaAcepta
    };
    const r = planificarJuegoPc(e);
    expect(r.ruta).toBe("ninguna");
    expect(r.motivo).toContain("sin pantalla");
  });

  it("Mac A1 sin GPU: aviso en Route A", () => {
    const e = {
      neurona: neuronaSinGPU,
      servidores: [] as Servidor[],
      persona: personaAcepta
    };
    const r = planificarJuegoPc(e);
    expect(r.ruta).toBe("neurona-propia");
    expect(r.avisos).toContain("el A1 de Oracle (sin GPU) no sirve para juegos 3D");
  });

  it("Ruta C bloqueada sin aceptar condiciones Epic", () => {
    const e = {
      neurona: { sistema: "linux", tienePantalla: false, binarioRare: true, gpu: true, memoriaMB: 8192 } as Neurona,
      servidores: [servidorCompartidoConGPU] as Servidor[],
      persona: personaNoAcepta
    };
    const r = planificarJuegoPc(e);
    expect(r.ruta).toBe("ninguna");
  });
});


describe("rutaConfigEpic", () => {
  const datosConfig = "/datos/juegos";

  it("rutaConfigEpic con persona inválida", () => {
    const r = rutaConfigEpic(datosConfig, "invalid id with spaces");
    expect(r.ruta).toBe("");
    expect(r.modo).toBe(0);
  });

  it("rutaConfigEpic con persona válida", () => {
    const r = rutaConfigEpic("/datos", "valid-persona-123");
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
