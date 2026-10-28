// Pruebas de la salida segura del alcance (INV1025O): cada motivo de rechazo,
// la huella cambiada tras editar, la confirmación ausente, cuota, supresión,
// enlace caído y el nivel alto en automático. Solo módulos puros.

import { describe, expect, it } from "vitest";
import { evaluarEnvio, huellaTexto } from "../alcance-envio";
import {
  AJUSTES_DEFECTO, type AjustesAlcance, type DestinoAlcance, type EntradaEnvio,
  type EnvioPrevio, type PropuestaAlcance, type VeredictoEnvio,
} from "../alcance-tipos";

const AHORA = new Date("2026-10-28T12:00:00Z");
const destino: DestinoAlcance = { id: "obj-1", nombrePublico: "YoSoy", nivel: "medio", medio: "correo-propio", canalPublicado: "contacto@yosoy.net" };

/** Borrador típico aprobado de alcance, con la huella aún por calcular. */
const borrador: Omit<PropuestaAlcance, "huellaAprobada"> = {
  id: "p-1", medio: "correo-propio", asunto: "Hola desde StarSeed",
  cuerpo: "Nos gusta lo que hacéis y os proponemos colaborar.", enlaces: [],
  pie: { identidad: "Alex — StarSeed OS", baja: "Responde BASTA y no recibirás más." },
  estado: "aprobada", aprobadaPorHumano: true, automatico: false, recordatorio: false,
};

/** Entrada válida completa con la huella ya calculada sobre el texto base. */
const entradaBase = async (): Promise<EntradaEnvio> => ({
  propuesta: { ...borrador, huellaAprobada: await huellaTexto(borrador.asunto, borrador.cuerpo, destino.id) },
  destino, ajustes: AJUSTES_DEFECTO, registro: [], suprimidos: [], ahora: AHORA, enlaces: [],
  confirmacion: { texto: "ENVIAR", porPersona: true },
});

type Cambios = Omit<Partial<EntradaEnvio>, "propuesta" | "destino"> & { propuesta?: Partial<PropuestaAlcance>; destino?: Partial<DestinoAlcance> };

/** Evalúa la entrada base con los cambios pedidos en cada prueba. */
const evaluar = async (cambios: Cambios): Promise<VeredictoEnvio> => {
  const base = await entradaBase();
  return evaluarEnvio({ ...base, ...cambios, propuesta: { ...base.propuesta, ...cambios.propuesta }, destino: { ...base.destino, ...cambios.destino } });
};

/** Exige que salga rechazado por un motivo que contenga el texto dado. */
const rechaza = async (cambios: Cambios, texto: string) => {
  const v = await evaluar(cambios);
  expect(v.puede).toBe(false);
  expect(v.motivos.some((m) => m.includes(texto))).toBe(true);
};

