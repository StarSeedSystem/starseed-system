import { describe, expect, it } from "vitest";

import { elegirEstadoPuerta, parsearEstadoPuerta, parsearLogPuerta, textoPruebas, vistaPuerta } from "../puerta-integracion";

const T = Date.parse("2026-11-11T07:00:00Z");
const hace = (min: number) => T - min * 60_000;

// Logs con la forma real de los `aplicar-*.log` de la Mac (recortados).
const VERDE = `picks: ['opus1106/LLA1111A']
momento seguro: True
ok opus1106/LLA1111A 315028b8f4
vitest 0 [' Test Files  939 passed (939)', '      Tests  10673 passed | 13 skipped (10686)']
tsc 0 []
precarga-sw.mjs sale 0 ['[precarga-sw] ../../../../tmp/precarga-prueba/precarga.json → build JE44 · 109 páginas']
árbol tras el script: []
315028b8f4 Merge branch 'opus1106/LLA1111A'
a8051ea953 LLA1111A: la Mac abre su cámara
`;
const ROJO_TSC = `picks: ['opus1106/LLA1108G', 'opus1106/LLA1108F']
momento seguro: True
ok opus1106/LLA1108G 84bea5643b
ok opus1106/LLA1108F b53c442736
vitest 0 [' Test Files  281 passed (281)', '      Tests  3044 passed (3044)']
tsc 2 ["src/lib/llamadas/superficie/__tests__/adaptador-motor.test.ts(380,39): error TS2493: Tuple type '[q: string]' of length '1' has no element at index '1'."]
src/lib/llamadas/superficie/__tests__/adaptador-motor.test.ts(380,39): error TS2493: ...
ROJO (tsc): deshecho a 1ec96cca30
`;
const ROJO_VITEST_VIEJO = `momento seguro: True
ok f2833736e1 d2b7b49235
vitest 1 [' Test Files  1 failed | 52 passed (53)', '      Tests  1 failed | 584 passed | 1 skipped (586)', '⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯']
 letter.

stderr | src/components/xr/shell/__tests__/pantalla-pizarra.test.tsx > Pizarra3D
<planeGeometry /> is using incorrect casing.
ROJO (vitest): deshecho a 4b66cbb9e6
`;
const CONFLICTO = `picks: ['opus1106/PTA1108B', 'opus1106/PTA1108C']
momento seguro: True
ok opus1106/PTA1108B 982f54b1e0
Auto-merging native/servidor-local/puerta.cjs
CONFLICT (content): Merge conflict in src/lib/malla/puerta/servicio.ts
Automatic merge failed; fix conflicts and then commit the result.

ROJO (cherry-pick opus1106/PTA1108C): deshecho a 3d24bf9708
`;
const PERDONADO = `picks: ['opus1106/BLE1110A', 'opus1106/VID1110A']
momento seguro: True
ok opus1106/BLE1110A 0ff18f98ea
ok opus1106/VID1110A 6fa6ffe685
vitest 1 [' Test Files  1 failed | 302 passed (303)', '      Tests  1 failed | 3405 passed (3406)', '⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯']
vitest: repito a solas ['src/lib/network/__tests__/archivos-malla-grandes.test.ts']
vitest (repetición) 1 ['      Tests  1 failed | 13 passed (14)', '⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯']
vitest: AVISO, siguen rojas pero ya lo estaban en la base: ['src/lib/network/__tests__/archivos-malla-grandes.test.ts']
tsc 0 []
precarga-sw.mjs sale 0 ['[precarga-sw] ok']
árbol tras el script: []
6fa6ffe685 Merge branch 'opus1106/VID1110A'
`;

const parcial = (lineas: number) => VERDE.split("\n").slice(0, lineas).join("\n") + "\n";

