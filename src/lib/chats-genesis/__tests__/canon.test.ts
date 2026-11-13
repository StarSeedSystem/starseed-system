/**
 * GEN1114E · catálogo de chats canónicos y `nombreDeChat` (contrato GEN1114 §2.3, §2.4, §3.4 y §5.1),
 * con el `canon.json` de ejemplo compartido de §8.3 (sin `refs` ni `versiones`, como lo sirve la puerta).
 */
import { describe, expect, it, vi } from "vitest";
import {
    ALIAS_GEN1113,
    CLAVE_CANON_LOCAL,
    catalogoValido,
    chatDeFuente,
    chatParaFirmar,
    crearClienteCanon,
    leerCopiaCanon,
    limpiarNombre,
    nombreDeChat,
    type CatalogoCanon,
} from "../canon";
import { DESTINO_DE_FUENTE } from "../alias-gen1113";
import type { FetchLike } from "../puerta-chats";
import type { PuertaA1 } from "@/lib/datos/puerta-a1";

/** El canon.json de ejemplo de §8.3, tal cual. */
const EJEMPLO = {
    v: 2, version: 1, actualizado: "2026-11-13T00:00:00Z", chats: [
        { v: 2, id: "genesis", nombre: "GENESIS · StarSeed OS", nombreProvisional: false, tipo: "direccion", fuente: "direccion", alias: ["direccion", "mando"], medios: [], version: 1, actualizado: "2026-11-13T00:00:00Z", refs: [], versiones: {} },
        { v: 2, id: "genesis.canal.hermes", nombre: "Hermes", nombreProvisional: false, tipo: "canal-director", padre: "genesis", fuente: null, alias: [], medios: [], version: 1, actualizado: "2026-11-13T00:00:00Z", refs: [], versiones: {} },
        { v: 2, id: "telegram.ejemplo_a_bot", nombre: "Bot A de ejemplo", nombreProvisional: false, tipo: "puente-telegram", fuente: "puente:hermes-avisos", alias: ["puente:hermes-avisos", "hermes-avisos", "Hermes y avisos"], medios: [], version: 1, actualizado: "2026-11-13T00:00:00Z", refs: [], versiones: {} },
        { v: 2, id: "telegram.ejemplo_b_bot", nombre: "Bot B de ejemplo", nombreProvisional: false, tipo: "puente-telegram", fuente: "puente:peticiones", alias: ["puente:peticiones", "peticiones", "Peticiones y encargos"], medios: [], version: 1, actualizado: "2026-11-13T00:00:00Z", refs: [], versiones: {} },
        { v: 2, id: "telegram.ejemplo_c_bot", nombre: "Bot C de ejemplo", nombreProvisional: false, tipo: "puente-telegram", fuente: "puente:avisos-directores", alias: ["puente:avisos-directores", "avisos-directores", "Avisos de los directores"], medios: [], version: 1, actualizado: "2026-11-13T00:00:00Z", refs: [], versiones: {} },
    ],
};
const catalogo = () => ({ ...JSON.parse(JSON.stringify(EJEMPLO)), t: "2026-11-13T00:00:00Z" });
const cat = catalogoValido(catalogo()) as CatalogoCanon;