describe("evaluarEnvio · salida segura del alcance", () => {
  it("una propuesta limpia sale en verde", async () => {
    const v = await evaluar({});
    expect(v.puede).toBe(true);
    expect(v.motivos).toEqual([]);
  });

  it("no sale nada a un destino suprimido", async () => { await rechaza({ suprimidos: ["obj-1"] }, "suprimido"); });

  it("exige el canal publicado por la propia entidad", async () => { await rechaza({ destino: { canalPublicado: " " } }, "canal publicado"); });

  it("rechaza un medio que no coincide con el destino", async () => { await rechaza({ propuesta: { medio: "formulario" } }, "no coincide"); });

  it("exige que una persona apruebe el texto", async () => {
    await rechaza({ propuesta: { estado: "esperando-aprobacion" } }, "aprobación explícita");
    await rechaza({ propuesta: { aprobadaPorHumano: false } }, "aprobación explícita");
  });

  it("rechaza el texto si cambió después de aprobarse", async () => { await rechaza({ propuesta: { huellaAprobada: "huella-vieja" } }, "cambió después de aprobarse"); });

  it("exige la confirmación escrita ENVIAR de una persona", async () => {
    await rechaza({ confirmacion: { texto: "", porPersona: true } }, "ENVIAR de una persona");
    await rechaza({ confirmacion: { texto: "ENVIAR", porPersona: false } }, "ENVIAR de una persona");
    await rechaza({ confirmacion: { texto: "enviar", porPersona: true } }, "ENVIAR de una persona");
  });

  it("cuenta los envíos del día contra la cuota", async () => {
    const hoy: EnvioPrevio = { destinoId: "obj-9", fecha: "2026-10-28T09:00:00Z", estado: "enviada", recordatorio: false };
    expect((await evaluar({ registro: [hoy, hoy, hoy, hoy] })).puede).toBe(true);
    await rechaza({ registro: [hoy, hoy, hoy, hoy, hoy] }, "límite diario");
  });

  it("mantiene las pausas tras un «no contactar» o un rebote", async () => {
    await rechaza({ registro: [{ destinoId: "obj-1", fecha: "2026-10-27T12:00:00Z", estado: "no-contactar", recordatorio: false }] }, "Pausa de 180");
    await rechaza({ registro: [{ destinoId: "obj-1", fecha: "2026-10-27T12:00:00Z", estado: "rebotada", recordatorio: false }] }, "Pausa de 90");
  });

  it("deja pasar el recordatorio único a los 14 días y no antes", async () => {
    const prev: EnvioPrevio = { destinoId: "obj-1", fecha: "2026-10-13T12:00:00Z", estado: "sin-respuesta", recordatorio: false };
    expect((await evaluar({ registro: [prev], propuesta: { recordatorio: true } })).puede).toBe(true);
    await rechaza({ registro: [{ ...prev, fecha: "2026-10-18T12:00:00Z" }], propuesta: { recordatorio: true } }, "espera a los");
  });

  it("un solo recordatorio, y solo él tras un «sin respuesta»", async () => {
    const prev: EnvioPrevio = { destinoId: "obj-1", fecha: "2026-10-13T12:00:00Z", estado: "sin-respuesta", recordatorio: false };
    const hecho: EnvioPrevio = { destinoId: "obj-1", fecha: "2026-10-27T12:00:00Z", estado: "sin-respuesta", recordatorio: true };
    await rechaza({ registro: [prev, hecho], propuesta: { recordatorio: true } }, "ya salió");
    await rechaza({ registro: [prev] }, "recordatorio único");
  });

  it("exige enlaces vivos comprobados hace menos de 15 minutos", async () => {
    const url = "https://starseed-os.vercel.app/carta";
    const con = (codigo: number, verificadoEn: string): Cambios => ({ propuesta: { enlaces: [url] }, enlaces: [{ url, codigo, verificadoEn }] });
    await rechaza({ propuesta: { enlaces: [url] } }, "no responde 2xx");
    await rechaza(con(500, "2026-10-28T12:00:00Z"), "no responde 2xx");
    await rechaza(con(200, "2026-10-28T11:30:00Z"), "hace menos de 15");
    expect((await evaluar(con(200, "2026-10-28T11:50:00Z"))).puede).toBe(true);
  });

  it("exige el pie con la identidad real y la forma de no recibir", async () => {
    await rechaza({ propuesta: { pie: { identidad: "", baja: "Responde BASTA." } } }, "identidad real");
    await rechaza({ propuesta: { pie: { identidad: "Alex", baja: "" } } }, "identidad real");
  });

  it("el automático jamás saca un nivel alto y nace apagado", async () => {
    await rechaza({ propuesta: { automatico: true }, destino: { nivel: "alto" } }, "nivel alto");
    await rechaza({ propuesta: { automatico: true } }, "apagado o sin validación");
  });

  it("el automático validado solo sale por correo-propio", async () => {
    const ajustes: AjustesAlcance = { ...AJUSTES_DEFECTO, automatico: { activo: true, validado: true } };
    await rechaza({ propuesta: { automatico: true, medio: "red" }, ajustes, destino: { medio: "red" } }, "solo está previsto");
    expect((await evaluar({ propuesta: { automatico: true }, ajustes })).puede).toBe(true);
  });
});
