import { describe, it, expect, beforeEach } from "vitest";
import {
  crearAdaptadoresContenido, registrarAdaptadoresContenido, validarPayloadContenido,
  type BorradorContenido, type FamiliaContenido, type PuertoBorrador,
} from "../publicaciones";
import { adaptadorDe, familiasRegistradas, __resetRegistros } from "../../familias";
import type { DocRico } from "@/lib/mensajeria/formato-tipos";

type BorradorConDestinos = BorradorContenido & { destinatarios: string[] };

function puertoFalso(inicial: Partial<Record<FamiliaContenido, BorradorConDestinos>> = {}) {
  const datos: Partial<Record<FamiliaContenido, BorradorConDestinos>> = { ...inicial };
  const puerto: PuertoBorrador = {
    leer: (familia) => datos[familia] ?? null,
    guardar: (familia, borrador) => { datos[familia] = borrador as BorradorConDestinos; },
  };
  return { puerto, datos };
}

function docPrivado(): DocRico {
  return {
    bloques: [
      { tipo: "titulo", nivel: 1, tramos: [{ texto: "Mi texto secreto" }] },
      { tipo: "lista", ordenada: true, items: [[{ texto: "Primero" }], [{ texto: "Segundo" }]] },
      { tipo: "cita", tramos: [{ texto: "Una cita privada" }] },
    ],
  };
}

function borrador(extra: Partial<BorradorConDestinos> = {}): BorradorConDestinos {
  return {
    estilo: {
      fuente: "outfit", tamano: 18, color: "#7C5CFF", negrita: true, fondo: "violeta",
      colorMarco: "#10B981", animacionTexto: "ola", formato: "articulo", ratio: "4:5",
      mostrarVistaPrevia: false,
    },
    doc: docPrivado(), lienzo: { ancho: 540, alto: 675 },
    destinatarios: ["persona-privada"],
    ...extra,
  };
}

beforeEach(() => { __resetRegistros(); });

