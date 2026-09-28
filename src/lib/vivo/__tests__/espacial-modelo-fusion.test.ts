import { describe, expect, it } from "vitest";
import {
    crearObjeto,
    docVacio,
    lapida,
    LIMITE_OBJETOS,
    sanearDoc,
    sanearObjeto,
    siguienteMarca,
    urlHttpsSegura,
    type DocEscena,
    type ObjetoEscena,
} from "@/lib/vivo/espacial/modelo";
import { aplicarObjetos, diferenciaSobre, fusionarDocs, ganaObjeto, podarLapidas } from "@/lib/vivo/espacial/fusion";

function obj(id: string, actualizado: number, por = "a", extra: Partial<ObjetoEscena> = {}): ObjetoEscena {
    const o = sanearObjeto({ ...crearObjeto("caja", {}, { actualizado, por, id }), ...extra, id, actualizado, por });
    if (!o) throw new Error("objeto inválido en la prueba");
    return o;
}

function doc(...objs: ObjetoEscena[]): DocEscena {
    return aplicarObjetos(docVacio(), objs).doc;
}

describe("modelo · saneado", () => {
    it("solo admite direcciones https sin credenciales", () => {
        expect(urlHttpsSegura("https://ejemplo.org/m.glb")).toBe("https://ejemplo.org/m.glb");
        expect(urlHttpsSegura("http://ejemplo.org/m.glb")).toBeNull();
        expect(urlHttpsSegura("javascript:alert(1)")).toBeNull();
        expect(urlHttpsSegura("data:image/png;base64,AAAA")).toBeNull();
        expect(urlHttpsSegura("blob:https://x/1")).toBeNull();
        expect(urlHttpsSegura("https://usuario:clave@ejemplo.org/a.png")).toBeNull();
        expect(urlHttpsSegura("https://ejemplo.org/con espacio.png")).toBeNull();
    });

    it("acota números, colores y textos que llegan de fuera", () => {
        const o = sanearObjeto({
            id: "o_1",
            tipo: "texto",
            nombre: "  hola\u0000mundo ",
            pos: [1e9, -1e9, Number.NaN],
            rot: [0, 0, 0],
            esc: [0, 500, 1],
            material: { color: "red", metalico: 7, rugosidad: -1, emisivo: 9, opacidad: 0 },
            texto: "x".repeat(1000),
            actualizado: 5,
            por: "p",
        });
        expect(o).not.toBeNull();
        expect(o!.nombre).toBe("hola mundo");
        expect(o!.pos).toEqual([500, -500, 0]);
        expect(o!.esc).toEqual([0.01, 100, 1]);
        expect(o!.material).toMatchObject({ color: "#7C5CFF", metalico: 1, rugosidad: 0, emisivo: 2, opacidad: 0.05 });
        expect(o!.texto!.length).toBe(280);
    });

    it("descarta lo irrecuperable: tipo desconocido, sin marca o imagen sin https", () => {
        expect(sanearObjeto({ id: "a", tipo: "script", actualizado: 1 })).toBeNull();
        expect(sanearObjeto({ id: "a", tipo: "caja" })).toBeNull();
        expect(sanearObjeto({ id: "a", tipo: "imagen", url: "http://x.org/a.png", actualizado: 1 })).toBeNull();
        expect(sanearObjeto({ id: "a b", tipo: "caja", actualizado: 1 })).toBeNull();
    });

    it("una lápida pierde sus datos pero conserva lo necesario para ganar", () => {
        const l = sanearObjeto({ id: "o_2", tipo: "texto", texto: "secreto", borrado: true, actualizado: 9, por: "z" });
        expect(l).toEqual(lapida("o_2", "texto", 9, "z"));
        expect(l!.texto).toBeUndefined();
    });

    it("sanearDoc respeta el techo de objetos vivos y dice cuántos quedaron fuera", () => {
        const objetos: Record<string, unknown> = {};
        for (let i = 0; i < LIMITE_OBJETOS + 5; i++) objetos[`o_${i}`] = { id: `o_${i}`, tipo: "caja", actualizado: i, por: "a" };
        objetos.roto = { id: "roto", tipo: "nada", actualizado: 1 };
        const { doc: d, descartados } = sanearDoc({ objetos });
        expect(Object.keys(d.objetos).length).toBe(LIMITE_OBJETOS);
        expect(descartados).toBe(6);
        expect(d.objetos.o_0).toBeUndefined(); // se quedan los más recientes
    });

    it("crearObjeto exige https para imágenes y modelos", () => {
        expect(() => crearObjeto("modelo", { url: "ftp://x" }, { actualizado: 1, por: "a" })).toThrow(/https/);
        expect(crearObjeto("imagen", { url: "https://x.org/a.png" }, { actualizado: 1, por: "a" }).url).toBe("https://x.org/a.png");
    });

    it("el reloj híbrido nunca retrocede respecto a lo visto", () => {
        expect(siguienteMarca(1000, 5000)).toBe(5001);
        expect(siguienteMarca(9000, 5000)).toBe(9000);
    });
});

