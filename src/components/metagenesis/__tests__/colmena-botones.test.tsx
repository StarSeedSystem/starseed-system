import { describe, expect, it } from "vitest";
import { botonesNeurona, SO } from "@/lib/metagenesis/colmena";

describe("colmena-botones", () => {
    it("sin trabajo en curso, el botón de desconectar está deshabilitado", () => {
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos" as SO, enCurso: 0 });
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: false, etiqueta: "Desconectar" });
        expect(b.desconectar.explica).toBe("No tiene trabajo en curso: puedes apagarlo sin más.");
        expect(b.desconectar.confirmar).toBe(false);
    });

    it("con contenedor activo y sin trabajo en curso, el botón de desconectar está habilitado", () => {
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos" as SO, enCurso: 0, contenedor: { activo: true, agentes: 3, apto: true, motivo: "" } });
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: true, etiqueta: "Desconectar" });
        expect(b.contenedor).toMatchObject({ visible: true, habilitado: true, etiqueta: "Dejar de usar como contenedor" });
    });

    it("mostrar botón de desconectar cuando hay trabajo en curso con 1 agente", () => {
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos" as SO, enCurso: 1 });
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: true, etiqueta: "Desconectar" });
        expect(b.desconectar.explica).toContain("1 agente");
        expect(b.desconectar.confirmar).toBe(true);
    });

    it("muestra el botón de usar como contenedor cuando el nodo puede ser contenedor", () => {
        const n = { nodo: "mac-a1b2c3", vivo: true, so: "macos" as SO, enCurso: 0, contenedor: { activo: false, agentes: 2, apto: true, motivo: "" } };
        const b = botonesNeurona(n);
        expect(b.contenedor).toMatchObject({ 
            visible: true, 
            habilitado: true, 
            etiqueta: "Usar como contenedor (2 agentes)",
            explica: "Este aparato coge tareas de la cola como la Mac."
        });
    });

    it("muestra el botón de dejar de usar como contenedor cuando el nodo está actuando como contenedor", () => {
        const n = { nodo: "mac-a1b2c3", vivo: true, so: "macos" as SO, enCurso: 0, contenedor: { activo: true, agentes: 3, apto: true, motivo: "" } };
        const b = botonesNeurona(n);
        expect(b.contenedor).toMatchObject({ 
            visible: true, 
            habilitado: true, 
            etiqueta: "Dejar de usar como contenedor",
            explica: "Termina lo que lleva y no coge más."
        });
    });

    it("muestra información de tarea a medias cuando existe (2 agentes)", () => {
        const n = { nodo: "mac-a1b2c3", vivo: true, so: "macos" as SO, enCurso: 2 };
        const b = botonesNeurona(n);
        expect(b.desconectar.explica).toContain("2 agente(s)");
    });
});