describe("parsearLogPuerta · el paso sale de la última línea impresa", () => {
    it("log verde: terminado, con ramas, cuentas y fin", () => {
        const e = parsearLogPuerta(VERDE, T, "aplicar-1111e.log", hace(30))!;
        expect(e).toMatchObject({ origen: "log", nombre: "1111e", ramas: ["opus1106/LLA1111A"], paso: "terminado", resultado: "verde", finMs: T, inicioMs: hace(30) });
        expect(e.pruebas).toEqual({ archivos: 939, pruebas: 10673, falladas: 0, omitidas: 13 });
        expect(e.fallo).toBeUndefined();
    });
    it("a medio camino: esperando, integrando, pruebas, tipos, final", () => {
        expect(parsearLogPuerta("picks: ['a/b']\n", T)!.paso).toBe("esperando");
        expect(parsearLogPuerta(parcial(2), T)!.paso).toBe("integrando");
        expect(parsearLogPuerta(parcial(3), T)!).toMatchObject({ paso: "pruebas", resultado: "en_curso", finMs: null });
        expect(parsearLogPuerta(parcial(4), T)!.paso).toBe("tipos");
        expect(parsearLogPuerta(parcial(5), T)!.paso).toBe("final");
        expect(parsearLogPuerta(parcial(6), T)!.paso).toBe("final");
        expect(parsearLogPuerta(parcial(4), T)!.pruebas?.pruebas).toBe(10673);
    });
    it("con varias ramas sigue «integrando» hasta que todas entran", () => {
        const dos = "picks: ['a/x', 'a/y']\nmomento seguro: True\nok a/x 1234567890\n";
        expect(parsearLogPuerta(dos, T)!.paso).toBe("integrando");
        expect(parsearLogPuerta(dos + "ok a/y 1234567891\n", T)!.paso).toBe("pruebas");
    });
    it("rojo de tsc: dice el primer error y que se deshizo", () => {
        const e = parsearLogPuerta(ROJO_TSC, T, "aplicar-1108z.log")!;
        expect(e).toMatchObject({ resultado: "rojo", paso: "tipos", finMs: T, base: "1ec96cca30" });
        expect(e.ramas).toEqual(["opus1106/LLA1108G", "opus1106/LLA1108F"]);
        expect(e.fallo).toContain("adaptador-motor.test.ts(380,39): error TS2493");
        expect(e.fallo).toContain("se deshizo la fusión");
    });
    it("rojo de vitest en un log viejo sin picks: la salida de vitest no se confunde con líneas del script", () => {
        const e = parsearLogPuerta(ROJO_VITEST_VIEJO, T)!;
        expect(e).toMatchObject({ resultado: "rojo", paso: "pruebas" });
        expect(e.ramas).toEqual(["f2833736e1"]);
        expect(e.pruebas).toMatchObject({ archivos: 53, pruebas: 584, falladas: 1, omitidas: 1 });
        expect(e.fallo).toContain("pruebas en rojo");
    });
    it("conflicto de fusión: paso integrando y la línea del conflicto", () => {
        const e = parsearLogPuerta(CONFLICTO, T)!;
        expect(e).toMatchObject({ resultado: "rojo", paso: "integrando" });
        expect(e.fallo).toContain("no se pudo fusionar");
        expect(e.fallo).toContain("CONFLICT");
    });
    it("rojo perdonado (ya estaba rojo en la base) termina en verde, con las cuentas sin falladas", () => {
        const e = parsearLogPuerta(PERDONADO, T)!;
        expect(e).toMatchObject({ resultado: "verde", paso: "terminado" });
        expect(e.pruebas?.falladas).toBe(0);
    });
    it("vitest en rojo repitiendo a solas: sigue en «pruebas», no está terminada", () => {
        const e = parsearLogPuerta(PERDONADO.split("\n").slice(0, 6).join("\n") + "\n", T)!;
        expect(e).toMatchObject({ paso: "pruebas", resultado: "en_curso" });
    });
    it("un log vacío o ajeno no es una puerta", () => {
        expect(parsearLogPuerta("", T)).toBeNull();
        expect(parsearLogPuerta("hola\nmundo\n", T)).toBeNull();
    });
    it("nunca deja pasar una ruta absoluta", () => {
        const sucio = ROJO_TSC.replace("ROJO (tsc)", "ROJO (tsc)").replace("src/lib/llamadas/superficie", "/Users/alex/x/src/lib/llamadas/superficie");
        expect(JSON.stringify(parsearLogPuerta(sucio, T))).not.toContain("/Users/alex");
    });
});