describe("catalogoValido", () => {
    it("acepta el ejemplo compartido y deja fuera refs, versiones y lo que no es del catálogo público", () => {
        expect(cat).not.toBeNull();
        expect(cat.chats.map((c) => c.id)).toEqual(["genesis", "genesis.canal.hermes", "telegram.ejemplo_a_bot", "telegram.ejemplo_b_bot", "telegram.ejemplo_c_bot"]);
        expect(JSON.stringify(cat)).not.toContain("refs");
        expect(JSON.stringify(cat)).not.toContain("versiones");
        expect(cat.chats[1].padre).toBe("genesis");
    });

    it("tolera basura: nunca lanza, quita los chats rotos", () => {
        for (const x of [null, undefined, 1, "x", [], {}, { v: 1, chats: [] }, { v: 2 }, { v: 2, chats: "no" }]) {
            expect(() => catalogoValido(x)).not.toThrow();
            expect(catalogoValido(x)).toBeNull();
        }
        const trampa = Object.defineProperty({ v: 2 }, "chats", { get: () => { throw new Error("boom"); } });
        expect(catalogoValido(trampa)).toBeNull();
        const c = catalogo();
        c.chats.push("basura", { id: "MAL ID", nombre: "x", tipo: "direccion" }, { id: "ok.sin-nombre", nombre: "‮", tipo: "astraura" }, { id: "x.tipo", nombre: "x", tipo: "otro" });
        expect(catalogoValido(c)!.chats).toHaveLength(5);
    });

    it("descarta el catálogo entero con un id repetido", () => {
        const c = catalogo();
        c.chats.push({ ...c.chats[2], alias: [] });
        expect(catalogoValido(c)).toBeNull();
    });

    it("descarta el catálogo con el alias puente:hermes-avisos repetido en el chat del puente B", () => {
        const c = catalogo();
        c.chats[3].alias.push("puente:hermes-avisos");
        expect(catalogoValido(c)).toBeNull();
    });

    it("descarta el catálogo si un alias de un chat es el id o el nombre de otro", () => {
        const c1 = catalogo();
        c1.chats[3].alias.push("telegram.ejemplo_a_bot");
        expect(catalogoValido(c1)).toBeNull();
        const c2 = catalogo();
        c2.chats[3].alias.push("Bot A de ejemplo");
        expect(catalogoValido(c2)).toBeNull();
    });

    it("limpia controles y marcas bidi en los nombres; recorta a 80; lo que no diga «no provisional» es provisional", () => {
        const c = catalogo();
        c.chats[2].nombre = "Bot‮ A\u0007 de‏ ejemplo";
        delete c.chats[3].nombreProvisional;
        c.chats[4].nombre = "x".repeat(100);
        const v = catalogoValido(c)!;
        expect(v.chats[2].nombre).toBe("Bot A de ejemplo");
        expect(v.chats[3].nombreProvisional).toBe(true);
        expect(v.chats[4].nombre).toHaveLength(80);
        expect(limpiarNombre("  ⁦hola⁩  ")).toBe("hola");
    });
});

describe("chatDeFuente · la relación fija fuente → chat", () => {
    it("cada fuente da su chat", () => {
        expect(chatDeFuente(cat, "direccion")?.id).toBe("genesis");
        expect(chatDeFuente(cat, "puente:hermes-avisos")?.id).toBe("telegram.ejemplo_a_bot");
        expect(chatDeFuente(cat, "puente:peticiones")?.id).toBe("telegram.ejemplo_b_bot");
        expect(chatDeFuente(cat, "puente:avisos-directores")?.id).toBe("telegram.ejemplo_c_bot");
        expect(chatDeFuente(null, "direccion")).toBeNull();
    });

    it("si el alias fijo se movió al chat del puente B, el puente A no tiene chat (null, nombre provisional)", () => {
        const c = catalogo();
        c.chats[2].alias = ["hermes-avisos"];
        c.chats[3].alias.push("puente:hermes-avisos");
        const v = catalogoValido(c)!;
        expect(v).not.toBeNull();
        expect(chatDeFuente(v, "puente:hermes-avisos")).toBeNull();
        // GEN1114INT: el id provisional del esquema común (la Mac decide con su canon.json si cuadra).
        expect(nombreDeChat(v, "puente:hermes-avisos")).toEqual({ nombre: "Hermes y avisos", id: "telegram.hermes-avisos", provisional: true });
        expect(chatParaFirmar(v, "puente:hermes-avisos")).toEqual({ id: "telegram.hermes-avisos", nombre: "Hermes y avisos", provisional: true });
    });

    it("un puente con un id que no es telegram.* o la dirección con otro id: null", () => {
        const c = catalogo();
        c.chats[2].id = "otro.chat";
        c.chats[0].id = "otra-direccion";
        const v = catalogoValido(c)!;
        expect(chatDeFuente(v, "puente:hermes-avisos")).toBeNull();
        expect(chatDeFuente(v, "direccion")).toBeNull();
    });
});

