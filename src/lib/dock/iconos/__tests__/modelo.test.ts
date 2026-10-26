import { describe, expect, it } from "vitest";
import {
    FORMAS_ICONO,
    LIMITES,
    aplicarPlantilla,
    crearIdPlantilla,
    disenoBase,
    disenoComoPlantilla,
    disenoEfectivo,
    disenoInicialDeItem,
    disenosIguales,
    leerPlantilla,
    normalizarColor,
    normalizarDiseno,
    normalizarPerfil,
    normalizarPlantilla,
    plantillaDesdeDock,
    ponerDisenoItem,
    procedenciaDiseno,
    quitarDisenosPropios,
    perfilVacio,
    type DisenoIcono,
    type ItemIcono,
    type PlantillaIconos,
} from "../modelo";
import { PLANTILLAS_SERIE, esPlantillaDeSerie, plantillaDeSerie } from "../plantillas-serie";

const png1x1 =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function d(parcial: Partial<DisenoIcono> = {}): DisenoIcono {
    return { ...disenoBase("#22d3ee"), nombre: "x", ...parcial };
}

function plantilla(extra: Partial<PlantillaIconos> = {}): PlantillaIconos {
    const p = normalizarPlantilla({
        id: "prueba",
        nombre: "Prueba",
        autor: "Test",
        licencia: "CC0",
        porDefecto: d({ forma: "hexagono", nombre: "por defecto" }),
        disenos: { MessagesSquare: d({ forma: "gota", nombre: "mensajes" }) },
        ...extra,
    });
    if (!p) throw new Error("plantilla de prueba inválida");
    return p;
}

const items: ItemIcono[] = [
    { id: "mensajes", iconKey: "MessagesSquare" },
    { id: "ajustes", iconKey: "Settings", color: "amber" },
    { id: "suelto", iconKey: "Bell", diseno: d({ forma: "rombo", nombre: "a mano" }) },
];

describe("normalizarColor", () => {
    it("acepta hexadecimal y lo expande/minusculiza", () => {
        expect(normalizarColor("#ABC", "#000000")).toBe("#aabbcc");
        expect(normalizarColor("#AABBCC", "#000000")).toBe("#aabbcc");
        expect(normalizarColor("#abcd", "#000000")).toBe("#aabbccdd");
        expect(normalizarColor(" #22d3ee ", "#000000")).toBe("#22d3ee");
    });
    it("rechaza todo lo que no sea hexadecimal (nada de funciones, nombres ni url())", () => {
        for (const mal of ["red", "rgb(0,0,0)", "url(javascript:alert(1))", "#12", "#gggggg", "expression(1)", "", null, 42, {}]) {
            expect(normalizarColor(mal, "#123456")).toBe("#123456");
        }
    });
});

