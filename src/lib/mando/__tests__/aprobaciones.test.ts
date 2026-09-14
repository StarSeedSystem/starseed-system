import { describe, it, expect } from "vitest";
import {
    clasificarEfecto,
    traducirVeredicto,
    repercusionesDe,
    construirFicha,
    minutosDesde,
    type Efecto,
} from "../aprobaciones";

const AHORA = new Date("2026-09-13T21:00:00").getTime();
// El módulo lee «YYYY-MM-DD HH:MM:SS» en hora LOCAL, así que el ayudante también
// tiene que escribirla en local: `toISOString()` da UTC y en CST se iba 6 horas.
const hace = (min: number) => {
    const d = new Date(AHORA - min * 60000);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

describe("clasificarEfecto", () => {
    it("los directores y el enjambre son riesgo alto", () => {
        expect(clasificarEfecto("scripts/puente/director-orquestacion.py").area).toBe("Directores y enjambre");
        expect(clasificarEfecto("scripts/enjambre/starseed-enjambre.py").riesgo).toBe("alto");
    });
    it("la API del Mando es riesgo alto", () => {
        expect(clasificarEfecto("src/app/api/mando/colas/route.ts").riesgo).toBe("alto");
    });
    it("la lógica es riesgo medio y la interfaz bajo", () => {
        expect(clasificarEfecto("src/lib/mando/colas.ts").riesgo).toBe("medio");
        expect(clasificarEfecto("src/components/mando/centro-mando.tsx").riesgo).toBe("bajo");
    });
    it("la regla de pruebas gana sobre la carpeta", () => {
        // scripts/puente/test_x.py es una prueba, no un cambio en los directores.
        expect(clasificarEfecto("scripts/puente/test_curacion.py").area).toBe("Pruebas");
        expect(clasificarEfecto("src/lib/mando/__tests__/colas.test.ts").area).toBe("Pruebas");
        expect(clasificarEfecto("src/components/x.test.tsx").riesgo).toBe("bajo");
    });
    it("lo desconocido cae en Otros", () => {
        expect(clasificarEfecto("README.md").area).toBe("Otros");
    });
});

describe("traducirVeredicto — decide por campos, nunca por la nota", () => {
    it("sin revisor no se aprueba sola", () => {
        const v = traducirVeredicto({ nota: "rama lista · revisión ok" });
        expect(v.verde).toBe(false);
        expect(v.porQueNo).toContain("sin veredicto");
    });
    it("una nota con «revisión ok» NO abre la puerta", () => {
        // El agujero de la Ola 261: la prosa no decide.
        const v = traducirVeredicto({ revisor: "bloqueante", nota: "rama lista · revisión ok" });
        expect(v.verde).toBe(false);
        expect(v.porQueNo).toBe("la revisión es bloqueante");
    });
    it("un revisor desconocido tampoco", () => {
        const v = traducirVeredicto({ revisor: "quien_sea" });
        expect(v.porQueNo).toContain("no hubo revisor");
    });
    it("alcance incompleto lo dice con los archivos que faltan", () => {
        const v = traducirVeredicto({ revisor: "respondio", faltan: ["a.ts", "b.ts"] });
        expect(v.verde).toBe(false);
        expect(v.porQueNo).toContain("a.ts");
    });
    it("un motivo que no es de política no abre sola", () => {
        const v = traducirVeredicto({ revisor: "respondio", motivo_vb: "bloqueo confirmado" });
        expect(v.verde).toBe(false);
        expect(v.porQueNo).toContain("no por política");
    });
    it("verde solo con revisor que respondió, sin faltas y por política", () => {
        const v = traducirVeredicto({ revisor: "respondio", motivo_vb: "pedido por la cola" });
        expect(v.verde).toBe(true);
        expect(v.porQueNo).toBe("");
    });
});

describe("repercusionesDe", () => {
    const alto: Efecto = { area: "Directores y enjambre", detalle: "x", riesgo: "alto" };
    const bajo: Efecto = { area: "Interfaz", detalle: "x", riesgo: "bajo" };
    it("avisa de lo que manda sobre el enjambre", () => {
        expect(repercusionesDe([alto], [])[0]).toContain("manda sobre las demás");
    });
    it("nombra las tareas que desbloquea", () => {
        expect(repercusionesDe([bajo], ["A", "B"]).join(" ")).toContain("Desbloquea 2 tarea(s): A, B");
    });
    it("sin efectos no inventa la frase de cambio contenido", () => {
        expect(repercusionesDe([], [])).toEqual([]);
    });
    it("no duplica frases", () => {
        const r = repercusionesDe([alto, alto], []);
        expect(r.length).toBe(1);
    });
});

describe("minutosDesde y construirFicha", () => {
    it("cuenta los minutos con el reloj que se le pasa", () => {
        expect(minutosDesde(hace(147), AHORA)).toBe(147);
        expect(minutosDesde("", AHORA)).toBe(0);
        expect(minutosDesde("no es fecha", AHORA)).toBe(0);
    });
    it("con lo mínimo dice lo que falta, sin inventar", () => {
        const f = construirFicha({ id: "pX" }, AHORA);
        expect(f.titulo).toBe("pX");
        expect(f.rama).toBe("ola/pX");
        expect(f.descripcion).toContain("Sin ficha");
        expect(f.veredicto.verde).toBe(false);
        expect(f.lineas).toBe(0);
    });
    it("con todo, suma líneas y clasifica los efectos", () => {
        const f = construirFicha(
            {
                id: "p320A",
                titulo: "Ficha",
                archivos: [
                    { ruta: "src/lib/mando/aprobaciones.ts", mas: 100, menos: 4 },
                    { ruta: "src/lib/mando/__tests__/aprobaciones.test.ts", mas: 80, menos: 0 },
                ],
                entrada: { revisor: "respondio", motivo_vb: "pedido por la cola" },
                dependientes: ["p320B"],
                t: hace(30),
            },
            AHORA,
        );
        expect(f.lineas).toBe(184);
        expect(f.efectos.map((e) => e.area)).toEqual(["Lógica del Mando", "Pruebas"]);
        expect(f.veredicto.verde).toBe(true);
        expect(f.minutosEsperando).toBe(30);
        expect(f.repercusiones.join(" ")).toContain("Desbloquea 1");
    });
});