describe("fusión · LWW por objeto con lápidas", () => {
    it("gana la marca mayor; si empatan, el autor menor; si aún empatan, la lápida", () => {
        expect(ganaObjeto(obj("x", 2), obj("x", 1))).toBe(true);
        expect(ganaObjeto(obj("x", 1, "b"), obj("x", 1, "a"))).toBe(false);
        expect(ganaObjeto(lapida("x", "caja", 1, "a"), obj("x", 1, "a"))).toBe(true);
    });

    it("es conmutativa, asociativa e idempotente", () => {
        const a = doc(obj("1", 1, "a"), obj("2", 5, "a", { nombre: "A" }), obj("3", 3, "a"));
        const b = doc(obj("2", 5, "b", { nombre: "B" }), lapida("3", "caja", 4, "b"), obj("4", 2, "b"));
        const c = doc(obj("1", 7, "c", { nombre: "C" }), obj("4", 2, "a", { nombre: "A4" }));
        const ab = fusionarDocs(a, b);
        expect(fusionarDocs(b, a).objetos).toEqual(ab.objetos);
        expect(fusionarDocs(fusionarDocs(a, b), c).objetos).toEqual(fusionarDocs(a, fusionarDocs(b, c)).objetos);
        expect(fusionarDocs(ab, ab)).toBe(ab);
        expect(ab.objetos["2"].nombre).toBe("A"); // empate de marca: autor «a» < «b»
        expect(ab.objetos["3"].borrado).toBe(true); // la lápida más nueva gana
    });

    it("una lápida no resucita al fusionar con alguien que aún tenía el objeto", () => {
        const conLapida = doc(lapida("x", "caja", 10, "a"));
        const viejo = doc(obj("x", 3, "b"));
        expect(fusionarDocs(viejo, conLapida).objetos.x.borrado).toBe(true);
        expect(fusionarDocs(conLapida, viejo).objetos.x.borrado).toBe(true);
    });

    it("devuelve la MISMA referencia si lo que llega no aporta nada (snapshot estable)", () => {
        const a = doc(obj("1", 5), obj("2", 6));
        const viejo = doc(obj("1", 1));
        expect(fusionarDocs(a, viejo)).toBe(a);
        expect(aplicarObjetos(a, [obj("2", 6)]).doc).toBe(a);
        expect(fusionarDocs(a, docVacio())).toBe(a);
    });

    it("diferenciaSobre lista solo lo mío pendiente respecto a la base", () => {
        const base = doc(obj("1", 1), obj("2", 2));
        const local = aplicarObjetos(base, [obj("2", 9), obj("3", 4)]).doc;
        const d = diferenciaSobre(local, base);
        expect(d.objetos.map((o) => o.id).sort()).toEqual(["2", "3"]);
        expect(d.ambiente).toBeNull();
        expect(diferenciaSobre(base, base).objetos).toEqual([]);
    });

    it("poda solo las lápidas muy viejas", () => {
        const d = doc(lapida("viejo", "caja", 0, "a"), lapida("nuevo", "caja", 900, "a"), obj("vivo", 0));
        const podado = podarLapidas(d, 1000, 500);
        expect(Object.keys(podado.objetos).sort()).toEqual(["nuevo", "vivo"]);
        expect(podarLapidas(podado, 1000, 500)).toBe(podado);
    });
});