describe("normalizarDiseno", () => {
    it("rechaza lo que no es un objeto", () => {
        for (const x of [null, undefined, "x", 3, [], true]) expect(normalizarDiseno(x)).toBeNull();
    });

    it("rellena y acota: forma, escala, brillo, colores", () => {
        const r = normalizarDiseno({ forma: "no-existe", escala: 9, brillo: -3, colorGlifo: "azul", fondo: { tipo: "color", color: "#FFF" } })!;
        expect(r.forma).toBe("circulo");
        expect(r.escala).toBe(LIMITES.escalaMax);
        expect(r.brillo).toBe(0);
        expect(r.colorGlifo).toBe("#ffffff");
        expect(r.fondo).toEqual({ tipo: "color", color: "#ffffff" });
        expect(r.glifo).toEqual({ tipo: "lucide", clave: "auto" });
    });

    it("es idempotente", () => {
        const una = normalizarDiseno(d({ borde: { color: "#ffffff55", ancho: 1.2 } }))!;
        expect(normalizarDiseno(una)).toEqual(una);
    });

    it("acepta todas las formas del catálogo", () => {
        for (const forma of FORMAS_ICONO) expect(normalizarDiseno(d({ forma }))!.forma).toBe(forma);
    });

    it("el borde sin ancho desaparece y el ancho se acota", () => {
        expect(normalizarDiseno(d({ borde: { color: "#fff", ancho: 0 } }))!.borde).toBeUndefined();
        expect(normalizarDiseno(d({ borde: { color: "#fff", ancho: 99 } }))!.borde!.ancho).toBe(LIMITES.bordeMax);
    });

    describe("glifos no confiables", () => {
        it("un SVG pasa por el saneador: sin script ni manejadores", () => {
            const r = normalizarDiseno(d({ glifo: { tipo: "svg", svg: '<svg viewBox="0 0 24 24" onload="alert(1)"><script>alert(2)</script><path d="M1 1L5 5" stroke="currentColor"/></svg>' } }))!;
            expect(r.glifo.tipo).toBe("svg");
            const svg = (r.glifo as { svg: string }).svg;
            expect(svg).not.toMatch(/script|onload|alert/i);
            expect(svg).toContain("<path");
        });

        it("un SVG sin nada utilizable descarta el diseño", () => {
            expect(normalizarDiseno(d({ glifo: { tipo: "svg", svg: "no es un svg" } }))).toBeNull();
        });

        it("una imagen remota se rechaza (rastreo), también las rutas relativas y los data: que no son de mapa de bits", () => {
            for (const src of [
                "https://ejemplo.com/a.png",
                "http://ejemplo.com/a.png",
                "//ejemplo.com/a.png",
                "/a.png",
                "javascript:alert(1)",
                "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
                "data:text/html;base64,PGgxPjwvaDE+",
                png1x1.replace("base64,", "base64,\"onerror=alert(1)//"),
            ]) {
                expect(normalizarDiseno(d({ glifo: { tipo: "imagen", src } })), src).toBeNull();
            }
        });

        it("una imagen data: pequeña de mapa de bits se acepta; una enorme no", () => {
            expect(normalizarDiseno(d({ glifo: { tipo: "imagen", src: png1x1 } }))).not.toBeNull();
            const enorme = "data:image/png;base64," + "A".repeat(LIMITES.imagenMaxCaracteres);
            expect(normalizarDiseno(d({ glifo: { tipo: "imagen", src: enorme } }))).toBeNull();
        });

        it("una clave de Lucide rara cae a «auto»", () => {
            const r = normalizarDiseno(d({ glifo: { tipo: "lucide", clave: "../../etc/passwd" } }))!;
            expect(r.glifo).toEqual({ tipo: "lucide", clave: "auto" });
            expect(normalizarDiseno(d({ glifo: { tipo: "lucide", clave: "Sparkles" } }))!.glifo).toEqual({ tipo: "lucide", clave: "Sparkles" });
        });

        it("los textos se limpian de etiquetas y se acortan", () => {
            const r = normalizarDiseno(d({ nombre: "<img src=x onerror=1>" + "a".repeat(200) }))!;
            expect(r.nombre).not.toMatch(/[<>]/);
            expect(r.nombre!.length).toBeLessThanOrEqual(LIMITES.nombreMax);
        });
    });
});

describe("disenoEfectivo", () => {
    const perfil = { ...perfilVacio(1), plantilla: plantilla() };

    it("sin plantilla ni diseño propio: ninguno (se pinta el icono de siempre)", () => {
        expect(disenoEfectivo(items[0], perfilVacio())).toBeNull();
        expect(disenoEfectivo(items[0], null)).toBeNull();
        expect(disenoEfectivo(items[0], undefined)).toBeNull();
    });

    it("el diseño de la plantilla para su iconKey", () => {
        expect(disenoEfectivo(items[0], perfil)!.nombre).toBe("mensajes");
    });

    it("el «por defecto» para un iconKey que la plantilla no trae (también para iconos nuevos)", () => {
        expect(disenoEfectivo(items[1], perfil)!.nombre).toBe("por defecto");
        expect(disenoEfectivo({ id: "nuevo", iconKey: "IconoQueNoExiste" }, perfil)!.nombre).toBe("por defecto");
    });

    it("el diseño propio del item manda sobre la plantilla", () => {
        expect(disenoEfectivo(items[2], perfil)!.nombre).toBe("a mano");
        expect(procedenciaDiseno(items[2], perfil)).toBe("propio");
        expect(procedenciaDiseno(items[0], perfil)).toBe("plantilla");
        expect(procedenciaDiseno(items[0], perfilVacio())).toBe("ninguno");
    });

    it("el diseño propio sin plantilla también se pinta", () => {
        expect(disenoEfectivo(items[2], perfilVacio())!.forma).toBe("rombo");
    });

    it("un diseño propio corrupto (viene de la cuenta) se ignora y manda la plantilla", () => {
        const corrupto = { id: "x", iconKey: "Settings", diseno: { forma: "circulo", glifo: { tipo: "imagen", src: "https://malo/x.png" } } } as unknown as ItemIcono;
        expect(disenoEfectivo(corrupto, perfil)!.nombre).toBe("por defecto");
        expect(disenoEfectivo(corrupto, perfilVacio())).toBeNull();
    });

    it("iconKey con nombres de Object.prototype no se cuela por herencia", () => {
        for (const k of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
            expect(disenoEfectivo({ id: k, iconKey: k }, perfil)!.nombre).toBe("por defecto");
        }
    });

    it("devuelve el mismo objeto en llamadas repetidas (caché por objeto)", () => {
        expect(disenoEfectivo(items[0], perfil)).toBe(disenoEfectivo(items[0], perfil));
    });
});

