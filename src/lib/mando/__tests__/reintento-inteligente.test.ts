import { describe, it, expect } from "vitest";
import { objecionDe, clasificar, reencolar } from "../reintento-inteligente";

describe("Reintento Inteligente (RI1)", () => {
    const FIXTURE_REVISIONES = `
## 2026-09-17 14:00 · ola300 · RS3: Contrato de salas
**Revisión (xkiro/qwen3.7-plus)**

**Riesgos reales**
1. No valida el esquema de salas antes de guardar en estado.
2. Expone método privado sin autenticación token.

**Probar a mano en localhost**
1. Abrir localhost:9002/mando
2. Hacer click en guardar sala

**Seguimiento:** «sí, bloqueante — Falta validación de esquema y auth en salas»

## 2026-09-17 15:30 · ola300 · CU3: Interfaz de usuario
**Revisión (nvidia/kimi-k3)**

**Seguimiento:** no
`;

    it("extrae la objeción de RS3 con seguimiento y riesgos reales", () => {
        const objecion = objecionDe(FIXTURE_REVISIONES, "RS3");
        expect(objecion).not.toBeNull();
        expect(objecion).toContain("Seguimiento: sí, bloqueante — Falta validación de esquema y auth en salas");
        expect(objecion).toContain("Riesgos reales:");
        expect(objecion).toContain("1. No valida el esquema de salas antes de guardar en estado.");
        expect(objecion).toContain("2. Expone método privado sin autenticación token.");
    });

    it("devuelve null cuando la revisión no es bloqueante (CU3)", () => {
        const objecion = objecionDe(FIXTURE_REVISIONES, "CU3");
        expect(objecion).toBeNull();
    });

    it("devuelve null para un id inexistente", () => {
        expect(objecionDe(FIXTURE_REVISIONES, "NO_EXISTE")).toBeNull();
    });

    describe("clasificar", () => {
        it("Camino 1: rechazada con objeción -> reintentar con motivo de la objeción", () => {
            const tarea = { id: "RS3", estado: "rechazada" };
            const res = clasificar(tarea, [], FIXTURE_REVISIONES);
            expect(res.accion).toBe("reintentar");
            expect(res.motivo).toContain("Seguimiento: sí, bloqueante");
        });

        it("Camino 2: sin_cambios con fallo de proveedor -> reintentar", () => {
            const tarea = { id: "CU3", estado: "sin_cambios", nota: "Error 429 usage limit superado" };
            const res = clasificar(tarea, [], FIXTURE_REVISIONES);
            expect(res.accion).toBe("reintentar");
            // (2026-09-22) El motivo ahora NOMBRA la causa además de decir de quién fue:
            // «era el proveedor» no dejaba saber si fue un 429, un corte de red o un
            // modelo retirado, y esas tres se arreglan de formas distintas.
            expect(res.motivo).toContain("era el medio");
            expect(res.motivo).toContain("tope de uso del proveedor");
        });

        it("Camino 3: bloqueada por dependencia -> esperar", () => {
            const tarea = { id: "CU2", estado: "bloqueada", nota: "dependencia no integrada: CU1" };
            const res = clasificar(tarea, [], FIXTURE_REVISIONES);
            expect(res.accion).toBe("esperar");
            expect(res.motivo).toBe("esperando a que se integre la dependencia");
        });

        it("Camino 4: más de 3 intentos previos -> descartar", () => {
            const tarea = { id: "RS3c", estado: "rechazada" };
            const progreso = [{ id: "RS3" }, { id: "RS3b" }, { id: "RS3c" }];
            const res = clasificar(tarea, progreso, FIXTURE_REVISIONES);
            expect(res.accion).toBe("descartar");
            expect(res.motivo).toBe("tres intentos: necesita una persona");
        });

        it("Camino 5: rechazada sin objeción legible -> descartar", () => {
            const tarea = { id: "RS3", estado: "rechazada" };
            const res = clasificar(tarea, [], "## RS3\nSin seguimiento");
            expect(res.accion).toBe("descartar");
            expect(res.motivo).toBe("rechazo sin razón escrita: no hay cambio que hacer");
        });

        it("Camino 6: sustituida / reasignada -> descartar", () => {
            const tareaSustituida = { id: "RS3", estado: "sustituida" };
            const tareaReasignada = { id: "RS3", estado: "reasignada" };
            expect(clasificar(tareaSustituida, [], FIXTURE_REVISIONES)).toEqual({
                accion: "descartar",
                motivo: "ya vive con otro id",
            });
            expect(clasificar(tareaReasignada, [], FIXTURE_REVISIONES)).toEqual({
                accion: "descartar",
                motivo: "ya vive con otro id",
            });
        });
    });

    describe("reencolar", () => {
        it("reencolar de RS3 con RS3b ya existente devuelve RS3c con prompt actualizado", () => {
            const tareaOriginal = {
                id: "RS3",
                ola: "ola300",
                titulo: "Contrato de salas",
                archivos: ["src/lib/salas.ts"],
                depende: [],
                prompt: "Implementar contrato de salas",
            };
            const objecion = "Seguimiento: sí, bloqueante — Falta validación de esquema";
            const progreso = [{ id: "RS3" }, { id: "RS3b" }];

            const nuevaTarea = reencolar(tareaOriginal, objecion, progreso);

            expect(nuevaTarea.id).toBe("RS3c");
            expect(nuevaTarea.ola).toBe("ola300");
            expect(nuevaTarea.archivos).toEqual(["src/lib/salas.ts"]);
            expect(nuevaTarea.prompt).toContain("Implementar contrato de salas");
            expect(nuevaTarea.prompt).toContain("POR QUÉ VUELVE: el intento anterior fue rechazado. Objeción literal del revisor:\nSeguimiento: sí, bloqueante — Falta validación de esquema");
            expect(nuevaTarea.prompt).toContain("Atiéndela punto por punto; si algún punto no aplica, di por qué en el commit.");
        });
    });
});
