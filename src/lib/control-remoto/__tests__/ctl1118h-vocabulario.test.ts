import { describe, expect, it } from "vitest";
import { palabrasEstado, PALABRAS_MOTIVO } from "../palabras";
import { pasosQueFaltan } from "@/lib/banco-llamadas/pasos";

// CTL1118H (Alex, 18-11): «quita el texto que dice "tableta" a "neurona"… para ser mas universal».
describe("CTL1118H · vocabulario universal del control entre neuronas", () => {
    it("los motivos y estados no dan por hecho que el otro aparato es una tableta", () => {
        const textos = [...Object.values(PALABRAS_MOTIVO), ...(["conectando", "en-vivo", "pausa-local", "sin-pantalla", "cerrada"] as const).map((e) => palabrasEstado(e, "Maggabox"))];
        for (const t of textos) expect(t.toLowerCase(), t).not.toMatch(/tableta|tablet/);
        expect(PALABRAS_MOTIVO["sin-soporte"]).toBe("Esta neurona todavía no puede hacer esto.");
        expect(palabrasEstado("pausa-local", "Maggabox")).toBe("Maggabox: están usando esa neurona; el control espera.");
    });

    it("los pasos del modo de pruebas de llamadas hablan de «esa neurona»", () => {
        const id = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";
        const todos = [
            ...pasosQueFaltan({ informe: null, destino: "" , codigo: null }),
            ...pasosQueFaltan({ informe: null, destino: id, codigo: null }),
            ...pasosQueFaltan({ informe: { llave: true, objetivo: id, sesion: { estado: "pendiente", motivo: "sin-respuesta" }, codigo: "1234" } as never, destino: id, codigo: "1234" }),
        ];
        expect(todos.length).toBeGreaterThan(3);
        for (const p of todos) expect(p.texto.toLowerCase(), p.texto).not.toMatch(/tableta|tablet/);
        expect(todos.some((p) => p.texto.includes("esa neurona"))).toBe(true);
    });
});
