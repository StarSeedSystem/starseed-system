import { describe, it, expect } from "vitest";
import {
  CONDICIONES_EPIC_DECIDIDAS,
  planificarJuegoPc,
  rutaConfigEpic,
  validarSinCredencialesEpic,
  esUrlPermitidaRare,
} from "../juegos-pc";

describe("juegos-pc · planificarJuegoPc", () => {
  const neuronaBase = {
    sistema: "linux" as const,
    tienePantalla: false,
    binarioRare: false,
    gpu: true,
    memoriaMB: 16384,
  };
  const servidoresBase = [
    { id: "srv1", propio: true, compartido: false, gpu: true, wineOProton: true, transmision: "selkies" as const, libreDiscoGB: 100 },
    { id: "srv2", propio: false, compartido: true, gpu: true, wineOProton: true, transmision: "sunshine" as const, libreDiscoGB: 50 },
  ];
  const personaBase = { id: "alex", aceptaCondicionesEpic: true };

  it("ruta A: neurona con pantalla y Rare instalado", () => {
    const r = planificarJuegoPc({
      neurona: { ...neuronaBase, tienePantalla: true, binarioRare: true },
      servidores: servidoresBase,
      persona: personaBase,
    });
    expect(r.ruta).toBe("neurona-propia");
    expect(r.pasos).toContain("abre Rare");
    expect(r.motivo).toContain("pantalla y Rare");
  });

  it("ruta B: servidor propio con GPU, Wine/Proton y transmisión", () => {
    const r = planificarJuegoPc({
      neurona: { ...neuronaBase, tienePantalla: false },
      servidores: servidoresBase,
      persona: personaBase,
    });
    expect(r.ruta).toBe("servidor-propio");
    expect(r.pasos.some(p => p.includes("selkies"))).toBe(true);
    expect(r.pasos).toContain("inicia sesión en Epic tú mismo");
  });

  it("ruta C bloqueada con CONDICIONES_EPIC_DECIDIDAS = false", () => {
    const r = planificarJuegoPc({
      neurona: { ...neuronaBase, tienePantalla: false },
      servidores: [{ ...servidoresBase[1], gpu: true, wineOProton: true, transmision: "selkies" }],
      persona: { ...personaBase, aceptaCondicionesEpic: true },
    });
    expect(r.ruta).toBe("ninguna");
    expect(r.motivo).toContain("condiciones de Epic decididas");
  });

  it("Mac sin pantalla: no ofrece ruta A", () => {
    const r = planificarJuegoPc({
      neurona: { ...neuronaBase, sistema: "macos", tienePantalla: false, binarioRare: true },
      servidores: servidoresBase,
      persona: personaBase,
    });
    expect(r.ruta).not.toBe("neurona-propia");
  });

  it("A1 sin GPU: aviso incluido", () => {
    const r = planificarJuegoPc({
      neurona: { ...neuronaBase, gpu: false },
      servidores: [{ ...servidoresBase[0], gpu: false }],
      persona: personaBase,
    });
    expect(r.avisos.some(a => a.includes("A1 de Oracle") && a.includes("no sirve para 3D"))).toBe(true);
  });

  it("ninguna: sin servidor propio ni compartido adecuado", () => {
    const r = planificarJuegoPc({
      neurona: neuronaBase,
      servidores: [
        { id: "srv3", propio: false, compartido: true, gpu: false, wineOProton: true, transmision: "selkies", libreDiscoGB: 10 },
      ],
      persona: personaBase,
    });
    expect(r.ruta).toBe("ninguna");
  });
});

describe("juegos-pc · rutaConfigEpic", () => {
  it("ruta correcta con persona válida", () => {
    const r = rutaConfigEpic("/datos", "alex-123");
    expect(r.ruta).toBe("/datos/juegos/alex-123/legendary");
    expect(r.modo).toBe(0o700);
  });

  it("lanza con personaId inválido (mayúsculas)", () => {
    expect(() => rutaConfigEpic("/datos", "Alex")).toThrow(/personaId inválido/);
  });

  it("lanza con personaId inválido (caracteres raros)", () => {
    expect(() => rutaConfigEpic("/datos", "alex@")).toThrow(/personaId inválido/);
  });

  it("lanza con personaId muy largo", () => {
    expect(() => rutaConfigEpic("/datos", "a".repeat(65))).toThrow(/personaId inválido/);
  });

  it("lanza con personaId vacío", () => {
    expect(() => rutaConfigEpic("/datos", "")).toThrow(/personaId inválido/);
  });
});

describe("juegos-pc · validarSinCredencialesEpic", () => {
  it("detecta access_token", () => {
    const txt = 'access_token="valor_largo_aqui_123456789"';
    const r = validarSinCredencialesEpic(txt);
    expect(r.ok).toBe(false);
    expect(r.hallazgos).toContain("access_token");
  });

  it("detecta refresh_token", () => {
    const txt = 'refresh_token: "valor_largo_aqui_123456789"';
    const r = validarSinCredencialesEpic(txt);
    expect(r.ok).toBe(false);
    expect(r.hallazgos).toContain("refresh_token");
  });

  it("detecta account_id", () => {
    const txt = 'account_id = "valor_largo_aqui_123456789"';
    const r = validarSinCredencialesEpic(txt);
    expect(r.ok).toBe(false);
    expect(r.hallazgos).toContain("account_id");
  });

  it("detecta exchange_code", () => {
    const txt = 'exchange_code="valor_largo_aqui_123456789"';
    const r = validarSinCredencialesEpic(txt);
    expect(r.ok).toBe(false);
    expect(r.hallazgos).toContain("exchange_code");
  });

  it("detecta token eg1~", () => {
    const prefijo = ["eg1", "~abc123456789"].join("");
    const txt = `token: ${prefijo}`;
    const r = validarSinCredencialesEpic(txt);
    expect(r.ok).toBe(false);
    expect(r.hallazgos.some(h => h.includes("eg1"))).toBe(true);
  });

  it("no repite hallazgos duplicados", () => {
    const txt = 'access_token="valor_largo_a". access_token="otro_valor_largo"';
    const r = validarSinCredencialesEpic(txt);
    expect(r.hallazgos.filter(h => h === "access_token")).toHaveLength(1);
  });

  it("ok: true cuando no hay credenciales", () => {
    const r = validarSinCredencialesEpic("texto normal sin secretos");
    expect(r.ok).toBe(true);
    expect(r.hallazgos).toHaveLength(0);
  });
});

describe("juegos-pc · esUrlPermitidaRare", () => {
  it("bloquea raredevs.github.io", () => {
    expect(esUrlPermitidaRare("https://raredevs.github.io/wring")).toBe(false);
  });

  it("bloquea protondb.com", () => {
    expect(esUrlPermitidaRare("https://protondb.com/app/123")).toBe(false);
  });

  it("bloquea descarga remota de Rare (genérica)", () => {
    expect(esUrlPermitidaRare("https://otro.sitio.com/rare.zip")).toBe(false);
  });

  it("permite releases de GitHub de RareDevs/Rare", () => {
    expect(esUrlPermitidaRare("https://github.com/RareDevs/Rare/releases/tag/1.12.0.237")).toBe(true);
    expect(esUrlPermitidaRare("https://github.com/RareDevs/Rare/releases/download/1.12.0.237/Rare-linux.zip")).toBe(true);
  });

  it("bloquea otras URLs de GitHub", () => {
    expect(esUrlPermitidaRare("https://github.com/otro/repo/releases")).toBe(false);
  });

  it("devuelve false para URLs inválidas", () => {
    expect(esUrlPermitidaRare("no-es-url")).toBe(false);
  });
});