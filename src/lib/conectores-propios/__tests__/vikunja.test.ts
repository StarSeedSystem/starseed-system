import { describe, it, expect } from "vitest";
import {
  asegurarProyecto,
  tareaDesdeDecision,
  type Pedir,
  type RespuestaEtapi,
  type Entidad,
  type Decision,
} from "../vikunja";

const TOKEN = "vikunja-token-seguro";
const BASE = "https://vikunja.example.com/api/v1";

function responder(
  cuerpo: string,
  ok = true,
  status = 200,
): RespuestaEtapi {
  return { ok, status, text: async () => cuerpo };
}

function espia(...respuestas: RespuestaEtapi[]) {
  const llamadas: { url: string; init: Parameters<Pedir>[1] }[] = [];
  const pedir: Pedir = async (url, init) => {
    llamadas.push({ url, init });
    const index = llamadas.length - 1;
    if (index < respuestas.length) {
      return respuestas[index];
    }
    return respuestas[respuestas.length - 1];
  };
  return { pedir, llamadas };
}

describe("vikunja · cliente puro", () => {
  const entidadRed: Entidad = { tipo: "red", id: "1", nombre: "Red de prueba" };
  const entidadGrupo: Entidad = { tipo: "grupo", id: "2", nombre: "Grupo alfa" };

  it("asegura un proyecto de red buscándolo primero (ya existe)", async () => {
    const { pedir } = espia(
      responder(
        JSON.stringify([
          { id: "p1", title: "red · Red de prueba · 1" },
        ]),
      ),
    );
    const resultado = await asegurarProyecto(pedir, BASE, TOKEN, entidadRed);
    expect(resultado.ok).toBe(true);
    expect(resultado.proyecto).toEqual({ id: "p1", titulo: "red · Red de prueba · 1" });
    expect(resultado.motivo).toBeUndefined();
  });

  it("asegura un proyecto de grupo creándolo nuevo", async () => {
    const { pedir } = espia(
      responder(JSON.stringify({ id: "p2", title: "grupo · Grupo alfa · 2" }), true, 201),
    );
    const resultado = await asegurarProyecto(pedir, BASE, TOKEN, entidadGrupo);
    expect(resultado.ok).toBe(true);
    expect(resultado.proyecto).toEqual({ id: "p2", titulo: "grupo · Grupo alfa · 2" });
  });

  it("devuelve {ok:false, motivo} cuando el proyecto ya existe", async () => {
    const { pedir } = espia(
      responder("", false, 409),
    );
    const resultado = await asegurarProyecto(pedir, BASE, TOKEN, entidadRed);
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toContain("ya existe");
    expect(resultado.proyecto).toBeUndefined();
  });

  it("devuelve {ok:false, motivo} cuando falla la conexión", async () => {
    const { pedir } = espia(responder("", false, 500));
    const resultado = await asegurarProyecto(pedir, BASE, TOKEN, entidadRed);
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toContain("falló");
  });

  it("maneja token inválido sin filtrarlo", async () => {
    const tokenLimpio = "vikunja-token-seguro";
    const tokenOculto = "«oculto»";
    const { pedir } = espia(responder("Token inválido", false, 401));
    const resultado = await asegurarProyecto(pedir, BASE, tokenLimpio, entidadRed);
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toContain("inválido");
    expect(resultado.motivo).not.toContain(tokenLimpio);
    expect(resultado.motivo).toContain(tokenOculto);
  });

  const decision: Decision = {
    propuestaId: "prop-123",
    titulo: "Implementar API de audio",
    aprobadaEn: "2026-10-20T14:30:00Z",
    sector: "audios",
  };

  it("crea una tarea desde una decisión democrática", async () => {
    const { pedir } = espia(
      responder(JSON.stringify({ id: "t1", title: "Implementar API de audio" }), true, 201),
    );
    const resultado = await tareaDesdeDecision(pedir, BASE, TOKEN, "p1", decision);
    expect(resultado.ok).toBe(true);
    expect(resultado.tarea).toEqual({ id: "t1", titulo: "Implementar API de audio" });
    expect(resultado.motivo).toBeUndefined();
  });

  it("devuelve {ok:false, motivo} cuando no puede crear tarea", async () => {
    const { pedir } = espia(responder("", false, 409));
    const resultado = await tareaDesdeDecision(pedir, BASE, TOKEN, "p1", decision);
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toContain("No se pudo crear la tarea");
    expect(resultado.tarea).toBeUndefined();
  });

  it("maneja error 404 al crear tarea", async () => {
    const { pedir } = espia(responder("", false, 404));
    const resultado = await tareaDesdeDecision(pedir, BASE, TOKEN, "p1", decision);
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toContain("Error HTTP 404.");
  });
});
