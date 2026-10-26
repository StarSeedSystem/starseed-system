import { describe, expect, it } from "vitest";

import {
    MEDIOS_FABRICA,
    MOTORES,
    NECESIDAD_DEFECTO,
    elegirFabrica,
    vramMinimaQLoRA,
    type MedioFabrica,
} from "../fabricas";

const medio = (id: string): MedioFabrica => MEDIOS_FABRICA.find((m) => m.id === id)!;

describe("fábrica intercambiable · los tres motores", () => {
    it("declara qvac, soup y onebitllms con licencia, repo y lo que NO hacen", () => {
        expect(Object.keys(MOTORES).sort()).toEqual(["onebitllms", "qvac", "soup"]);
        for (const m of Object.values(MOTORES)) {
            expect(m.repo).toMatch(/^https:\/\/github\.com\//);
            expect(m.licencia).toBe("Apache-2.0");
            expect(m.limites.length).toBeGreaterThan(0);
        }
        expect(MOTORES.soup.tareas).toEqual(["adaptador", "preferencias"]);
        expect(MOTORES.qvac.bases).toEqual(["bitnet-1.58"]);
        expect(MOTORES.onebitllms.entrena_en).toEqual(["cuda"]);
    });

    it("dice la verdad sobre Python: la 0.76.1 de PyPI no instala en 3.13", () => {
        expect(MOTORES.soup.requisitos.join(" ")).toMatch(/3\.11 o 3\.12/);
        expect(MOTORES.soup.limites.join(" ")).toMatch(/BitNet 1\.58/);
    });

    it("la guía de VRAM sigue la tabla de Soup (8 GB ≈ 7B, 16 ≈ 14B, 24 ≈ 34B, 48 ≈ 70B)", () => {
        expect([vramMinimaQLoRA(7), vramMinimaQLoRA(8), vramMinimaQLoRA(14), vramMinimaQLoRA(34), vramMinimaQLoRA(70), vramMinimaQLoRA(120)]).toEqual([8, 16, 16, 24, 48, 80]);
    });
});

describe("elegirFabrica · honesto por medio", () => {
    it("el adaptador del BitNet 1.58 va a QVAC y entrena en la Mac de 8 GB (por turnos)", () => {
        const d = elegirFabrica(medio("mac-8gb"), NECESIDAD_DEFECTO);
        expect(d.motor).toBe("qvac");
        expect(d.modo).toBe("entrenar");
        expect(d.falta).toEqual([]);
    });

    it("Soup NO entrena en la Mac de 8 GB: solo prepara, y apunta a Kaggle o Colab", () => {
        const d = elegirFabrica(medio("mac-8gb"), { tarea: "adaptador", base: "estandar", parametros_b: 1.5 });
        expect(d.motor).toBe("soup");
        expect(d.modo).toBe("preparar");
        expect(d.falta.join(" ")).toMatch(/16 GB/);
        expect(d.haceAqui.join(" ")).toMatch(/soup data validate/);
        expect(d.haceAqui.join(" ")).toMatch(/soup doctor --config soup\.yaml/);
        expect(d.derivarA).toEqual(expect.arrayContaining(["kaggle-gpu", "colab-gpu"]));
        expect(d.derivarA).not.toContain("mac-8gb");
    });

    it("Soup NO entrena en el A1 de Oracle (ARM sin GPU) ni en un contenedor de GitHub: solo prepara", () => {
        for (const id of ["a1-oracle", "contenedor-github"]) {
            const d = elegirFabrica(medio(id), { tarea: "adaptador", base: "estandar" });
            expect(d.motor, id).toBe("soup");
            expect(d.modo, id).toBe("preparar");
            expect(d.falta.join(" "), id).toMatch(/Sin GPU/);
            expect(d.derivarA, id).toContain("kaggle-gpu");
        }
    });

    it("Soup entrena en una GPU gratuita CUDA y avisa de que el archivo sale de la neurona", () => {
        const d = elegirFabrica(medio("kaggle-gpu"), { tarea: "adaptador", base: "estandar", parametros_b: 7 });
        expect(d.modo).toBe("entrenar");
        expect(d.avisos.join(" ")).toMatch(/sale de la neurona/);
    });

    it("comprueba la VRAM: un modelo de 14B no cabe en 15 GB con QLoRA", () => {
        const d = elegirFabrica(medio("colab-gpu"), { tarea: "adaptador", base: "estandar", parametros_b: 14 });
        expect(d.modo).toBe("preparar");
        expect(d.falta.join(" ")).toMatch(/~16 GB de VRAM/);
    });

    it("una Mac con 16 GB sí entrena con Soup en MPS, con aviso de que no hay cifras ni QLoRA", () => {
        const mac16: MedioFabrica = { ...medio("mac-8gb"), id: "mac-16gb", ram_gb: 16 };
        const d = elegirFabrica(mac16, { tarea: "adaptador", base: "estandar", parametros_b: 1.5 });
        expect(d.modo).toBe("entrenar");
        expect(d.avisos.join(" ")).toMatch(/MPS/);
        expect(d.avisos.join(" ")).toMatch(/LoRA sin cuantizar/);
    });

    it("las preferencias (DPO, ORPO, KTO) son de Soup sobre bases estándar; con el BitNet no hay camino comprobado", () => {
        expect(elegirFabrica(medio("kaggle-gpu"), { tarea: "preferencias", base: "estandar" }).motor).toBe("soup");
        const sin = elegirFabrica(medio("kaggle-gpu"), { tarea: "preferencias", base: "bitnet-1.58" });
        expect(sin.modo).toBe("sin-camino");
        expect(sin.motor).toBeNull();
    });

    it("el refresco del base 1.58 es solo de onebitllms y nunca en la Mac", () => {
        const mac = elegirFabrica(medio("mac-8gb"), { tarea: "refresco-base", base: "bitnet-1.58" });
        expect(mac.motor).toBe("onebitllms");
        expect(mac.modo).toBe("sin-camino");
        expect(mac.derivarA).toEqual(expect.arrayContaining(["kaggle-gpu", "colab-gpu"]));
        const gpu = elegirFabrica(medio("kaggle-gpu"), { tarea: "refresco-base", base: "bitnet-1.58" });
        expect(gpu.modo).toBe("entrenar");
        expect(gpu.avisos.join(" ")).toMatch(/8×A10G/);
        expect(elegirFabrica(medio("kaggle-gpu"), { tarea: "refresco-base", base: "estandar" }).modo).toBe("sin-camino");
    });

    it("QVAC no entrena en el A1 sin GPU y no ofrece preparar con Soup", () => {
        const d = elegirFabrica(medio("a1-oracle"), NECESIDAD_DEFECTO);
        expect(d.motor).toBe("qvac");
        expect(d.modo).toBe("sin-camino");
        expect(d.haceAqui).toEqual([]);
    });
});