describe("aplicarPlantilla", () => {
    it("pone la plantilla en el perfil y limpia los diseños sueltos de los items", () => {
        const r = aplicarPlantilla(items, plantilla(), { ahora: 123 });
        expect(r.ok).toBe(true);
        expect(r.perfil.plantilla!.id).toBe("prueba");
        expect(r.perfil.actualizado).toBe(123);
        expect(r.limpiados).toBe(1);
        expect(r.conservados).toBe(0);
        expect(r.items.every((i) => !i.diseno)).toBe(true);
        // y ahora el item que tenía un diseño a mano toma el de la plantilla
        expect(disenoEfectivo(r.items[2], r.perfil)!.nombre).toBe("por defecto");
    });

    it("con conservarManuales deja los diseños sueltos", () => {
        const r = aplicarPlantilla(items, plantilla(), { conservarManuales: true });
        expect(r.limpiados).toBe(0);
        expect(r.conservados).toBe(1);
        expect(r.items[2].diseno!.nombre).toBe("a mano");
    });

    it("no muta los items de entrada ni la plantilla", () => {
        const antes = JSON.stringify(items);
        const p = plantilla();
        const antesP = JSON.stringify(p);
        aplicarPlantilla(items, p);
        expect(JSON.stringify(items)).toBe(antes);
        expect(JSON.stringify(p)).toBe(antesP);
    });

    it("conserva el resto de campos de cada item", () => {
        const conExtra = [{ id: "a", iconKey: "Bell", label: "Avisos", enabled: true, diseno: d() }];
        const r = aplicarPlantilla(conExtra, plantilla());
        expect(r.items[0]).toEqual({ id: "a", iconKey: "Bell", label: "Avisos", enabled: true });
    });

    it("una plantilla inválida no cambia nada y lo dice", () => {
        const r = aplicarPlantilla(items, { nombre: "" } as unknown as PlantillaIconos);
        expect(r.ok).toBe(false);
        expect(r.motivo).toBeTruthy();
        expect(r.items).toEqual(items);
        expect(r.perfil.plantilla).toBeNull();
    });

    it("las plantillas de serie se aplican a cualquier iconKey", () => {
        for (const p of PLANTILLAS_SERIE) {
            const r = aplicarPlantilla(items, p);
            expect(r.ok, p.id).toBe(true);
            for (const it of r.items) expect(disenoEfectivo(it, r.perfil), `${p.id}/${it.id}`).not.toBeNull();
        }
    });
});

describe("ponerDisenoItem / quitarDisenosPropios", () => {
    it("pone el diseño de UN item sin tocar a los demás", () => {
        const nuevo = d({ nombre: "nuevo" });
        const r = ponerDisenoItem(items, "ajustes", nuevo);
        expect(r[1].diseno).toBe(nuevo);
        expect(r[0]).toBe(items[0]);
        expect(items[1].diseno).toBeUndefined();
    });
    it("con null lo quita (restablecer)", () => {
        const r = ponerDisenoItem(items, "suelto", null);
        expect(r[2].diseno).toBeUndefined();
        expect("diseno" in r[2]).toBe(false);
    });
    it("quitarDisenosPropios devuelve cuántos quitó", () => {
        const r = quitarDisenosPropios(items);
        expect(r.quitados).toBe(1);
        expect(r.items.some((i) => i.diseno)).toBe(false);
    });
});

