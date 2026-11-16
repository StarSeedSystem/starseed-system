import { describe, it, expect } from "vitest";
import {
  AMBITO_POR_DEFECTO, entradasDeRuta, normalizarRegistro, registrarCasos,
  type AlmacenRegistro, type DatosRuta,
} from "@/lib/astraura/laya/registro-ruta";
import type { EntradaDecision } from "@/lib/astraura/laya/registro-decision";
import type { RegistroAprendizaje } from "@/lib/astraura/laya/aprendizaje-laya";

// El cableado del registro de Laya en `/api/astraura/decidir` (JLA1116A §2 y §8, fase 1):
// lo que la ruta midió entra por parámetro y el almacén va inyectado (aquí, en memoria).

/** Almacén de memoria que cuenta cuántas veces se escribió. */
function almacenDePrueba(): { almacen: AlmacenRegistro; estado: { escrituras: number } } {
  let registro: RegistroAprendizaje = [];
  const estado = { escrituras: 0 };
  const almacen: AlmacenRegistro = {
    leer: async () => registro,
    escribir: async (nuevo) => { registro = nuevo; estado.escrituras++; },
  };
  return { almacen, estado };
}

const datos = (extra: Partial<DatosRuta> = {}): DatosRuta => ({
  accion: "ejecutar", laya: { confianza: 0.83, ms: 2100 }, habilidad: { confianza: 0.7, ms: 900 },
  estado: "consulta: abrir el panel de ajustes", donde: "a1", ts: 1760000000000, ...extra,
});

const entrada = (extra: Partial<EntradaDecision> = {}): EntradaDecision => ({
  punto: "reflejo.herramienta", ambito: "personal", answer_confidence: 0.6,
  donde: "a1", ms: 1200, escalo: false, estado: "consulta", ...extra,
});

describe("entradasDeRuta", () => {
  it("una entrada por cada capa de Laya que respondió, con su punto, confianza, ms y medio", () => {
    const entradas = entradasDeRuta(datos());
    expect(entradas).toHaveLength(2);
    expect(entradas[0]).toMatchObject({
      punto: "reflejo.herramienta", ambito: AMBITO_POR_DEFECTO, answer_confidence: 0.83,
      donde: "a1", ms: 2100, escalo: false, estado: "consulta: abrir el panel de ajustes", ts: 1760000000000,
    });
    expect(entradas[1]).toMatchObject({ punto: "habilidad.elegir", answer_confidence: 0.7, ms: 900 });
  });

  it("la capa que no respondió no produce entrada", () => {
    expect(entradasDeRuta(datos({ laya: null })).map((e) => e.punto)).toEqual(["habilidad.elegir"]);
  });

  it("el plan que escaló se marca como escalada y el que no, no", () => {
    expect(entradasDeRuta(datos({ accion: "escalar_llm" }))[0].escalo).toBe(true);
    expect(entradasDeRuta(datos({ accion: "escalar_jev" }))[0].escalo).toBe(true);
    expect(entradasDeRuta(datos({ accion: "confirmar" }))[0].escalo).toBe(false);
  });

  it("el ámbito que llega manda y, si no llega, el de la neurona", () => {
    expect(entradasDeRuta(datos({ ambito: "pagina-42" }))[0].ambito).toBe("pagina-42");
    expect(entradasDeRuta(datos({ ambito: "  " }))[0].ambito).toBe(AMBITO_POR_DEFECTO);
    expect(entradasDeRuta(datos())[0].ambito).toBe("personal");
  });

  it("sin `ts` inyectado la entrada no lleva marca de tiempo (aquí no se lee el reloj)", () => {
    expect(entradasDeRuta(datos({ ts: undefined }))[0].ts).toBeUndefined();
  });
});

describe("registrarCasos", () => {
  it("anota los casos en el registro y lo guarda", async () => {
    const { almacen, estado } = almacenDePrueba();
    const reg = await registrarCasos(almacen, entradasDeRuta(datos()));
    expect(reg.guardados).toBe(2);
    expect(reg.registro.map((c) => c.punto)).toEqual(["reflejo.herramienta", "habilidad.elegir"]);
    expect(estado.escrituras).toBe(1);
  });

  it("en un punto privado guarda SOLO la huella del estado (el texto no sale)", async () => {
    const { almacen } = almacenDePrueba();
    const reg = await registrarCasos(almacen, [entrada({
      punto: "privacidad.subir", estado: "estado con teléfono 600·000·000 y saldos",
    })]);
    expect(reg.registro[0].privado).toBe(true);
    expect(reg.registro[0].estado).toMatch(/^h[0-9a-f]{8}$/);
    expect(reg.registro[0].estado).not.toContain("teléfono");
  });

  it("un punto desconocido no anota nada ni escribe", async () => {
    const { almacen, estado } = almacenDePrueba();
    const reg = await registrarCasos(almacen, [entrada({ punto: "punto.inventado" })]);
    expect(reg.guardados).toBe(0);
    expect(reg.registro).toHaveLength(0);
    expect(estado.escrituras).toBe(0);
  });

  it("sin confianza calibrada válida tampoco hay caso (no se inventa `p`)", async () => {
    const { almacen } = almacenDePrueba();
    const reg = await registrarCasos(almacen, [entrada({ answer_confidence: Number.NaN })]);
    expect(reg.guardados).toBe(0);
    expect(reg.registro).toHaveLength(0);
  });
});

describe("normalizarRegistro", () => {
  it("descarta lo que no es un caso válido y conserva los que sí lo son", () => {
    const casos = normalizarRegistro([
      { punto: "reflejo.herramienta", ambito: "personal", p: 0.83, donde: "a1", ms: 2100,
        resultado: "aceptada", estado: "h1a2b3c4", privado: true, ts: 1760000000000 },
      { punto: "punto.inventado", ambito: "personal", p: 0.5, donde: "a1", ms: 1, resultado: "aceptada", estado: "x" },
      { punto: "reflejo.herramienta", ambito: "personal", p: 2, donde: "a1", ms: 1, resultado: "aceptada", estado: "x" },
      { punto: "reflejo.herramienta", ambito: "personal", p: 0.5, donde: "otro", ms: 1, resultado: "aceptada", estado: "x" },
      "basura", null,
    ]);
    expect(casos).toHaveLength(1);
    expect(casos[0]).toMatchObject({ punto: "reflejo.herramienta", p: 0.83, donde: "a1", ts: 1760000000000 });
  });

  it("lo que no es una lista de casos se queda vacío", () => {
    expect(normalizarRegistro(null)).toHaveLength(0);
    expect(normalizarRegistro({ punto: "reflejo.herramienta" })).toHaveLength(0);
  });
});
