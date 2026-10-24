// Pruebas puras del adaptador de publicaciones y mensajes de «Variaciones públicas» (contrato §5): borrador inyectado, sin red ni disco.
import { describe, it, expect } from "vitest";
import {
  andamioDeBloque, decoracionDe, parteDeClave, validarPayloadBorrador, crearAdaptadorBorrador, registrarAdaptadorBorrador,
  TIPOS_PLANTILLA, type EditorBorrador, type TipoBloquePlantilla,
} from "../publicaciones";
import { adaptadorDe, __resetRegistros } from "../../familias";
import type { EstiloMensaje, BloqueDoc } from "@/lib/mensajeria/formato-tipos";

/** Borrador en memoria: guarda escrituras, inserciones y valores previos. */
function editorFalso() {
  let estilo: EstiloMensaje | null = null;
  let tipos: TipoBloquePlantilla[] = [];
  const escrituras: (EstiloMensaje | null)[] = []; const inserciones: BloqueDoc[][] = [];
  const borrador: EditorBorrador = {
    estiloActual: () => estilo,
    escribirEstilo: (nuevo) => { escrituras.push(nuevo); estilo = nuevo; },
    tiposDeBloque: () => [...tipos],
    insertarAndamios: (bloques) => {
      const previos = [...tipos];
      inserciones.push(bloques);
      tipos = [...previos, ...bloques.map((b) => b.tipo as TipoBloquePlantilla)];
      return () => { tipos = previos; };
    },
  };
  return { borrador, inserciones, escrituras, ver: () => ({ estilo, tipos }) };
}
const ESTILO: EstiloMensaje = { fuente: "mono", tamano: 24, color: "#7c5cff", negrita: true };
describe("claves, decoración y andamios", () => {
  it("parteDeClave resuelve #estilo, #plantilla y #decoracion en post: y mensaje:, y nada más", () => {
    for (const [clave, parte] of [["post:x123#estilo", "estilo"], ["post:x123#plantilla", "plantilla"], ["post:x123#decoracion", "decoracion"]] as const) {
      expect(parteDeClave(clave), clave).toBe(parte);
    }
    for (const sin of ["post:x123", "mensaje:editor#interfaz", "tema:synthwave#estilo", ""]) expect(parteDeClave(sin), sin).toBeNull();
  });
  it("decoracionDe extrae sólo marco, fondo y animación de fondo; los andamios son vacíos y en copia fresca", () => {
    expect(decoracionDe({ ...ESTILO, colorMarco: "#39FF14", grosorMarco: 2, fondo: "cristal", animacionFondo: "aurora" }))
      .toEqual({ colorMarco: "#39FF14", grosorMarco: 2, fondo: "cristal", animacionFondo: "aurora" });
    expect(decoracionDe({ ...ESTILO })).toBeNull(); expect(decoracionDe("texto")).toBeNull();
    expect(andamioDeBloque("lista")).toEqual({ tipo: "lista", ordenada: false, items: [[]] });
    expect(andamioDeBloque("tareas")).toEqual({ tipo: "tareas", items: [{ hecha: false, tramos: [] }] });
    expect(andamioDeBloque("titulo")).toEqual({ tipo: "titulo", nivel: 1, tramos: [] });
    const fila = andamioDeBloque("parrafo") as Extract<BloqueDoc, { tipo: "parrafo" }>;
    fila.tramos.push({ texto: "lios" });
    expect((andamioDeBloque("parrafo") as Extract<BloqueDoc, { tipo: "parrafo" }>).tramos).toEqual([]);
    expect(TIPOS_PLANTILLA).toHaveLength(7);
  });
});
describe("validarPayloadBorrador · nada se ejecuta sin validar", () => {
  it("acepta las tres partes y devuelve el estilo con su lista blanca", () => {
    const estilo = validarPayloadBorrador({ parte: "estilo", estilo: { fuente: "mono", tamano: 9, color: "javascript:alert(1)" } });
    expect(estilo.ok).toBe(true);
    if (estilo.ok) expect(estilo.payload).toEqual({ parte: "estilo", estilo: { fuente: "mono", tamano: 11 } });
    expect(validarPayloadBorrador({ parte: "plantilla", bloques: ["titulo", "lista", "tareas"] }))
      .toEqual({ ok: true, payload: { parte: "plantilla", bloques: ["titulo", "lista", "tareas"] } });
    expect(validarPayloadBorrador({ parte: "decoracion", decoracion: { fondo: "cosmos", animacionFondo: "aurora" } }).ok).toBe(true);
  });
  it("rechaza texto, cuerpo, doc, lienzo y destinatarios JAMÁS", () => {
    for (const [extra, valor] of [["texto", "hola"], ["body", "hola"], ["doc", { bloques: [] }], ["destinatarios", ["alguien"]], ["adjuntos", []]] as const) {
      const r = validarPayloadBorrador({ parte: "estilo", estilo: ESTILO, [extra]: valor });
      expect(r.ok, extra).toBe(false);
      if (!r.ok) expect(r.motivos.join(" "), extra).toContain("nunca lleva texto ni destinatarios");
    }
    const plantilla = validarPayloadBorrador({ parte: "plantilla", bloques: ["titulo", { tipo: "parrafo", tramos: [{ texto: "otro post" }] }] });
    expect(plantilla.ok).toBe(false);
    if (!plantilla.ok) expect(plantilla.motivos.join(" ")).toContain("nunca texto");
  });
  it("rechaza partes desconocidas, estilos vacíos, plantillas raras y decoraciones que no lo son", () => {
    for (const payload of [
      { parte: "interfaz" }, "estilo", null, [], { parte: "estilo" },
      { parte: "estilo", estilo: {} }, { parte: "estilo", estilo: "mono" },
      { parte: "plantilla", bloques: [] }, { parte: "plantilla", bloques: ["video", "audio"] },
      { parte: "decoracion", decoracion: { fuente: "mono" } }, { parte: "decoracion", decoracion: "cristal" },
    ]) expect(validarPayloadBorrador(payload).ok).toBe(false);
  });
});
describe("adaptador post/mensaje · capturar, aplicar y deshacer sobre el borrador inyectado", () => {
  it("captura estilo, plantilla y decoración; nulo si el borrador no trae nada o la familia es otra", () => {
    const ed = editorFalso();
    const a = crearAdaptadorBorrador("post", ed.borrador);
    expect(a.familia).toBe("post");
    expect(a.capturar("post:x#estilo")).toBeNull();
    ed.borrador.escribirEstilo(ESTILO);
    ed.borrador.insertarAndamios([andamioDeBloque("titulo"), andamioDeBloque("separador")]);
    expect(a.capturar("post:x#estilo")).toEqual({ parte: "estilo", estilo: ESTILO });
    expect(a.capturar("post:x#plantilla")).toEqual({ parte: "plantilla", bloques: ["titulo", "separador"] });
    expect(a.capturar("post:x#decoracion")).toBeNull(); // ESTILO no lleva marco ni fondo
    ed.borrador.escribirEstilo({ ...ESTILO, fondo: "zenith" });
    expect(crearAdaptadorBorrador("mensaje", ed.borrador).capturar("post:x#estilo")).toBeNull();
    expect(a.capturar("post:x#decoracion")).toEqual({ parte: "decoracion", decoracion: { fondo: "zenith" } });
  });
  it("aplica estilo reemplazando, la plantilla inserta andamios (nunca texto) y deshacer restaura", () => {
    const ed = editorFalso();
    const a = crearAdaptadorBorrador("mensaje", ed.borrador);
    ed.borrador.escribirEstilo({ cursiva: true });
    a.aplicar("mensaje:editor#estilo", { parte: "estilo", estilo: { fuente: "serif", tamano: 31 } }).deshacer();
    expect(ed.ver().estilo).toEqual({ cursiva: true });
    a.aplicar("mensaje:editor#plantilla", { parte: "plantilla", bloques: ["tareas", "cita"] });
    expect(ed.inserciones[0]).toEqual([
      { tipo: "tareas", items: [{ hecha: false, tramos: [] }] }, { tipo: "cita", tramos: [] },
    ]);    expect(ed.ver().tipos).toEqual(["tareas", "cita"]);
    a.aplicar("mensaje:editor#plantilla", { parte: "plantilla", bloques: ["parrafo"] }).deshacer();
    expect(ed.ver().tipos).toEqual(["tareas", "cita", "parrafo"]);
  });
  it("la decoración se funde con el estilo y su deshacer restaura; sin validar nada corre y registrar deja la familia", () => {
    const ed = editorFalso();
    const a = crearAdaptadorBorrador("post", ed.borrador);
    ed.borrador.escribirEstilo({ fuente: "redonda", color: "#39FF14" });
    const deshacer = a.aplicar("post:x#decoracion", { parte: "decoracion", decoracion: { colorMarco: "#7C5CFF", grosorMarco: 3 } });
    expect(ed.ver().estilo).toEqual({ fuente: "redonda", color: "#39FF14", colorMarco: "#7C5CFF", grosorMarco: 3 });
    deshacer.deshacer();
    expect(ed.ver().estilo).toEqual({ fuente: "redonda", color: "#39FF14" });
    const rechazado = { parte: "estilo", estilo: ESTILO, texto: "contenido del post" } as unknown as Parameters<typeof a.aplicar>[1];
    expect(() => a.aplicar("post:x#estilo", rechazado)).toThrow("rechazada");
    expect(ed.escrituras).toHaveLength(2);
    expect(a.validar({ parte: "estilo", estilo: ESTILO }).ok).toBe(true);
    __resetRegistros();
    registrarAdaptadorBorrador("post", ed.borrador);
    registrarAdaptadorBorrador("mensaje", ed.borrador);
    for (const f of ["post", "mensaje"]) expect(adaptadorDe(`${f}:x#estilo`), f).not.toBeNull();
    expect(adaptadorDe("tema:x#estilo")).toBeNull();
  });
});
