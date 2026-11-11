import { describe, expect, it } from "vitest";

import { leerRegistroCarril } from "../carril-claude";
import { publicacionParaEnviar, sanearEnMarcha, vistaEnMarcha, vistaPublicacion, type EnMarcha } from "../en-marcha";
import { parsearFoto } from "../medidores-remotos";
import { parsearEstadoPuerta } from "../puerta-integracion";

const AHORA = Date.parse("2026-11-11T07:30:00Z");
const hace = (min: number) => AHORA - min * 60_000;
const iso = (min: number) => new Date(hace(min)).toISOString();

const carril = (latidoMin: number) =>
    leerRegistroCarril({
        latido: iso(latidoMin),
        tareas: [
            { id: "MED1111E", titulo: "Medidores de Genesis", estado: "en_curso", desde: iso(30), prompt: "SECRETO" },
            { id: "VER1111F", titulo: "Centro de Versiones", estado: "en_curso", desde: iso(30) },
            { id: "LLA1111H", titulo: "Llamadas", estado: "pendiente", desde: iso(30) },
        ],
    });
const puertaCorriendo = () =>
    parsearEstadoPuerta({ nombre: "1111f", ramas: ["opus1106/MED1111E"], base: "315028b8f4", paso: "pruebas", inicio: iso(20), actualizado: iso(6), resultado: "en_curso" });
const puertaVerde = (finMin: number) =>
    parsearEstadoPuerta({ nombre: "1111e", ramas: ["opus1106/LLA1111A"], paso: "terminado", inicio: iso(finMin + 20), actualizado: iso(finMin), fin: iso(finMin), resultado: "verde", pruebas: { archivos: 939, pruebas: 10673, falladas: 0, omitidas: 13 } });

describe("vistaEnMarcha · con trabajo corriendo", () => {
    const en: EnMarcha = { generadoMs: AHORA, carril: carril(3), puerta: puertaCorriendo(), publicacion: { activa: true, fase: "ci", detalle: "CI en GitHub Actions", actualizadoMs: hace(10), ultimaMs: hace(300) } };
    const v = vistaEnMarcha(en, AHORA);
    it("lo vivo se cuenta junto: 2 agentes + la puerta + la publicación", () => {
        expect(v.algoCorre).toBe(true);
        expect(v.vivos).toBe(4);
        expect(v.frase).toBe("Corre ahora: 2 agentes de Claude, la puerta de integración, la publicación.");
    });
    it("las tres partes, cada una con su estado", () => {
        expect(v.carril.estado).toBe("vivo");
        expect(v.puerta.estado).toBe("corriendo");
        expect(v.puerta.numeroPaso).toBe(3);
        expect(v.publicacion.estado).toBe("publicando");
    });
});

describe("vistaEnMarcha · sin nada corriendo", () => {
    it("dice que no corre nada y nombra lo último que terminó y cuándo (la puerta, o la publicación si es más nueva)", () => {
        const v = vistaEnMarcha({ generadoMs: AHORA, carril: leerRegistroCarril({ latido: iso(2), tareas: [] }), puerta: puertaVerde(95), publicacion: { activa: true, fase: "esperando", detalle: "esperando", ultimaMs: hace(400) } }, AHORA);
        expect(v.algoCorre).toBe(false);
        expect(v.frase).toBe("No corre nada ahora. Lo último que terminó: la puerta integró LLA1111A en verde (10.673 pruebas en 939 archivos · 13 omitidas), hace 1 h 35 min.");
        const v2 = vistaEnMarcha({ generadoMs: AHORA, carril: null, puerta: puertaVerde(95), publicacion: { activa: true, fase: "publicado", ultimaMs: hace(10) } }, AHORA);
        expect(v2.ultimo).toMatchObject({ quien: "publicacion" });
        expect(v2.frase).toContain("se publicó el OS, hace 10 min");
    });
    it("sin ninguna fuente: no corre nada y no inventa cuándo terminó lo último", () => {
        const v = vistaEnMarcha(null, AHORA);
        expect(v.algoCorre).toBe(false);
        expect(v.ultimo).toBeNull();
        expect(v.frase).toBe("No corre nada ahora. No consta cuándo terminó lo último.");
    });
    it("carril con tareas pero sin latido: no cuenta como corriendo y se avisa", () => {
        const v = vistaEnMarcha({ generadoMs: AHORA, carril: carril(120), puerta: null, publicacion: null }, AHORA);
        expect(v.algoCorre).toBe(false);
        expect(v.carril.estado).toBe("sin-latido");
        expect(v.frase).toContain("Ojo: el carril de Claude tiene tareas abiertas pero sin latido.");
    });
    it("una puerta «en curso» sin rastro hace una hora no cuenta como viva", () => {
        const vieja = parsearEstadoPuerta({ ramas: ["a/b"], paso: "pruebas", inicio: iso(120), actualizado: iso(75), resultado: "en_curso" });
        const v = vistaEnMarcha({ generadoMs: AHORA, carril: null, puerta: vieja, publicacion: null }, AHORA);
        expect(v.algoCorre).toBe(false);
        expect(v.puerta.estado).toBe("sin-senal");
        expect(v.frase).toContain("la puerta no da señal");
    });
    it("el carril cerrado con hora cuenta como «lo último»", () => {
        const l = leerRegistroCarril({ latido: iso(1), tareas: [{ id: "OLD1", titulo: "t", estado: "hecha", cerrada: iso(7) }] });
        const v = vistaEnMarcha({ generadoMs: AHORA, carril: l, puerta: puertaVerde(95), publicacion: null }, AHORA);
        expect(v.ultimo).toMatchObject({ quien: "carril" });
        expect(v.frase).toContain("el carril de Claude cerró OLD1, hace 7 min");
    });
});

