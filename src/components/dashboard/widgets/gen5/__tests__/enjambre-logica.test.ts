import { describe, expect, it } from "vitest";
import { aEtiqueta, conEtiqueta, extraerEtiquetas, panal, proyectosDe, siguienteDe, sinEtiquetas, sueltas } from "../project-swarm-partes";

const t = (id: string, text: string, done = false, extra: object = {}) => ({ id, text, done, createdAt: Number(id.replace(/\D/g, "")) || 1, ...extra });

describe("Enjambre · etiquetas y proyectos", () => {
    it("extrae etiquetas con tildes y ñ, sin duplicados ni correos", () => {
        expect(extraerEtiquetas("Regar #huerto y #Huerto con #riego-goteo")).toEqual(["huerto", "riego-goteo"]);
        expect(extraerEtiquetas("Escribir a ana#gmail y #año-nuevo")).toEqual(["año-nuevo"]);
        expect(sinEtiquetas("Regar #huerto hoy")).toBe("Regar hoy");
        expect(conEtiqueta("Regar", "huerto")).toBe("Regar #huerto");
        expect(conEtiqueta("Regar #huerto", "huerto")).toBe("Regar #huerto");
        expect(aEtiqueta("  Mi Huerto ")).toBe("mi-huerto");
        expect(aEtiqueta("#")).toBeNull();
    });
    it("agrupa, calcula progreso y elige la siguiente (alta primero, luego la más antigua)", () => {
        const ps = proyectosDe([
            t("t1", "A #huerto", true, { doneAt: 50 }), t("t2", "B #huerto"), t("t3", "C #huerto", false, { priority: "alta" }),
            t("t4", "D #asamblea"), t("t5", "suelta"),
        ]);
        expect(ps.map((p) => p.etiqueta)).toEqual(["huerto", "asamblea"]);
        expect(ps[0].progreso).toBeCloseTo(1 / 3);
        expect(ps[0].siguiente?.id).toBe("t3");
        expect(siguienteDe([t("t9", "x"), t("t2", "y")])?.id).toBe("t2");
        expect(sueltas([t("t5", "suelta"), t("t6", "#a1")])).toBe(1);
    });
    it("el panal no solapa celdas", () => {
        const c = panal(19, 10);
        for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) {
            expect(Math.hypot(c[i].x - c[j].x, c[i].y - c[j].y)).toBeGreaterThan(17);
        }
    });
});

import { chispa, comoNota, esIdea, ideasDe, textoIdea, tituloDe, CONCEPTOS } from "../idea-forge-partes";

describe("Incubadora · chispas e ideas", () => {
    it("la chispa es determinista por día, con dos conceptos distintos", () => {
        expect(chispa(20000)).toEqual(chispa(20000));
        for (let d = 0; d < 50; d++) {
            const c = chispa(20000 + d, d % 3);
            expect(c.a).not.toBe(c.b);
            expect(CONCEPTOS).toContain(c.a as (typeof CONCEPTOS)[number]);
        }
    });
    it("marca, limpia y ordena las ideas", () => {
        expect(comoNota("Una idea")).toBe("Una idea #idea");
        expect(comoNota("Una idea #idea")).toBe("Una idea #idea");
        expect(esIdea({ text: "algo #ideas" })).toBe(false);
        expect(textoIdea("Una #idea buena")).toBe("Una buena");
        expect(tituloDe("Primera frase. Segunda frase #idea")).toBe("Primera frase");
        const ideas = ideasDe([
            { id: "1", text: "a #idea", createdAt: 1, updatedAt: 5 },
            { id: "2", text: "b #idea", createdAt: 1, updatedAt: 1, pinned: true },
            { id: "3", text: "c", createdAt: 1, updatedAt: 9 },
        ]);
        expect(ideas.map((n) => n.id)).toEqual(["2", "1"]);
    });
});

import { afinidad, desdeApp, desdePaquete, elegirHallazgo, type Hallazgo } from "../serendipity-lens-partes";

describe("Serendipia · elección", () => {
    const h = (id: string, etiquetas: string[]): Hallazgo => ({ id, origen: "paquete", tipo: "Widget", titulo: id, descripcion: "", href: null, externo: false, icono: "Package", color: "#fff", etiquetas });
    const todos = [h("a", ["musica", "audio"]), h("b", ["musica"]), h("c", ["gobernanza"]), h("d", ["clima"]), h("e", [])];
    const mias = new Set(["musica", "audio"]);
    it("afinidad por etiquetas en común", () => {
        expect(afinidad(todos[0], mias)).toBe(1);
        expect(afinidad(todos[2], mias)).toBe(0);
    });
    it("determinista por día, respeta lo visto y la rareza", () => {
        expect(elegirHallazgo(todos, 100, 0, new Set(), 0.5, mias)).toEqual(elegirHallazgo(todos, 100, 0, new Set(), 0.5, mias));
        expect(elegirHallazgo(todos, 100, 0, new Set(todos.map((x) => x.id)), 0.5, mias)).toBeNull();
        for (let d = 0; d < 20; d++) expect(elegirHallazgo(todos, d, 0, new Set(["a"]), 0.5, mias)?.id).not.toBe("a");
    });
    it("los paquetes «próximamente» no se ofrecen y las URL externas solo si son https", () => {
        expect(desdePaquete({ id: "x", kind: "app", name: "X", description: "", icon: "", tags: [], payload: {}, comingSoon: true })).toBeNull();
        expect(desdePaquete({ id: "y", kind: "repo", name: "Y", description: "", icon: "", tags: [], payload: { url: "javascript:alert(1)" } })?.href).toBeNull();
        expect(desdePaquete({ id: "z", kind: "app", name: "Z", description: "", icon: "", tags: [], payload: { route: "/xr" } })?.href).toBe("/xr");
        expect(desdeApp({ id: "a", name: "A", description: "", accent: "#fff", category: "sistema", open: { primary: "route", route: "/hub" }, status: "soon" }, "X")).toBeNull();
    });
});