describe("leerPlantilla / normalizarPlantilla", () => {
    it("exige nombre y diseño por defecto válido", () => {
        expect(leerPlantilla({ porDefecto: d() }).plantilla).toBeNull();
        expect(leerPlantilla({ nombre: "A" }).plantilla).toBeNull();
        expect(leerPlantilla({ nombre: "A", porDefecto: { glifo: { tipo: "svg", svg: "nada" } } }).plantilla).toBeNull();
        expect(leerPlantilla("texto").plantilla).toBeNull();
    });

    it("rellena autor y licencia por defecto y genera un id seguro", () => {
        const p = normalizarPlantilla({ nombre: "Mi estilo", id: "../../x", porDefecto: d() })!;
        expect(p.autor).toBe("Anónimo");
        expect(p.licencia).toMatch(/Libre/);
        expect(p.id).toMatch(/^[a-z0-9][a-z0-9._-]*$/);
        expect(p.id).not.toContain("/");
    });

    it("descarta los diseños inválidos y las claves raras, y cuenta cuántos", () => {
        // JSON.parse crea de verdad una clave propia «__proto__» (un literal de objeto no)
        const disenos = JSON.parse(JSON.stringify({ Bell: d(), "no-valida!": d(), Mala: { glifo: { tipo: "imagen", src: "https://x/y.png" } } }).replace(/^\{/, `{"__proto__":${JSON.stringify(d())},`));
        expect(Object.keys(disenos)).toContain("__proto__");
        const l = leerPlantilla({ nombre: "A", porDefecto: d(), disenos });
        expect(Object.keys(l.plantilla!.disenos)).toEqual(["Bell"]);
        expect(l.omitidos).toBe(3);
        expect(l.motivos[0]).toMatch(/3 diseño/);
    });

    it("limita el número de diseños y el peso total", () => {
        const muchos: Record<string, unknown> = {};
        for (let i = 0; i < LIMITES.disenosPorPlantillaMax + 20; i++) muchos[`Icono${i}`] = d();
        const l = leerPlantilla({ nombre: "Grande", porDefecto: d(), disenos: muchos });
        expect(Object.keys(l.plantilla!.disenos).length).toBe(LIMITES.disenosPorPlantillaMax);
        expect(l.omitidos).toBe(20);

        // diseños de ~10 KB cada uno: el presupuesto de 150 KB corta antes del tope por número
        const pesada = "data:image/png;base64," + "A".repeat(LIMITES.imagenMaxCaracteres - 100);
        const pesados: Record<string, unknown> = {};
        for (let i = 0; i < 10; i++) pesados[`Pesado${i}`] = d({ glifo: { tipo: "imagen", src: pesada } });
        const l2 = leerPlantilla({ nombre: "Pesada", porDefecto: d(), disenos: pesados });
        expect(JSON.stringify(l2.plantilla).length).toBeLessThanOrEqual(LIMITES.plantillaMaxBytes + 2000);
        expect(l2.omitidos).toBeGreaterThan(0);
    });

    it("limpia nombre, descripción y etiquetas", () => {
        const p = normalizarPlantilla({
            nombre: "  <b>Hola</b>  ", descripcion: "x".repeat(1000), etiquetas: ["a", "<script>", 3, "b".repeat(100)], porDefecto: d(),
        })!;
        expect(p.nombre).not.toMatch(/[<>]/);
        expect(p.descripcion!.length).toBeLessThanOrEqual(LIMITES.descripcionMax);
        expect(p.etiquetas!.length).toBeLessThanOrEqual(3);
        expect(p.etiquetas!.every((e) => !/[<>]/.test(e) && e.length <= 24)).toBe(true);
    });
});

describe("normalizarPerfil", () => {
    it("cualquier basura da el perfil vacío", () => {
        for (const x of [null, "x", 3, [], undefined]) expect(normalizarPerfil(x).plantilla).toBeNull();
    });
    it("normaliza la plantilla que trae", () => {
        const p = normalizarPerfil({ plantilla: { nombre: "A", porDefecto: { forma: "rombo" } }, actualizado: 5 });
        expect(p.plantilla!.porDefecto.forma).toBe("rombo");
        expect(p.actualizado).toBe(5);
    });
    it("una plantilla rota se queda en null (no rompe el dock)", () => {
        expect(normalizarPerfil({ plantilla: { nombre: "" } }).plantilla).toBeNull();
    });
});

describe("plantillas desde el dock y desde un solo diseño", () => {
    it("plantillaDesdeDock recoge lo que se ve y nombra la plantilla", () => {
        const perfil = { ...perfilVacio(1), plantilla: plantilla() };
        const p = plantillaDesdeDock(items, perfil, { nombre: "Mi dock", autor: "Yo" })!;
        expect(p.nombre).toBe("Mi dock");
        expect(p.autor).toBe("Yo");
        expect(Object.keys(p.disenos).sort()).toEqual(["Bell", "MessagesSquare", "Settings"]);
        expect(p.disenos.Bell.nombre).toBe("a mano");
    });
    it("sin ningún diseño que recoger devuelve null", () => {
        expect(plantillaDesdeDock(items.slice(0, 2), perfilVacio(), { nombre: "Nada" })).toBeNull();
    });
    it("disenoComoPlantilla aplica el ESTILO a todos con el glifo propio de cada uno", () => {
        const conGlifo = d({ glifo: { tipo: "svg", svg: '<svg viewBox="0 0 24 24"><path d="M1 1L5 5" stroke="currentColor"/></svg>' } });
        const p = disenoComoPlantilla(conGlifo, { nombre: "Estilo" })!;
        expect(p.porDefecto.glifo).toEqual({ tipo: "lucide", clave: "auto" });
        expect(p.porDefecto.forma).toBe(conGlifo.forma);
    });
});

describe("utilidades", () => {
    it("disenoInicialDeItem arranca con el color del item", () => {
        expect(disenoInicialDeItem({ iconKey: "Bell", color: "amber" }).colorGlifo).toBe("#fbbf24");
        expect(disenoInicialDeItem({ iconKey: "Bell", color: "nada" }).colorGlifo).toBe("#94a3b8");
    });
    it("disenosIguales", () => {
        expect(disenosIguales(d(), d())).toBe(true);
        expect(disenosIguales(d(), d({ forma: "gota" }))).toBe(false);
        expect(disenosIguales(null, undefined)).toBe(true);
        expect(disenosIguales(d(), null)).toBe(false);
    });
    it("crearIdPlantilla da ids legibles y válidos", () => {
        const id = crearIdPlantilla("Cristal líquido ✨", 1_700_000_000_000);
        expect(id).toMatch(/^cristal-liquido-[a-z0-9]+$/);
        expect(crearIdPlantilla("¿?", 5)).toMatch(/^plantilla-/);
    });
});

describe("plantillas de serie", () => {
    it("son las cuatro pedidas, con ids únicos y válidos", () => {
        expect(PLANTILLAS_SERIE.map((p) => p.nombre)).toEqual(["Trinity", "Cristal líquido", "Flor de la vida", "Monocromo"]);
        expect(new Set(PLANTILLAS_SERIE.map((p) => p.id)).size).toBe(4);
        for (const p of PLANTILLAS_SERIE) {
            expect(esPlantillaDeSerie(p.id)).toBe(true);
            expect(plantillaDeSerie(p.id)).toBe(p);
        }
        expect(esPlantillaDeSerie("otra")).toBe(false);
        expect(plantillaDeSerie("otra")).toBeNull();
    });
    it("ya están normalizadas (no cambian al pasar por el normalizador) y caben en el presupuesto", () => {
        for (const p of PLANTILLAS_SERIE) {
            expect(normalizarPlantilla(p), p.id).toEqual(p);
            expect(JSON.stringify(p).length, p.id).toBeLessThan(LIMITES.plantillaMaxBytes);
            expect(leerPlantilla(p).omitidos, p.id).toBe(0);
        }
    });
    it("todos los glifos son «auto»: cada icono conserva su Lucide", () => {
        for (const p of PLANTILLAS_SERIE) {
            expect(p.porDefecto.glifo).toEqual({ tipo: "lucide", clave: "auto" });
            for (const dis of Object.values(p.disenos)) expect(dis.glifo).toEqual({ tipo: "lucide", clave: "auto" });
        }
    });
    it("las cuatro se distinguen entre sí por la forma o el fondo", () => {
        const firmas = PLANTILLAS_SERIE.map((p) => JSON.stringify([p.porDefecto.forma, p.porDefecto.fondo.tipo]));
        expect(new Set(firmas).size).toBe(4);
    });
    it("Trinity y Cristal distinguen familias; Monocromo es uniforme", () => {
        const trinity = plantillaDeSerie("serie-trinity")!;
        expect(JSON.stringify(trinity.disenos.MessagesSquare.fondo)).not.toBe(JSON.stringify(trinity.disenos.Settings.fondo));
        expect(Object.keys(plantillaDeSerie("serie-monocromo")!.disenos)).toEqual([]);
    });
});
