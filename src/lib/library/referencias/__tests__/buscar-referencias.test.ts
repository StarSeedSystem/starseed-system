import { describe, it, expect } from "vitest";
import {
    buscarReferencias,
    buscarReferenciasLocal,
    elegirPorPalabras,
    preguntasDeTema,
} from "../buscar-referencias";

const contexto = { tipo: "mensaje" as const };
const MARCA = ["brandguidelines", "deck-gallery", "logosystem", "visual-journal", "rebrand-gallery"];
const MOVIMIENTO = ["lottiefiles", "transitions-dev", "60fps", "kinetics", "motion-primitives", "claude-video-2", "onetake"];

describe("elegirPorPalabras", () => {
    it("encuentra el tema y el subtema por palabras, sin Laya", () => {
        const r = elegirPorPalabras("quiero transiciones y animaciones de interfaz");
        expect(r.tema).toBe("movimiento");
        const s = elegirPorPalabras("patrones de navegación para la cabecera");
        expect(s.tema).toBe("inspiracion-ui");
        expect(s.subtema).toBe("navegación");
    });

    it("respeta el tema fijo y no inventa coincidencias", () => {
        expect(elegirPorPalabras("animaciones", undefined, "marca").tema).toBe("marca");
        expect(elegirPorPalabras("zzzz", undefined).tema).toBeNull();
    });
});

describe("buscarReferencias", () => {
    it("consulta solo el canal oficial conectado y usa sus enlaces", async () => {
        const llamadas: Array<{ id: string; canal: string }> = [];
        const tarjetas = await buscarReferencias(
            { peticion: "patrones de apps móviles", contexto },
            {
                conectado: new Set(["mcp-oficial", "api-oficial"]),
                limite: 2,
                consultar: (entrada, canal) => {
                    llamadas.push({ id: entrada.id, canal });
                    return [`https://api.ejemplo.test/${entrada.id}`];
                },
            },
        );
        expect(tarjetas).toHaveLength(2);
        expect(llamadas.length).toBeGreaterThan(0);
        expect(llamadas.every((l) => l.canal === "mcp-oficial" || l.canal === "api-oficial")).toBe(true);
        const consultadas = tarjetas.filter((t) => t.canalUsado !== "enlace");
        expect(consultadas.length).toBeGreaterThan(0);
        expect(consultadas[0].enlaces[0]).toMatch(/^https:\/\/api\.ejemplo\.test\//);
    });

    it("sin canal conectado devuelve enlaces citados y no llama a nadie", async () => {
        let llamadas = 0;
        const tarjetas = await buscarReferencias(
            { peticion: "transiciones de interfaz", contexto },
            { consultar: () => { llamadas += 1; return ["https://no-debe-llamarse.test"]; } },
        );
        expect(llamadas).toBe(0);
        expect(tarjetas.length).toBeGreaterThan(0);
        expect(tarjetas.every((t) => t.canalUsado === "enlace" && t.enlaces[0].startsWith("https://"))).toBe(true);
        expect(tarjetas[0].porque).toContain("referencia");
    });

    it("lo privado nunca consulta canales externos", async () => {
        let llamadas = 0;
        const tarjetas = await buscarReferencias(
            { peticion: "galerías de apps móviles", contexto: { tipo: "perfil", privado: true } },
            { conectado: ["mcp-oficial"], consultar: () => { llamadas += 1; return ["https://privado.test"]; } },
        );
        expect(llamadas).toBe(0);
        expect(tarjetas.every((t) => t.canalUsado === "enlace")).toBe(true);
    });

    it("Laya elige el tema con un choice de todo el catálogo", async () => {
        let temas: string[] = [];
        const tarjetas = await buscarReferencias(
            { peticion: "algo que aún no tiene tema claro", contexto, laya: async ({ preguntas }) => {
                temas = Object.keys(preguntas.tema.criteria);
                return { tema: "marca" };
            } },
            { limite: 5 },
        );
        expect(temas).toHaveLength(7);
        expect(temas).toContain("marca");
        expect(tarjetas.map((t) => t.entradaId).sort()).toEqual([...MARCA].sort());
    });

    it("acepta la forma `answers` de Laya y cae a palabras si no la entiende", async () => {
        const conAnswers = await buscarReferencias(
            { peticion: "sin pistas", contexto, laya: () => ({ answers: { tema: { choice: "movimiento" } } }) },
            { limite: 7 },
        );
        expect(conAnswers.map((t) => t.entradaId).sort()).toEqual([...MOVIMIENTO].sort());
        const sinTema = await buscarReferencias(
            { peticion: "transiciones y animaciones", contexto, laya: () => ({ tema: "inexistente" }) },
            { limite: 1 },
        );
        expect(MOVIMIENTO).toContain(sinTema[0].entradaId);
    });

    it("ordena por personalidad y ADN cuando la petición no fija tema", async () => {
        const persona = await buscarReferencias({ peticion: "", contexto, personalidad: "movimiento y resortes" });
        expect(MOVIMIENTO).toContain(persona[0].entradaId);
        const adn = await buscarReferencias({ peticion: "", contexto, adnDiseno: { tipografia: "Fontshare" } });
        expect(adn[0].entradaId).toBe("fontshare");
        expect(adn[0].porque).toContain("ADN de diseño");
    });

    it("la variante local elige lo mismo y respeta el límite", async () => {
        const local = buscarReferenciasLocal({ peticion: "animaciones", contexto });
        const remoto = await buscarReferencias({ peticion: "animaciones", contexto });
        expect(local).toEqual(remoto);
        const dos = await buscarReferencias({ peticion: "diseño", contexto }, { limite: 2 });
        expect(dos).toHaveLength(2);
        expect(new Set(dos.map((t) => t.entradaId)).size).toBe(2);
    });

    it("la pregunta de Laya trae los siete temas del catálogo", () => {
        const preguntas = preguntasDeTema();
        expect(Object.keys(preguntas.tema.criteria).sort()).toEqual([
            "guias", "ia-diseno", "inspiracion-ui", "marca", "movimiento", "reglas", "tipografia-iconos",
        ]);
    });
});
