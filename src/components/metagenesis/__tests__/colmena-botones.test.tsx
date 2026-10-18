import { describe, expect, it } from "vitest";
<<<<<<< HEAD
import { botonesNeurona, type NeuronaColmena } from "@/lib/metagenesis/colmena";

describe("colmena-botones · botones de una neurona (rescatado de rama nube)", () => {
    it("sin trabajo en curso, el botón de desconectar está deshabilitado", () => {
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos", enCurso: 0 });
=======
import { botonesNeurona, SO } from "@/lib/metagenesis/colmena";

describe("colmena-botones", () => {
    it("sin trabajo en curso, el botón de desconectar está deshabilitado", () => {
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos" as SO, enCurso: 0 });
>>>>>>> 538892c0 (salvavidas · RTGN1010A-d3d-d1c: trabajo del agente antes de las puertas (tsc / vitest))
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: false, etiqueta: "Desconectar" });
        expect(b.desconectar.explica).toBe("No tiene trabajo en curso: puedes apagarlo sin más.");
        expect(b.desconectar.confirmar).toBe(false);
    });

    it("con contenedor activo y sin trabajo en curso, el botón de desconectar está habilitado", () => {
<<<<<<< HEAD
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos", enCurso: 0, contenedor: { activo: true, agentes: 3, apto: true, motivo: "" } });
=======
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos" as SO, enCurso: 0, contenedor: { activo: true, agentes: 3, apto: true, motivo: "" } });
>>>>>>> 538892c0 (salvavidas · RTGN1010A-d3d-d1c: trabajo del agente antes de las puertas (tsc / vitest))
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: true, etiqueta: "Desconectar" });
        expect(b.contenedor).toMatchObject({ visible: true, habilitado: true, etiqueta: "Dejar de usar como contenedor" });
    });

    it("mostrar botón de desconectar cuando hay trabajo en curso con 1 agente", () => {
<<<<<<< HEAD
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos", enCurso: 1 });
=======
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos" as SO, enCurso: 1 });
>>>>>>> 538892c0 (salvavidas · RTGN1010A-d3d-d1c: trabajo del agente antes de las puertas (tsc / vitest))
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: true, etiqueta: "Desconectar" });
        expect(b.desconectar.explica).toContain("1 agente");
        expect(b.desconectar.confirmar).toBe(true);
    });

<<<<<<< HEAD
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
});
=======
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
>>>>>>> 538892c0 (salvavidas · RTGN1010A-d3d-d1c: trabajo del agente antes de las puertas (tsc / vitest))
