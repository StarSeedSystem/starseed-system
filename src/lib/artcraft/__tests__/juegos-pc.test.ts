import { describe, it, expect } from "vitest";
import {
  CONDICIONES_EPIC_DECIDIDAS,
  planificarJuegoPc,
  rutaConfigEpic,
  validarSinCredencialesEpic,
  esUrlPermitidaRare,
} from "../juegos-pc";

describe("artcraft · juegos pc y rare", () => {
  it("ruta A: neurona propia con pantalla y Rare instalado", () => {
    const res = planificarJuegoPc({
      neurona: { sistema: "macos", tienePantalla: true, binarioRare: true, gpu: true, memoriaMB: 16384 },
      servidores: [],
      persona: { id: "alex", aceptaCondicionesEpic: true },
    });
    expect(res.ruta).toBe("neurona-propia");
    expect(res.motivo).toContain("Ruta A");
  });

  it("ruta B: servidor propio con GPU, Wine/Proton y transmisión", () => {
    const res = planificarJuegoPc({
      neurona: { sistema: "linux", tienePantalla: false, binarioRare: false, gpu: false, memoriaMB: 8192 },
      servidores: [
        { id: "serv-1", propio: true, compartido: false, gpu: true, wineOProton: true, transmision: "sunshine", libreDiscoGB: 500 },
      ],
      persona: { id: "alex", aceptaCondicionesEpic: true },
    });
    expect(res.ruta).toBe("servidor-propio");
    expect(res.motivo).toContain("Ruta B");
  });

  it("ruta C bloqueada cuando CONDICIONES_EPIC_DECIDIDAS es false", () => {
    expect(CONDICIONES_EPIC_DECIDIDAS).toBe(false);
    const res = planificarJuegoPc({
      neurona: { sistema: "linux", tienePantalla: false, binarioRare: false, gpu: false, memoriaMB: 8192 },
      servidores: [
        { id: "serv-comp", propio: false, compartido: true, gpu: true, wineOProton: true, transmision: "selkies", libreDiscoGB: 1000 },
      ],
      persona: { id: "alex", aceptaCondicionesEpic: true },
    });
    expect(res.ruta).toBe("ninguna");
    expect(res.motivo).toContain("CONDICIONES_EPIC_DECIDIDAS");
  });

  it("mac sin pantalla no toma ruta A ni servidor propio si no hay servidor", () => {
    const res = planificarJuegoPc({
      neurona: { sistema: "macos", tienePantalla: false, binarioRare: true, gpu: true, memoriaMB: 16384 },
      servidores: [],
      persona: { id: "alex", aceptaCondicionesEpic: true },
    });
    expect(res.ruta).toBe("ninguna");
  });

  it("A1 sin GPU añade aviso de que no sirve para 3D", () => {
    const res = planificarJuegoPc({
      neurona: { sistema: "linux", tienePantalla: false, binarioRare: false, gpu: false, memoriaMB: 12288 },
      servidores: [
        { id: "a1", propio: true, compartido: false, gpu: false, wineOProton: true, transmision: "sunshine", libreDiscoGB: 200 },
      ],
      persona: { id: "alex", aceptaCondicionesEpic: true },
    });
    expect(res.avisos.some((a) => a.includes("A1 de Oracle"))).toBe(true);
    expect(res.ruta).toBe("ninguna");
  });

  it("rutaConfigEpic con persona válida genera ruta y modo 0o700", () => {
    const cfg = rutaConfigEpic("/home/usuario", "persona-123");
    expect(cfg.ruta).toBe("/home/usuario/juegos/persona-123/legendary");
    expect(cfg.modo).toBe(0o700);
  });

  it("rutaConfigEpic con persona inválida lanza error", () => {
    expect(() => rutaConfigEpic("/home", "Persona Invalida!")).toThrow();
  });

  it("validarSinCredencialesEpic detecta campos y tokens eg1~ sin contener claves reales", () => {
    const tokenPartes = ["eg1", "~abc12345678"].join("");
    const textoSeguro = "Hola, esto es un mensaje normal sin secretos.";
    const textoInseguro = `Configuración con access_token y account_id además de ${tokenPartes}`;

    const r1 = validarSinCredencialesEpic(textoSeguro);
    expect(r1.ok).toBe(true);
    expect(r1.hallazgos).toHaveLength(0);

    const r2 = validarSinCredencialesEpic(textoInseguro);
    expect(r2.ok).toBe(false);
    expect(r2.hallazgos.length).toBeGreaterThan(0);
    // Verificar que los hallazgos no repiten el valor exacto de la clave entera
    for (const h of r2.hallazgos) {
      expect(h).not.toContain("abc12345678");
    }
  });

  it("esUrlPermitidaRare bloquea raredevs.github.io, protondb.com y remotos sin fijar, permitiendo releases de RareDevs", () => {
    expect(esUrlPermitidaRare("https://raredevs.github.io/wring/workarounds.json")).toBe(false);
    expect(esUrlPermitidaRare("https://www.protondb.com/app/1234")).toBe(false);
    expect(esUrlPermitidaRare("https://malicious.com/rare.zip")).toBe(false);
    expect(esUrlPermitidaRare("https://github.com/RareDevs/Rare/releases/download/1.12.0.237/Rare-1.12.0.237-arm64.dmg")).toBe(true);
  });
});