describe("nombreDeChat · la única función que da nombre", () => {
    it("resuelve id, alias de GEN1113 y fuente", () => {
        expect(nombreDeChat(cat, "telegram.ejemplo_a_bot")).toEqual({ nombre: "Bot A de ejemplo", id: "telegram.ejemplo_a_bot", provisional: false });
        for (const k of ["puente:hermes-avisos", "hermes-avisos", "Hermes y avisos"]) expect(nombreDeChat(cat, k)).toEqual({ nombre: "Bot A de ejemplo", id: "telegram.ejemplo_a_bot", provisional: false });
        for (const k of ["direccion", "mando", "genesis"]) expect(nombreDeChat(cat, k)).toEqual({ nombre: "GENESIS · StarSeed OS", id: "genesis", provisional: false });
        expect(nombreDeChat(cat, "genesis.canal.hermes")).toEqual({ nombre: "Hermes", id: "genesis.canal.hermes", provisional: false });
        expect(nombreDeChat(cat, "Peticiones y encargos").nombre).toBe("Bot B de ejemplo");
    });

    it("sin catálogo: la etiqueta de GEN1113, provisional", () => {
        expect(nombreDeChat(null, "puente:hermes-avisos")).toEqual({ nombre: "Hermes y avisos", id: "telegram.hermes-avisos", provisional: true });
        expect(nombreDeChat(null, "peticiones")).toEqual({ nombre: "Peticiones y encargos", id: "telegram.peticiones", provisional: true });
        expect(nombreDeChat(null, "avisos-directores")).toEqual({ nombre: "Avisos de los directores", id: "telegram.avisos-directores", provisional: true });
        expect(nombreDeChat(null, "direccion")).toEqual({ nombre: "GENESIS · StarSeed OS", id: "genesis", provisional: true });
        expect(nombreDeChat(null, "genesis.canal.director-presidente")).toEqual({ nombre: "Director presidente", id: "genesis.canal.director-presidente", provisional: true });
        expect(nombreDeChat(null, "desconocido")).toEqual({ nombre: "desconocido", id: null, provisional: true });
        expect(nombreDeChat(null, "")).toMatchObject({ provisional: true });
    });

    it("un catálogo de la puerta que pone en el chat B el nombre del A no cambia a dónde lleva la fuente", () => {
        const c = catalogo();
        c.chats[3].nombre = "Bot A de ejemplo"; // nombre falso (permitido: los nombres pueden repetirse)
        const v = catalogoValido(c)!;
        expect(nombreDeChat(v, "puente:hermes-avisos").id).toBe("telegram.ejemplo_a_bot");
        expect(nombreDeChat(v, "puente:peticiones").id).toBe("telegram.ejemplo_b_bot");
    });

    it("las etiquetas de GEN1113 viven solo como alias y la descripción del destino es fija", () => {
        expect(Object.keys(ALIAS_GEN1113)).toEqual(["direccion", "puente:hermes-avisos", "puente:peticiones", "puente:avisos-directores"]);
        expect(DESTINO_DE_FUENTE["puente:hermes-avisos"]).toBe("Hermes, que puede usar herramientas en tu Mac");
    });
});