describe("vistaPublicacion", () => {
    it("autopublicación apagada, bloqueada, en CI viejo", () => {
        expect(vistaPublicacion({ activa: false }, AHORA).estado).toBe("apagada");
        expect(vistaPublicacion({ activa: true, fase: "bloqueado", detalle: "CI en rojo" }, AHORA)).toMatchObject({ estado: "bloqueada" });
        expect(vistaPublicacion({ activa: true, fase: "ci", actualizadoMs: hace(200) }, AHORA).estado).toBe("sin-senal");
        expect(vistaPublicacion({ activa: true, fase: "ci", actualizadoMs: hace(20) }, AHORA).estado).toBe("publicando");
        expect(vistaPublicacion(null, AHORA).estado).toBe("sin-datos");
    });
});

describe("lo que viaja a otras neuronas", () => {
    const en: EnMarcha = { generadoMs: AHORA, carril: carril(3), puerta: puertaCorriendo(), publicacion: publicacionParaEnviar({ activa: true, fase: "ci", detalle: "mira /Users/alex/x", actualizadoMs: hace(1), token: "pd_secreto" }) };
    it("nada de prompt, archivos, rutas ni claves, ni en el objeto ni tras pasar por la lista blanca", () => {
        for (const x of [en, sanearEnMarcha(JSON.parse(JSON.stringify(en)))]) {
            const t = JSON.stringify(x);
            expect(t).not.toContain("SECRETO");
            expect(t).not.toContain("prompt");
            expect(t).not.toContain("archivos");
            expect(t).not.toContain("/Users");
            expect(t).not.toContain("pd_secreto");
            expect(t).not.toContain("token");
        }
    });
    it("sanearEnMarcha reconstruye lo mismo desde el JSON y rechaza lo que trae campos de más", () => {
        const ida = sanearEnMarcha(JSON.parse(JSON.stringify(en)))!;
        expect(ida.carril?.tareas.map((t) => t.id)).toEqual(["MED1111E", "VER1111F", "LLA1111H"]);
        expect(ida.puerta).toMatchObject({ paso: "pruebas", resultado: "en_curso", ramas: ["opus1106/MED1111E"] });
        const sucio = { ...JSON.parse(JSON.stringify(en)), extra: "x" };
        sucio.carril.tareas[0].prompt = "OTRO SECRETO";
        sucio.carril.tareas[0].archivos = ["/Users/a"];
        sucio.puerta.ruta = "/Users/alex/log";
        const limpio = JSON.stringify(sanearEnMarcha(sucio));
        expect(limpio).not.toContain("OTRO SECRETO");
        expect(limpio).not.toContain("/Users");
        expect(limpio).not.toContain("extra");
        expect(sanearEnMarcha(null)).toBeNull();
        expect(sanearEnMarcha("x")).toBeNull();
        expect(sanearEnMarcha({})).toBeNull();
    });
    it("la foto del líder trae en_marcha por la lista blanca de parsearFoto", () => {
        const foto = parsearFoto({ generado_en: new Date(AHORA).toISOString(), agentes: 2, en_marcha: JSON.parse(JSON.stringify(en)) });
        expect(foto?.enMarcha?.carril?.tareas).toHaveLength(3);
        expect(parsearFoto({ generado_en: new Date(AHORA).toISOString(), en_marcha: "basura" })?.enMarcha).toBeUndefined();
        // Y la vista que verá la otra neurona dice lo mismo.
        expect(vistaEnMarcha(foto!.enMarcha, AHORA).vivos).toBe(vistaEnMarcha(en, AHORA).vivos);
    });
});