describe("publicaciones y mensajes · variaciones de estilo y plantilla", () => {
  it("captura solo los campos de la familia y nunca el texto ni los destinatarios", () => {
    const { puerto } = puertoFalso({ post: borrador(), mensaje: borrador() });
    const [post, mensaje] = crearAdaptadoresContenido(puerto);
    const estiloPost = post.capturar("post:abc#estilo");
    expect(estiloPost).toEqual({ formato: "articulo", ratio: "4:5", mostrarVistaPrevia: false });
    const estiloMensaje = mensaje.capturar("mensaje:editor#estilo");
    expect(estiloMensaje).toEqual({ fuente: "outfit", tamano: 18, color: "#7C5CFF", negrita: true });
    for (const payload of [estiloPost, estiloMensaje]) {
      const bruto = JSON.stringify(payload);
      expect(bruto).not.toContain("secreto");
      expect(bruto).not.toContain("persona-privada");
    }
  });

  it("captura la decoración por su parte y la plantilla como esqueleto sin letras", () => {
    const { puerto } = puertoFalso({ mensaje: borrador() });
    const mensaje = crearAdaptadoresContenido(puerto)[1];
    expect(mensaje.capturar("mensaje:editor#decoracion")).toEqual({
      colorMarco: "#10B981", fondo: "violeta", animacionTexto: "ola",
    });
    const plantilla = mensaje.capturar("mensaje:editor#plantilla");
    expect(plantilla).toEqual({
      bloques: [{ tipo: "titulo", nivel: 1 }, { tipo: "lista", ordenada: true }, { tipo: "cita" }],
      lienzo: "vertical",
    });
    expect(JSON.stringify(plantilla)).not.toContain("secreto");
  });

  it("exige una parte válida y la familia de la clave", () => {
    const { puerto } = puertoFalso({ post: borrador() });
    const [post] = crearAdaptadoresContenido(puerto);
    expect(post.capturar("post:abc")).toBeNull();
    expect(post.capturar("post:abc#fondo")).toBeNull();
    expect(post.capturar("mensaje:abc#estilo")).toBeNull();
    expect(post.capturar("clave-invalida")).toBeNull();
  });

  it("rechaza texto, destinatarios, claves ajenas, valores fuera de vocabulario y código", () => {
    for (const malo of [
      { texto: "hola" },
      { destinatarios: ["ana"] },
      { body: "mi publicación" },
      { fuente: "comic-sans" },
      { tamano: 200 },
      { fondo: "url(https://x.test)" },
      { ratio: "3:7" },
      { formato: "con espacios" },
      { bloques: [{ tipo: "parrafo", texto: "hola" }] },
      { bloques: [{ tipo: "inventado" }] },
      { lienzo: "gigante" },
      { html: "<b>hola</b>" },
    ]) {
      const r = validarPayloadContenido(malo);
      expect(r.ok, JSON.stringify(malo)).toBe(false);
    }
    expect(validarPayloadContenido({ fuente: "outfit", tamano: 18 }).ok).toBe(true);
    expect(validarPayloadContenido({ bloques: [{ tipo: "titulo", nivel: 2 }], lienzo: "historia" }).ok).toBe(true);
  });

  it("aplica sobre el borrador actual y deshacer devuelve el estado anterior", () => {
    const { puerto, datos } = puertoFalso({ post: borrador() });
    const [post] = crearAdaptadoresContenido(puerto);
    const aplicado = post.aplicar("post:abc#estilo", { formato: "propuesta", ratio: "16:9", mostrarVistaPrevia: true });
    expect(datos.post?.estilo).toMatchObject({ formato: "propuesta", ratio: "16:9", mostrarVistaPrevia: true, color: "#7C5CFF" });
    expect(datos.post?.destinatarios).toEqual(["persona-privada"]);
    aplicado.deshacer();
    expect(datos.post?.estilo).toMatchObject({ formato: "articulo", ratio: "4:5", mostrarVistaPrevia: false });
    expect(datos.post?.doc?.bloques[0]).toMatchObject({ tipo: "titulo" });
  });

  it("una plantilla cambia la forma de los bloques y conserva todo el texto", () => {
    const { puerto, datos } = puertoFalso({ mensaje: borrador() });
    const mensaje = crearAdaptadoresContenido(puerto)[1];
    expect(() => mensaje.aplicar("mensaje:editor#estilo", { formato: "articulo" })).toThrow("rechazada");
    const aplicado = mensaje.aplicar("mensaje:editor#plantilla", {
      bloques: [{ tipo: "parrafo" }, { tipo: "titulo", nivel: 2 }], lienzo: "cuadrado",
    });
    const bloques = datos.mensaje?.doc?.bloques ?? [];
    expect(bloques[0]).toMatchObject({ tipo: "parrafo", tramos: [{ texto: "Mi texto secreto" }] });
    expect(bloques[1]).toMatchObject({ tipo: "titulo", nivel: 2, tramos: [{ texto: "Primero" }] });
    expect(datos.mensaje?.lienzo).toEqual({ ancho: 540, alto: 540 });
    expect(datos.mensaje?.estilo?.fuente).toBe("outfit");
    aplicado.deshacer();
    expect(datos.mensaje?.doc?.bloques[0]).toMatchObject({ tipo: "titulo", nivel: 1 });
    expect(datos.mensaje?.lienzo).toEqual({ ancho: 540, alto: 675 });
  });

  it("no aplica una plantilla vacía ni una clave sin parte", () => {
    const { puerto } = puertoFalso({ mensaje: borrador() });
    const mensaje = crearAdaptadoresContenido(puerto)[1];
    expect(() => mensaje.aplicar("mensaje:editor#plantilla", { bloques: [] })).toThrow("rechazada");
    expect(() => mensaje.aplicar("mensaje:editor", { fuente: "outfit" })).toThrow("parte");
  });

  it("registra las familias post y mensaje en el registro común", () => {
    registrarAdaptadoresContenido(puertoFalso().puerto);
    expect(familiasRegistradas().sort()).toEqual(["mensaje", "post"]);
    expect(adaptadorDe("post:x#estilo")?.familia).toBe("post");
    expect(adaptadorDe("mensaje:x#decoracion")?.familia).toBe("mensaje");
  });
});
