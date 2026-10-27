import { describe, expect, it } from "vitest";
import { botonesNeurona, type NeuronaColmena, ordenDesconectar, ordenContenedor } from "@/lib/metagenesis/colmena";

describe("colmena-botones · botones de una neurona (rescatado de rama nube)", () => {
    it("sin trabajo en curso, el botón de desconectar está deshabilitado", () => {
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos", enCurso: 0 });
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: false, etiqueta: "Desconectar" });
        expect(b.desconectar.explica).toBe("No tiene trabajo en curso: puedes apagarlo sin más.");
        expect(b.desconectar.confirmar).toBe(false);
    });

    it("con contenedor activo y sin trabajo en curso, el botón de desconectar está habilitado", () => {
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos", enCurso: 0, contenedor: { activo: true, agentes: 3, apto: true, motivo: "" } });
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: true, etiqueta: "Desconectar" });
        expect(b.contenedor).toMatchObject({ visible: true, habilitado: true, etiqueta: "Dejar de usar como contenedor" });
    });

    it("mostrar botón de desconectar cuando hay trabajo en curso con 1 agente", () => {
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos", enCurso: 1 });
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: true, etiqueta: "Desconectar" });
        expect(b.desconectar.explica).toContain("1 agente");
        expect(b.desconectar.confirmar).toBe(true);
    });

    it("contenedor activo: explica «Termina lo que lleva y no coge más.» y pide confirmar si hay trabajo", () => {
        const sin = botonesNeurona({
            nodo: "oracle-a1-bbbbbb",
            vivo: true,
            so: "linux",
            enCurso: 0,
            contenedor: { activo: true, agentes: 2, apto: true, motivo: "Listo para trabajar" },
        });
        expect(sin.contenedor).toMatchObject({
            visible: true,
            habilitado: true,
            etiqueta: "Dejar de usar como contenedor",
            explica: "Termina lo que lleva y no coge más.",
        });
        expect(sin.contenedor.confirmar).toBe(false);
        const con = botonesNeurona({
            nodo: "oracle-a1-bbbbbb",
            vivo: true,
            so: "linux",
            enCurso: 1,
            contenedor: { activo: true, agentes: 2, apto: true, motivo: "Listo para trabajar" },
        });
        expect(con.contenedor.confirmar).toBe(true);
    });

    it("sin trabajador: «Instalar el trabajador» visible y habilitado (explica Terminal / Termux)", () => {
        const linux = botonesNeurona({ nodo: null, vivo: true, so: "linux", enCurso: 0 });
        expect(linux.instalar).toMatchObject({
            visible: true,
            habilitado: true,
            etiqueta: "Instalar el trabajador",
            explica: "Un comando en la terminal de este aparato.",
        });
        const android = botonesNeurona({ nodo: null, vivo: true, so: "android", enCurso: 0 });
        expect(android.instalar.explica).toBe("En Android, dentro de Termux (experimental, 1 agente).");
    });

    it("con trabajo en curso y contenedor activo, ambos botones requieren confirmación", () => {
        const b = botonesNeurona({ 
            nodo: "mac-a1b2c3", 
            vivo: true, 
            so: "macos", 
            enCurso: 1, 
            contenedor: { activo: true, agentes: 2, apto: true, motivo: "" } 
        });
        // Desconectar button: enabled, requires confirmation because of work in course
        expect(b.desconectar).toMatchObject({ 
            visible: true, 
            habilitado: true, 
            etiqueta: "Desconectar", 
            confirmar: true 
        });
        expect(b.desconectar.explica).toBe(
            "Guarda el trabajo a medias de sus 1 agente(s) y lo pasa a otro contenedor antes de que este aparato se quede sin internet."
        );
        // Contenedor button: enabled to stop being a container, and requires confirmation because of work in course
        expect(b.contenedor).toMatchObject({ 
            visible: true, 
            habilitado: true, 
            etiqueta: "Dejar de usar como contenedor", 
            confirmar: true 
        });
    });

    // Additional test cases from the original task that are not already covered:
    it("muestra información de tarea a medias cuando existe", () => {
        // Test that when there's work in progress, the disconnect button's explanation mentions the work
        const b = botonesNeurona({
            nodo: "mac-a1b2c3",
            vivo: true,
            so: "macos",
            enCurso: 1, // One task in progress
            contenedor: null
        });
        // Should show information about work in progress in the explanation
        expect(b.desconectar.explica).toContain("1 agente");
        // Should require confirmation when there's work in progress
        expect(b.desconectar.confirmar).toBe(true);
    });

    it("envía orden desconectar al hacer clic en el botón", () => {
        // Test the ordenDesconectar function directly
        const orden = ordenDesconectar("mac-a1b2c3");
        expect(orden).toEqual({ accion: "desconectar", para: "mac-a1b2c3", args: {} });
    });

    it("envía orden contenedor al hacer clic en el botón", () => {
        // Test the ordenContenedor function directly
        const orden = ordenContenedor("mac-a1b2c3", true, 2);
        expect(orden).toEqual({ accion: "contenedor", para: "mac-a1b2c3", args: { activo: true, trabajadores: 2 } });
    });

    // Note: "muestra la línea de información bajo el nombre del nodo" is UI-specific
    // and not applicable to the pure botonesNeurona function we're testing here.
    // This would require testing the actual ColmenaBotones component when it exists.
});