describe("parsearEstadoPuerta · el archivo que escribe puerta_estado.py", () => {
    const crudo = {
        nombre: "1111f", ramas: ["opus1106/MED1111E", "con espacio"], base: "315028b8f4aaaaaa", paso: "tipos",
        inicio: new Date(hace(12)).toISOString(), actualizado: new Date(hace(2)).toISOString(), fin: null, resultado: "en_curso",
        pruebas: { archivos: 940, pruebas: 10700, falladas: 0, omitidas: 13 }, secreto: "x", ruta: "/Users/alex/a",
    };
    it("lista blanca de campos y ramas con forma de rama", () => {
        const e = parsearEstadoPuerta(crudo)!;
        expect(e).toMatchObject({ origen: "estado", nombre: "1111f", ramas: ["opus1106/MED1111E"], base: "315028b8f4", paso: "tipos", resultado: "en_curso", inicioMs: hace(12), actualizadoMs: hace(2), finMs: null });
        expect(e.pruebas?.pruebas).toBe(10700);
        expect(JSON.stringify(e)).not.toContain("secreto");
        expect(JSON.stringify(e)).not.toContain("/Users");
    });
    it("un paso desconocido o basura no es estado", () => {
        expect(parsearEstadoPuerta({ ...crudo, paso: "inventado" })).toBeNull();
        expect(parsearEstadoPuerta(null)).toBeNull();
        expect(parsearEstadoPuerta("x")).toBeNull();
    });
    it("resultado raro cuenta como en curso", () => {
        expect(parsearEstadoPuerta({ ...crudo, resultado: "quizá" })!.resultado).toBe("en_curso");
    });
});

describe("elegirEstadoPuerta", () => {
    const e = (act: number, o: "estado" | "log") => ({ origen: o, nombre: "", ramas: [], paso: "pruebas" as const, inicioMs: null, actualizadoMs: act, finMs: null, resultado: "en_curso" as const });
    it("gana el rastro más nuevo; con diferencia de menos de un minuto, el estado escrito", () => {
        expect(elegirEstadoPuerta(e(hace(60), "estado"), e(hace(5), "log"))!.origen).toBe("log");
        expect(elegirEstadoPuerta(e(hace(5), "estado"), e(hace(60), "log"))!.origen).toBe("estado");
        expect(elegirEstadoPuerta(e(hace(5), "estado"), e(hace(5) + 30_000, "log"))!.origen).toBe("estado");
        expect(elegirEstadoPuerta(null, e(1, "log"))!.origen).toBe("log");
        expect(elegirEstadoPuerta(null, null)).toBeNull();
    });
});

describe("vistaPuerta", () => {
    it("corriendo: paso X de 5, minutos en el paso y desde el inicio", () => {
        const v = vistaPuerta({ origen: "estado", nombre: "1111f", ramas: ["opus1106/MED1111E", "opus1106/VER1111F"], paso: "pruebas", inicioMs: hace(25), actualizadoMs: hace(8), finMs: null, resultado: "en_curso" }, T);
        expect(v).toMatchObject({ estado: "corriendo", numeroPaso: 3, totalPasos: 5, minutosEnPaso: 8, minutosTotales: 25 });
        expect(v.texto).toBe("MED1111E, VER1111F: corriendo todas las pruebas (paso 3 de 5) · 8 min en este paso");
    });
    it("en curso pero sin rastro desde hace más de 40 min: sin señal, no «corriendo»", () => {
        const base = { origen: "log" as const, nombre: "", ramas: ["a/b"], paso: "pruebas" as const, inicioMs: null, finMs: null, resultado: "en_curso" as const };
        expect(vistaPuerta({ ...base, actualizadoMs: hace(40) }, T).estado).toBe("corriendo");
        const v = vistaPuerta({ ...base, actualizadoMs: hace(41) }, T);
        expect(v.estado).toBe("sin-senal");
        expect(v.texto).toContain("sin señal desde hace 41 min");
        expect(v.texto).toContain("Puede haberse cortado");
        expect(vistaPuerta({ ...base, actualizadoMs: null }, T).estado).toBe("sin-senal");
    });
    it("verde: con cuentas y cuándo; rojo: con el fallo", () => {
        const verde = vistaPuerta(parsearLogPuerta(VERDE, hace(300), "aplicar-1111e.log"), T);
        expect(verde.estado).toBe("verde");
        expect(verde.texto).toContain("LLA1111A: en main, todo en verde (10.673 pruebas en 939 archivos · 13 omitidas) hace 5 h 00 min");
        const rojo = vistaPuerta(parsearLogPuerta(ROJO_TSC, hace(10), "aplicar-1108z.log"), T);
        expect(rojo.estado).toBe("rojo");
        expect(rojo.texto).toContain("en rojo — ");
        expect(rojo.texto).toContain("hace 10 min");
    });
    it("sin datos", () => {
        expect(vistaPuerta(null, T).estado).toBe("sin-datos");
    });
    it("textoPruebas", () => {
        expect(textoPruebas({ archivos: 3, pruebas: 9, falladas: 1, omitidas: 0 })).toBe("9 pruebas en 3 archivos · 1 fallada");
        expect(textoPruebas(undefined)).toBe("");
    });
});
