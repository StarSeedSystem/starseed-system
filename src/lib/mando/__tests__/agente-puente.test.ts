import { describe, it, expect } from "vitest";
import {
  sanearContexto,
  evaluarFrescura,
  construirMensajeSistema,
  type FuenteContexto,
} from "../agente-puente";

describe("Agente Puente - Módulo Puro", () => {
  it("sanearContexto oculta claves de API en el contexto", () => {
    const textoConClaves = "Clave openai: sk-proj-1234567890abcdef123 y sbp_1234567890abcdef";
    const limpio = sanearContexto(textoConClaves);
    expect(limpio).not.toContain("sk-proj-1234567890abcdef123");
    expect(limpio).not.toContain("sbp_1234567890abcdef");
    expect(limpio).toContain("[CLAVE_OCULTA]");
  });

  it("la pregunta del usuario con sk-... no se recorta y se mantiene intacta", () => {
    const preguntaUsuario = "¿Por qué falla esta clave sk-proj-9876543210zyxwvutsrq en la llamada?";
    expect(preguntaUsuario).toContain("sk-proj-9876543210zyxwvutsrq");
  });

  it("evaluarFrescura marca fuentes vigentes vs obsoletas o sin fecha", () => {
    const ahora = 1700000000000;
    const fuenteFria: FuenteContexto = {
      nombre: "relevo",
      contenido: "viejo",
      fechaMs: ahora - 120 * 60 * 1000,
      maxEdadMinutos: 60,
    };
    const resFria = evaluarFrescura(fuenteFria, ahora);
    expect(resFria.fresca).toBe(false);
    expect(resFria.etiqueta).toContain("obsoleto");

    const fuenteFresca: FuenteContexto = {
      nombre: "briefing",
      contenido: "fresco",
      fechaMs: ahora - 10 * 60 * 1000,
      maxEdadMinutos: 60,
    };
    const resFresca = evaluarFrescura(fuenteFresca, ahora);
    expect(resFresca.fresca).toBe(true);
    expect(resFresca.etiqueta).toContain("vigente");

    const fuenteSinFecha: FuenteContexto = {
      nombre: "desconocida",
      contenido: "algo",
    };
    const resSinFecha = evaluarFrescura(fuenteSinFecha, ahora);
    expect(resSinFecha.fresca).toBe(false);
  });

  it("construirMensajeSistema combina fuentes limpiando claves y advirtiendo obsolescencia", () => {
    const ahora = 1700000000000;
    const fuentes: FuenteContexto[] = [
      {
        nombre: "briefing",
        contenido: "Todo bien en sk-1234567890abcdef",
        fechaMs: ahora - 5 * 60 * 1000,
      },
      {
        nombre: "workflow",
        contenido: "Pasos viejos",
        fechaMs: ahora - 300 * 60 * 1000,
        maxEdadMinutos: 60,
      },
    ];

    const sistema = construirMensajeSistema(fuentes, ahora);
    expect(sistema).toContain("Agente Puente");
    expect(sistema).not.toContain("sk-1234567890abcdef");
    expect(sistema).toContain("[CLAVE_OCULTA]");
    expect(sistema).toContain("[ADVERTENCIA: Bloque de contexto VIEJO u OBSOLETO");
  });
});
