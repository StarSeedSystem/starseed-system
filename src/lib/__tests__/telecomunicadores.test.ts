/**
 * Tests de las funciones PURAS de Telecomunicadores (Ola 287 · T1 · 2026-09-08).
 * Solo importa funciones puras (`planDelDia`, `promptTelecomunicador`): ni la
 * ruta del App Router ni las envolturas que tocan disco/red, porque en este repo
 * vitest (`globals: false`) no admite parchear módulos de Node.
 */
import { describe, it, expect } from "vitest";
import type { CanalStarSeed, HistorialCanal } from "../canales/canales";
import {
    planDelDia,
    promptTelecomunicador,
    type PlanPublicacion,
} from "../canales/telecomunicadores";

const canal: CanalStarSeed = {
    id: "c1",
    nombre: "Noticias StarSeed",
    plataforma: "telegram",
    enlace: "",
    identificador: "-1000000000000",
    tipo: "canal",
    categorias: ["ecosistema", "tecnologia"],
    descripcion: "Canal de noticias del ecosistema.",
    personalidadId: "p1",
    cerebroId: "b1",
    cadenciaDia: 4,
    formatos: ["texto", "quiz"],
    activo: true,
    publicoEnDirectorio: true,
    creadoEn: "",
    actualizadoEn: "",
};

describe("planDelDia", () => {
    it("reparte 4 publicaciones crecientes entre 09:00 y 22:00 con cadencia 4", () => {
        const ahora = new Date(2026, 8, 8, 12, 0);
        const plan = planDelDia(canal, ahora, []);
        expect(plan).toHaveLength(4);
        const horas = plan.map((p) => p.hora);
        for (let i = 1; i < horas.length; i++) {
            expect(horas[i] > horas[i - 1]).toBe(true);
        }
        for (const h of horas) {
            expect(h >= "09:00" && h <= "22:00").toBe(true);
        }
        expect(plan[0].formato).toBe("texto");
        expect(plan[1].formato).toBe("quiz");
    });

    it("salta las horas que ya tienen publicación de hoy", () => {
        const ahora = new Date(2026, 8, 8, 12, 0);
        const historial: HistorialCanal[] = [
            { canalId: "c1", t: new Date(2026, 8, 8, 13, 0).toISOString(), texto: "a", formato: "texto", ok: true },
            { canalId: "c1", t: new Date(2026, 8, 8, 18, 0).toISOString(), texto: "b", formato: "quiz", ok: true },
        ];
        const plan = planDelDia(canal, ahora, historial);
        expect(plan).toHaveLength(2);
        expect(plan.map((p) => p.hora)).toEqual(["09:00", "22:00"]);
    });
});

describe("promptTelecomunicador", () => {
    it("mete el nombre y la esencia de la personalidad en el system", () => {
        const plan: PlanPublicacion = {
            canalId: "c1",
            hora: "09:00",
            formato: "texto",
            tema: "ecosistema",
            fuente: "libre",
        };
        const prompt = promptTelecomunicador({
            canal,
            personalidad: { nombre: "Hermione", esencia: "La curadora de conocimiento.", estilo: "preciso y cálido" },
            memorias: [],
            plan,
            ultimos: ["Noticia A", "Noticia B"],
        });
        expect(prompt.system).toContain("Hermione");
        expect(prompt.system).toContain("La curadora de conocimiento.");
    });

    it("incluye los últimos titulares y respeta el límite del formato", () => {
        const plan: PlanPublicacion = {
            canalId: "c1",
            hora: "09:00",
            formato: "texto",
            tema: "tecnologia",
            fuente: "libre",
        };
        const prompt = promptTelecomunicador({
            canal,
            personalidad: { nombre: "Hermione", esencia: "Curadora.", estilo: "" },
            memorias: ["memoria 1"],
            plan,
            ultimos: ["Último titular del día"],
        });
        expect(prompt.system).toContain("Último titular del día");
        expect(prompt.system).toContain("700 caracteres");
        expect(prompt.user).toContain("tecnologia");
    });
});