describe("chatParaFirmar", () => {
    it("con catálogo: el chat de la fuente o del canal; sin él: la dirección provisional y ningún puente", () => {
        expect(chatParaFirmar(cat, "puente:hermes-avisos")).toEqual({ id: "telegram.ejemplo_a_bot", nombre: "Bot A de ejemplo", provisional: false });
        expect(chatParaFirmar(cat, "direccion")).toEqual({ id: "genesis", nombre: "GENESIS · StarSeed OS", provisional: false });
        expect(chatParaFirmar(cat, "direccion", "hermes")).toEqual({ id: "genesis.canal.hermes", nombre: "Hermes", provisional: false });
        expect(chatParaFirmar(cat, "direccion", "mando")).toEqual({ id: "genesis", nombre: "GENESIS · StarSeed OS", provisional: false });
        expect(chatParaFirmar(null, "direccion")).toEqual({ id: "genesis", nombre: "GENESIS · StarSeed OS", provisional: true });
        expect(chatParaFirmar(null, "direccion", "chatgpt")).toEqual({ id: "genesis.canal.chatgpt", nombre: "ChatGPT (Codex)", provisional: true });
        // GEN1114INT · un solo esquema: sin catálogo, el id provisional `telegram.<clave>` y la etiqueta que se ve.
        expect(chatParaFirmar(null, "puente:hermes-avisos")).toEqual({ id: "telegram.hermes-avisos", nombre: "Hermes y avisos", provisional: true });
        expect(chatParaFirmar(null, "puente:peticiones")).toEqual({ id: "telegram.peticiones", nombre: "Peticiones y encargos", provisional: true });
    });
});

describe("crearClienteCanon", () => {
    function almacen() {
        const datos = new Map<string, string>();
        return { datos, getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => void datos.set(k, v), removeItem: (k: string) => void datos.delete(k) };
    }
    const puerta = { modo: () => "auto", configurada: async () => true, operar: vi.fn() } as unknown as PuertaA1;
    const respuesta = (estado: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status: estado });

    it("lee con la sesión, sin cola, guarda la copia; si la puerta dice null, borra la copia", async () => {
        const a = almacen();
        let devolver: unknown = { catalogo: catalogo() };
        const fetch = vi.fn<FetchLike>(async () => respuesta(200, devolver));
        const c = crearClienteCanon({ puerta, fetch, almacen: a, url: async () => "https://puerta.prueba", sesion: async () => "jwt" });
        const r = await c.leer();
        expect(r).toMatchObject({ ok: true });
        expect((r as { catalogo: CatalogoCanon }).catalogo.chats).toHaveLength(5);
        expect(fetch.mock.calls[0][0]).toBe("https://puerta.prueba/v1/genesis/chats/canon");
        expect(fetch.mock.calls[0][1]).toMatchObject({ method: "GET", credentials: "omit" });
        expect((fetch.mock.calls[0][1]!.headers as Record<string, string>).authorization).toBe("Bearer jwt");
        expect(leerCopiaCanon(a)?.catalogo.chats).toHaveLength(5);
        expect(puerta.operar).not.toHaveBeenCalled();
        devolver = { catalogo: null };
        expect(await c.leer()).toEqual({ ok: true, catalogo: null });
        expect(a.datos.has(CLAVE_CANON_LOCAL)).toBe(false);
    });

    it("si falla, devuelve la copia; un catálogo inválido no pisa la copia", async () => {
        const a = almacen();
        a.setItem(CLAVE_CANON_LOCAL, JSON.stringify({ catalogo: catalogo(), en: 1 }));
        const caida = crearClienteCanon({ puerta, almacen: a, fetch: async () => { throw new TypeError("Failed to fetch"); }, url: async () => "https://p.x", sesion: async () => "jwt" });
        const r = await caida.leer();
        expect(r).toMatchObject({ ok: false, estado: 0 });
        expect((r as { copia: CatalogoCanon }).copia.chats).toHaveLength(5);
        const mala = crearClienteCanon({ puerta, almacen: a, fetch: async () => respuesta(200, { catalogo: { v: 2, chats: [EJEMPLO.chats[0], EJEMPLO.chats[0]] } }), url: async () => "https://p.x", sesion: async () => "jwt" });
        expect(await mala.leer()).toMatchObject({ ok: false });
        expect(leerCopiaCanon(a)?.catalogo.chats).toHaveLength(5);
        const sinSesion = crearClienteCanon({ puerta, almacen: a, fetch: vi.fn(), url: async () => "https://p.x", sesion: async () => null });
        expect(await sinSesion.leer()).toMatchObject({ ok: false, estado: 401 });
        expect(leerCopiaCanon(null)).toBeNull();
    });
});
