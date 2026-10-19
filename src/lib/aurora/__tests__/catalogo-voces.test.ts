import { describe, it, expect } from "vitest";
import { 
    MotorVozCatalogo, 
    MOTORES_VOZ, 
    motorRecomendado, 
    Plataforma 
} from "../catalogo-voces";

describe("Catálogo de voces", () => {
    it("debe tener todos los motores con licenciaPesos y claseLicencia definidos", () => {
        MOTORES_VOZ.forEach((motor) => {
            expect(motor).toHaveProperty("licenciaPesos");
            expect(motor.licenciaPesos).toBeTypeOf("string");
            expect(motor).toHaveProperty("claseLicencia");
            expect(["libre", "condicionada", "personal"]).toContain(motor.claseLicencia);
        });
    });

    it("debe tener los valores correctos de licenciaPesos y claseLicencia para cada motor conocido", () => {
        const expected: Record<string, { licenciaPesos: string; claseLicencia: "libre" | "condicionada" | "personal" }> = {
            voicemorphic: { licenciaPesos: "CC-BY-NC", claseLicencia: "personal" },
            kokoro: { licenciaPesos: "Apache-2.0", claseLicencia: "libre" },
            chatterbox: { licenciaPesos: "MIT", claseLicencia: "libre" },
            voxcpm: { licenciaPesos: "Apache-2.0", claseLicencia: "libre" },
            openvoice2: { licenciaPesos: "MIT", claseLicencia: "libre" },
            sistema: { licenciaPesos: "Dominio público o similar (proporcionado por el SO)", claseLicencia: "libre" },
            cosyvoice3: { licenciaPesos: "Apache-2.0", claseLicencia: "libre" },
            "qwen3-tts": { licenciaPesos: "Apache-2.0", claseLicencia: "libre" },
            kittentts: { licenciaPesos: "Apache-2.0", claseLicencia: "libre" },
            "moss-tts-nano": { licenciaPesos: "Apache-2.0", claseLicencia: "libre" },
            "dots-tts": { licenciaPesos: "Apache-2.0", claseLicencia: "libre" },
            voicestudio: { licenciaPesos: "CC-BY-NC", claseLicencia: "personal" },
        };

        Object.keys(expected).forEach((id) => {
            const motor = MOTORES_VOZ.find((m) => m.id === id);
            expect(motor).toBeDefined();
            if (motor) {
                expect(motor.licenciaPesos).toBe(expected[id].licenciaPesos);
                expect(motor.claseLicencia).toBe(expected[id].claseLicencia);
            }
        });
    });

    describe("motorRecomendado", () => {
        it("debe devolver un motor personal en contexto personal cuando esté disponible", () => {
            const motor = motorRecomendado("macos", 8, "personal");
            // En macOS 8 GB personal, debería devolver voicemorphic (personal) porque es el por defecto
            expect(motor.id).toBe("voicemorphic");
            expect(motor.claseLicencia).toBe("personal");
        });

        it("debe devolver un motor libre en contexto no personal incluso si hay un personal disponible", () => {
            const motor = motorRecomendado("macos", 8, "grupo");
            // En contexto grupo, no debería devolver un motor personal
            expect(motor.claseLicencia).not.toBe("personal");
            // Debería devolver un motor libre o condicionada
            expect(["libre", "condicionada"]).toContain(motor.claseLicencia);
            // En macOS 8 GB, el motor libre más capaz que quepa podría ser chatterbox o voxcpm, pero al menos no personal
        });

        it("debe devolver el mismo motor para contexto personal y no personal cuando no hay alternativa libre que quepa", () => {
            // Este caso es poco probable porque siempre hay al menos el sistema motor (libre) que quepa
            // Pero probamos con una RAM muy baja
            const motorPersonal = motorRecomendado("macos", 0.4, "personal");
            const motorGrupo = motorRecomendado("macos", 0.4, "grupo");
            // Con 0.4 GB de RAM, solo el sistema motor podría caber (ramMinGB=0)
            // El sistema motor es libre, así que en ambos contextos debería devolver el mismo
            expect(motorPersonal.id).toBe("sistema");
            expect(motorGrupo.id).toBe("sistema");
        });

        it("debe respetar la plataforma y la RAM mínima", () => {
            // Un motor que requiere 4 GB de RAM no debería devolverse si se tienen menos
            const motor = motorRecomendado("macos", 3.9, "personal");
            // voicemorphic requiere 4 GB, así que no debería devolverse
            expect(motor.id).not.toBe("voicemorphic");
            // Debería devolver un motor con ramMinGB <= 3.9
            expect(motor.ramMinGB).toBeLessThanOrEqual(3.9);
        });
    });
});