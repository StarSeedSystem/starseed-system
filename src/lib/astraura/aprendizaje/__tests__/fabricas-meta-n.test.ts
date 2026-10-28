import { describe, expect, it } from "vitest";

import { MEDIOS_FABRICA, MOTORES, elegirFabrica, type MedioFabrica } from "../fabricas";

const medio = (id: string): MedioFabrica => MEDIOS_FABRICA.find((m) => m.id === id)!;

describe("Meta^n · ficha del motor y medios", () => {
    it("declara meta-n como motor de proceso: pautas y funciones de ayuda, no pesos", () => {
        const m = MOTORES["meta-n"];
        expect(m.id).toBe("meta-n");
        expect(m.repo).toBe("https://github.com/minnesotanlp/meta-n");
        expect(m.licencia).toBe("MIT");
        expect(m.tareas).toEqual(["proceso"]);
        expect(m.entrena_en).toEqual([]);
        expect(m.salida).toMatch(/pautas de texto/i);
        expect(m.salida).toMatch(/funciones de ayuda/i);
    });

    it("pide Python ≥ 3.11, Docker y ~1 GB de RAM, sin GPU, y avisa de que solo propone", () => {
        const m = MOTORES["meta-n"];
        const requisitos = m.requisitos.join(" ");
        expect(requisitos).toMatch(/Python ≥ 3\.11/);
        expect(requisitos).toMatch(/Docker/);
        expect(requisitos).toMatch(/~1 GB/);
        expect(requisitos).toMatch(/Sin GPU/);
        expect(m.limites.join(" ")).toMatch(/PROPONE/);
        expect(m.limites.join(" ")).toMatch(/nunca se cargan en caliente/);
    });

    it("solo el A1 y el contenedor de GitHub tienen Docker; la Mac de 8 GB no", () => {
        expect(medio("a1-oracle").docker).toBe(true);
        expect(medio("contenedor-github").docker).toBe(true);
        for (const id of ["mac-8gb", "kaggle-gpu", "colab-gpu"]) {
            expect(medio(id).docker, id).not.toBe(true);
        }
    });
});

describe("elegirFabrica · tarea proceso con Meta^n", () => {
    it("en el A1 con Docker elige meta-n y puede ejecutar la caja sin red", () => {
        const d = elegirFabrica(medio("a1-oracle"), { tarea: "proceso", base: "bitnet-1.58" });
        expect(d.motor).toBe("meta-n");
        expect(d.modo).toBe("entrenar");
        expect(d.falta).toEqual([]);
        expect(d.haceAqui.join(" ")).toMatch(/caja Docker sin red/);
        expect(d.haceAqui.join(" ")).toMatch(/pautas de texto/i);
        expect(d.avisos.join(" ")).toMatch(/juez de StarSeed/);
        expect(d.avisos.join(" ")).toMatch(/nunca se cargan en caliente/);
    });

    it("lo privado NUNCA va al contenedor de GitHub: sin camino, y apunta al A1", () => {
        const d = elegirFabrica(medio("contenedor-github"), { tarea: "proceso", base: "bitnet-1.58" });
        expect(d.motor).toBe("meta-n");
        expect(d.modo).toBe("sin-camino");
        expect(d.falta.join(" ")).toMatch(/Lo privado nunca va a un contenedor de GitHub/);
        expect(d.motivo).toMatch(/contenedor de GitHub/);
        expect(d.derivarA).toContain("a1-oracle");
    });

    it("el contenedor de GitHub sí vale para el ámbito colectivo", () => {
        const d = elegirFabrica(medio("contenedor-github"), { tarea: "proceso", base: "estandar", ambito: "colectivo" });
        expect(d.motor).toBe("meta-n");
        expect(d.modo).toBe("entrenar");
        expect(d.falta).toEqual([]);
        expect(d.haceAqui.join(" ")).toMatch(/sin red y sin claves/);
    });

    it("sin Docker (la Mac de 8 GB) no hay camino: lo dice y deriva al A1, nunca a sí misma", () => {
        const d = elegirFabrica(medio("mac-8gb"), { tarea: "proceso", base: "bitnet-1.58" });
        expect(d.motor).toBe("meta-n");
        expect(d.modo).toBe("sin-camino");
        expect(d.falta.join(" ")).toMatch(/no tiene Docker/);
        expect(d.derivarA).toContain("a1-oracle");
        expect(d.derivarA).not.toContain("mac-8gb");
        expect(d.derivarA).not.toContain("contenedor-github");
    });

    it("en la Mac el ámbito colectivo sí puede derivar también al contenedor de GitHub", () => {
        const d = elegirFabrica(medio("mac-8gb"), { tarea: "proceso", base: "estandar", ambito: "colectivo" });
        expect(d.modo).toBe("sin-camino");
        expect(d.derivarA).toEqual(expect.arrayContaining(["a1-oracle", "contenedor-github"]));
    });

    it("las GPU de Kaggle y Colab sin Docker tampoco sirven, aunque tengan memoria de sobra", () => {
        for (const id of ["kaggle-gpu", "colab-gpu"]) {
            const d = elegirFabrica(medio(id), { tarea: "proceso", base: "bitnet-1.58" });
            expect(d.modo, id).toBe("sin-camino");
            expect(d.falta.join(" "), id).toMatch(/no tiene Docker/);
            expect(d.derivarA, id).toContain("a1-oracle");
        }
    });

    it("un medio con menos de 1 GB de RAM tampoco: Meta^n pide ~1 GB", () => {
        const pequeno: MedioFabrica = { ...medio("a1-oracle"), id: "a1-mini", ram_gb: 0.5 };
        const d = elegirFabrica(pequeno, { tarea: "proceso", base: "bitnet-1.58" });
        expect(d.modo).toBe("sin-camino");
        expect(d.falta.join(" ")).toMatch(/~1 GB de RAM/);
    });

});

describe("elegirFabrica · las tareas de antes no cambian", () => {
    it("adaptador del BitNet en la Mac sigue siendo QVAC entrenando", () => {
        const d = elegirFabrica(medio("mac-8gb"), { tarea: "adaptador", base: "bitnet-1.58" });
        expect(d.motor).toBe("qvac");
        expect(d.modo).toBe("entrenar");
    });

    it("preferencias sobre base estándar siguen siendo Soup en una GPU", () => {
        const d = elegirFabrica(medio("kaggle-gpu"), { tarea: "preferencias", base: "estandar", parametros_b: 7 });
        expect(d.motor).toBe("soup");
        expect(d.modo).toBe("entrenar");
    });

    it("el refresco del base 1.58 sigue siendo onebitllms en CUDA", () => {
        const d = elegirFabrica(medio("kaggle-gpu"), { tarea: "refresco-base", base: "bitnet-1.58" });
        expect(d.motor).toBe("onebitllms");
        expect(d.modo).toBe("entrenar");
    });
});
