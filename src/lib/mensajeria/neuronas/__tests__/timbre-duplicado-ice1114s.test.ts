/**
 * ICE1114S · El timbre se reenvía hasta que lo acusan: un duplicado del mismo timbre nunca abre una segunda llamada entrante,
 * ni mientras suena, ni con la llamada ya contestada o ya rechazada.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { __olvidarSesionesTimbradas, timbreDeNeurona } from "@/lib/mensajeria/neuronas/llamadas-neurona";
import { leerLlamadas, quitarTimbre } from "@/lib/llamadas/store";
import type { CuerpoNeurona } from "@/lib/mensajeria/neuronas/bandeja";

function cuerpo(mid: string, sesion: string): CuerpoNeurona {
    return {
        mid,
        de: { n: "tableta", nom: "Maggaboard" },
        txt: "",
        ll: { tipo: "audio", via: "sistema-llamadas", sesion },
    } as unknown as CuerpoNeurona;
}

describe("ICE1114S · timbre duplicado", () => {
    beforeEach(() => {
        __olvidarSesionesTimbradas();
        for (const t of leerLlamadas().timbres) quitarTimbre(t.sesionId);
    });

    it("el mismo timbre dos veces (mismo mensaje) deja un solo timbre", async () => {
        await timbreDeNeurona({ clave: "neurona:t", cuerpo: cuerpo("m1", "s-1") });
        await timbreDeNeurona({ clave: "neurona:t", cuerpo: cuerpo("m1", "s-1") });
        expect(leerLlamadas().timbres.filter((t) => t.sesionId === "s-1")).toHaveLength(1);
    });

    it("rechazado o contestado el timbre, un reenvío tardío (otro mensaje, misma llamada) no vuelve a sonar", async () => {
        await timbreDeNeurona({ clave: "neurona:t", cuerpo: cuerpo("m1", "s-2") });
        quitarTimbre("s-2"); // la persona lo rechazó / contestó
        await timbreDeNeurona({ clave: "neurona:t", cuerpo: cuerpo("m2", "s-2") });
        expect(leerLlamadas().timbres.filter((t) => t.sesionId === "s-2")).toHaveLength(0);
    });

    it("otra llamada distinta sí suena", async () => {
        await timbreDeNeurona({ clave: "neurona:t", cuerpo: cuerpo("m1", "s-3") });
        await timbreDeNeurona({ clave: "neurona:t", cuerpo: cuerpo("m9", "s-4") });
        expect(leerLlamadas().timbres.map((t) => t.sesionId).sort()).toEqual(["s-3", "s-4"]);
    });
});
