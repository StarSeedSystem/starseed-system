// @vitest-environment jsdom
/**
 * Comparación ESTABLE de JSON (MTN1027Cb · directivas Meta^n que viajan con la cuenta).
 *
 * El registro que baja de `user_settings.prefs` viene de `jsonb`, que REORDENA las claves.
 * Comparar con `JSON.stringify` a secas marcaba como «reparado» un registro que ya era
 * válido solo porque sus claves llegaban en otro orden, y lo re-subía en bucle.
 * `jsonEstable` compara el contenido, no el orden de las claves.
 */
import { describe, expect, it } from "vitest";
import { jsonEstable } from "@/lib/sync/realtime-sync";

describe("jsonEstable", () => {
    it("da el mismo texto para objetos con las claves en otro orden", () => {
        expect(jsonEstable({ b: 2, a: 1 })).toBe(jsonEstable({ a: 1, b: 2 }));
        expect(jsonEstable({ capa: "juicio", historial: [{ v: 1, capa: "juicio" }] }))
            .toBe(jsonEstable({ historial: [{ capa: "juicio", v: 1 }], capa: "juicio" }));
    });

    it("distingue valores distintos y respeta el orden de los arreglos", () => {
        expect(jsonEstable({ a: 1 })).not.toBe(jsonEstable({ a: 2 }));
        expect(jsonEstable([1, 2])).not.toBe(jsonEstable([2, 1]));
    });

    it("ordena de forma recursiva también dentro de arreglos", () => {
        expect(jsonEstable([{ b: 1, a: 2 }])).toBe(jsonEstable([{ a: 2, b: 1 }]));
    });
});
