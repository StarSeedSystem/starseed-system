import { describe, it, expect } from "vitest";
import {
  sanearContexto,
  evaluarFrescura,
  construirMensajeSistema,
  construirTurnoModelo,
  resolverEntregaRespuesta,
  type FuenteContexto,
} from "../agente-puente";

describe("Agente Puente - Módulo Puro", () => {
  it("oculta secretos y rutas locales de las fuentes internas", () => {
    const textoConClaves = [
      "Clave openai: sk-proj-1234567890abcdef123",
      "SUPABASE_SERVICE_KEY=valor-no-estandar",
      "Archivo: /Users/alex/.starseed/env",
    ].join("\n");
    const limpio = sanearContexto(textoConClaves);
    expect(limpio).not.toContain("sk-proj-1234567890abcdef123");
    expect(limpio).not.toContain("valor-no-estandar");
    expect(limpio).not.toContain("/Users/alex");
    expect(limpio).toContain("[CLAVE_OCULTA]");
    expect(limpio).toContain("[RUTA_LOCAL_OCULTA]");
  });

  it("mantiene intacta la pregunta del usuario al construir el turno", () => {
    const preguntaUsuario = "¿Por qué falla esta clave sk-proj-9876543210zyxwvutsrq en la llamada?";
    const turno = construirTurnoModelo("sistema", [], preguntaUsuario);
    expect(turno.at(-1)).toEqual({ rol: "user", texto: preguntaUsuario });
  });

  it("entrega la respuesta aunque falle su guardado", () => {
    const entrega = resolverEntregaRespuesta({
      ok: false,
      respuesta: "Respuesta ya generada",
      error: "La respuesta no pudo guardarse.",
    }, 200);
    expect(entrega.respuesta).toBe("Respuesta ya generada");
    expect(entrega.error).toBe("La respuesta no pudo guardarse.");
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
    expect(resFresca.etiqueta).toContain(new Date(fuenteFresca.fechaMs!).toISOString());

    const fuenteSinFecha: FuenteContexto = {
      nombre: "desconocida",
      contenido: "algo",
    };
    const resSinFecha = evaluarFrescura(fuenteSinFecha, ahora);
    expect(resSinFecha.fresca).toBe(false);
  });

  it("arma estado, método, medidores y pasarelas con fecha y obsolescencia", () => {
    const ahora = 1700000000000;
    const fuentes: FuenteContexto[] = [
      {
        nombre: "estado",
        contenido: "Todo bien en sk-1234567890abcdef",
        fechaMs: ahora - 5 * 60 * 1000,
      },
      {
        nombre: "método",
        contenido: "Pasos viejos",
        fechaMs: ahora - 300 * 60 * 1000,
        maxEdadMinutos: 60,
      },
      { nombre: "medidores", contenido: "2 agentes", fechaMs: ahora },
      { nombre: "pasarelas", contenido: "NVIDIA_API_KEY=secreto", fechaMs: ahora },
    ];

    const sistema = construirMensajeSistema(fuentes, ahora);
    expect(sistema).toContain("Agente Puente");
    expect(sistema).toContain("FUENTE: estado");
    expect(sistema).toContain("FUENTE: método");
    expect(sistema).toContain("FUENTE: medidores");
    expect(sistema).toContain("FUENTE: pasarelas");
    expect(sistema).toContain(new Date(ahora).toISOString());
    expect(sistema).not.toContain("sk-1234567890abcdef");
    expect(sistema).not.toContain("NVIDIA_API_KEY=secreto");
    expect(sistema).toContain("[CLAVE_OCULTA]");
    expect(sistema).toContain("[ADVERTENCIA: Bloque de contexto VIEJO u OBSOLETO");
  });
});
