/**
 * La marca «Bot de IA» (Ola 1025U · U3): cómo se escribe al publicar (`marcarComoBot`) y cómo se reconoce al leer
 * (`esAutorBot`). La etiqueta sale de un dato real del autor, no de la tarjeta.
 */
import { describe, expect, it } from "vitest";
import { crearAgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import { splitBodyAttachments } from "@/lib/social-posts";
import {
  esAutorBot, esMarcaBot, leerMarcaDeCuerpo, marcaBotDe, marcaDeAgente, marcarComoBot, marcarCuerpo, normalizarMarca,
} from "../marca-bot";

const AURORA = crearAgenteMundoRef({
  origen: "personalidad", idOrigen: "aurora", nombre: "Aurora", dueno: { tipo: "cuenta", id: "cuenta-1" },
});
const BOT_DEL_GRUPO = crearAgenteMundoRef({
  origen: "bot", idOrigen: "guardian", nombre: "Guardián del huerto", dueno: { tipo: "grupo", id: "huerto" },
});

describe("esAutorBot: reconoce al bot por un dato real", () => {
  it("una persona NO es un bot", () => {
    expect(esAutorBot({ id: "u1", name: "Ana", handle: "@ana", avatar: "" })).toBe(false);
    expect(esAutorBot({ id: "u1", display_name: "Ana", handle: "ana" })).toBe(false);
    expect(esAutorBot(null)).toBe(false);
    expect(esAutorBot(undefined)).toBe(false);
    expect(esAutorBot("bot")).toBe(false);
    expect(esAutorBot(42)).toBe(false);
  });

  it("reconoce un AgenteMundoRef", () => {
    expect(esAutorBot(AURORA)).toBe(true);
    expect(marcaBotDe(AURORA)).toMatchObject({ agenteId: "personalidad:aurora", nombre: "Aurora", origen: "personalidad" });
  });

  it("reconoce una marca ya escrita", () => {
    expect(esAutorBot(marcaDeAgente(BOT_DEL_GRUPO))).toBe(true);
  });

  it("reconoce un perfil marcado como bot por los nombres habituales", () => {
    expect(esAutorBot({ id: "p1", esBotIA: true, name: "Soy bot" })).toBe(true);
    expect(esAutorBot({ id: "p1", is_bot: true })).toBe(true);
    expect(esAutorBot({ id: "p1", isBot: true })).toBe(true);
    expect(esAutorBot({ id: "p1", kind: "bot" })).toBe(true);
    expect(esAutorBot({ id: "p1", profile_kind: "bot" })).toBe(true);
  });

  it("lo busca dentro de author, post_references, content y autorBot (publicaciones y comentarios)", () => {
    const marca = marcaDeAgente(AURORA);
    expect(esAutorBot({ author: { name: "x", bot: marca } })).toBe(true);
    expect(esAutorBot({ post_references: { parent: "p1", bot: marca } })).toBe(true);
    expect(esAutorBot({ content: { text: "hola", bot: marca } })).toBe(true);
    expect(esAutorBot({ autorBot: marca })).toBe(true);
    expect(esAutorBot({ post_references: { parent: "p1" }, content: { text: "hola" } })).toBe(false);
  });

  it("el bloqueo identifica al AGENTE, no a la cuenta de la persona que lo dueña", () => {
    const m = marcaBotDe({ author: { id: "uid-de-la-persona", bot: marcaDeAgente(AURORA) } });
    expect(m?.agenteId).toBe("personalidad:aurora");
  });
});

describe("normalizarMarca: lo de fuera no se cree", () => {
  it("exige esBotIA verdadero y un agenteId válido", () => {
    expect(normalizarMarca({ esBotIA: false, agenteId: "bot:x", nombre: "X" })).toBeNull();
    expect(normalizarMarca({ esBotIA: true, agenteId: "con espacios", nombre: "X" })).toBeNull();
    expect(normalizarMarca({ esBotIA: true, nombre: "X" })).toBeNull();
    expect(esMarcaBot({ esBotIA: true, agenteId: "bot:x" })).toBe(true);
  });

  it("recorta el nombre, pone uno por defecto y descarta un dueño inválido", () => {
    const m = normalizarMarca({ esBotIA: true, agenteId: "bot:x", nombre: "N".repeat(300), dueno: { tipo: "planeta", id: "x" } });
    expect(m?.nombre).toHaveLength(80);
    expect(m?.dueno).toBeUndefined();
    expect(normalizarMarca({ esBotIA: true, agenteId: "bot:x" })?.nombre).toBe("Bot de IA");
  });
});

describe("marcarComoBot: la única puerta de escritura", () => {
  it("un texto sale marcado y se lee de vuelta con el texto limpio", () => {
    const marcado = marcarComoBot("Hola a todas", AURORA);
    expect(marcado).toContain("<!--ss:meta");
    const { cuerpo, marca } = leerMarcaDeCuerpo(marcado);
    expect(cuerpo).toBe("Hola a todas");
    expect(marca).toMatchObject({ esBotIA: true, agenteId: "personalidad:aurora", nombre: "Aurora" });
  });

  it("un objeto (content o post_references) sale con `bot` y el original no se toca", () => {
    const original = { parent: "p1" };
    const marcado = marcarComoBot(original, BOT_DEL_GRUPO);
    expect(marcado.bot).toMatchObject({ agenteId: "bot:guardian", dueno: { tipo: "grupo", id: "huerto" } });
    expect(marcado.parent).toBe("p1");
    expect(original).toEqual({ parent: "p1" });
    expect(esAutorBot({ post_references: marcado })).toBe(true);
  });

  it("fusiona con el ss:meta que ya tuviera la publicación y no lo duplica al marcar dos veces", () => {
    const previo = 'Mira esto\n<!--ss:meta {"tags":["huerto"]}-->';
    const una = marcarCuerpo(previo, AURORA);
    const dos = marcarCuerpo(una, AURORA);
    expect(dos.match(/<!--ss:meta/g)).toHaveLength(1);
    const json = JSON.parse(/<!--ss:meta\s+([\s\S]*?)-->/.exec(dos)![1]);
    expect(json.tags).toEqual(["huerto"]);
    expect(json.bot.agenteId).toBe("personalidad:aurora");
  });

  it("un nombre con `-->` o `<` no rompe el comentario ni abre HTML", () => {
    const raro = crearAgenteMundoRef({
      origen: "bot", idOrigen: "raro", nombre: 'X --> <img src=x onerror=alert(1)>', dueno: { tipo: "perfil", id: "p" },
    });
    const marcado = marcarComoBot("texto", raro);
    expect(marcado.match(/-->/g)).toHaveLength(1);
    expect(marcado).not.toContain("<img");
    expect(leerMarcaDeCuerpo(marcado).marca?.nombre).toContain("onerror");
  });

  it("un texto sin marca se lee como persona (retrocompatible)", () => {
    expect(leerMarcaDeCuerpo("Hola")).toEqual({ cuerpo: "Hola", marca: null });
    expect(leerMarcaDeCuerpo("Hola <!--ss:meta {roto-->").marca).toBeNull();
  });
});

describe("la marca llega a la tarjeta por el lector que ya existe", () => {
  it("splitBodyAttachments saca la marca del cuerpo de una publicación de un agente", () => {
    const r = splitBodyAttachments(marcarComoBot("Buenos días, huerto", BOT_DEL_GRUPO));
    expect(r.body).toBe("Buenos días, huerto");
    expect(r.bot).toMatchObject({ agenteId: "bot:guardian", nombre: "Guardián del huerto" });
    expect(splitBodyAttachments("Hola de una persona").bot).toBeNull();
  });
});
