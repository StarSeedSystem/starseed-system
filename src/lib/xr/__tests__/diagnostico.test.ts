import { describe, it, expect } from "vitest";
import { construirInforme, type DatosInforme, type InformeXR, type SeccionInforme } from "../diagnostico";
import { FUNCIONES_ESPERADAS, evaluarCapacidades, planificarEntrada, type DatosNavegador } from "../capacidades";

const AHORA = Date.UTC(2026, 9, 25, 12, 0, 0);
const QUEST_UA = "Mozilla/5.0 (X11; Linux x86_64) OculusBrowser/39.2 Chrome/136";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Safari/604.1";
const datos = (o: Partial<DatosNavegador> = {}): DatosNavegador => ({
    ua: QUEST_UA, seguro: true, tieneXR: true, vr: true, ar: true, ofreceSesion: false,
    tactil: true, webgl2: true, webgpu: false, instalada: false, ...o,
});
type Extra = Partial<Pick<DatosInforme, "sesion" | "calidad" | "entradas" | "microfono">>;

function informeCon(d: Partial<DatosNavegador> = {}, extra: Extra = {}): InformeXR {
    const base = datos(d);
    const capacidades = evaluarCapacidades(base);
    const plan = planificarEntrada(capacidades, { instalada: base.instalada });
    return construirInforme({ datos: base, capacidades, plan, ahora: AHORA, ...extra });
}
function seccion(i: InformeXR, nombre: string): SeccionInforme {
    const s = i.secciones.find((x) => x.nombre === nombre);
    if (!s) throw new Error(`falta la sección ${nombre}`);
    return s;
}
function linea(i: InformeXR, nombre: string, clave: string) {
    const l = seccion(i, nombre).lineas.find((x) => x.clave === clave);
    if (!l) throw new Error(`falta la línea ${clave}`);
    return l;
}

describe("construirInforme · diagnóstico del visor", () => {
    it("Quest con enabledFeatures parcial: una línea por función esperada y aviso en las no concedidas", () => {
        const i = informeCon({}, { sesion: { modo: "immersive-vr", funcionesConcedidas: ["local-floor", "bounded-floor", "hand-tracking", "layers"], frecuenciasSoportadas: [72, 90], frecuenciaActual: 72 } });
        const esperadas = FUNCIONES_ESPERADAS.quest;
        const propias = seccion(i, "Funciones WebXR verificadas").lineas.filter((l) => (esperadas as readonly string[]).includes(l.clave));
        expect(propias).toHaveLength(esperadas.length);
        expect(linea(i, "Funciones WebXR verificadas", "local-floor").estado).toBe("ok");
        expect(linea(i, "Funciones WebXR verificadas", "anchors").estado).toBe("aviso");
        expect(linea(i, "Funciones WebXR verificadas", "anchors").valor).toContain("no concedida");
        expect(linea(i, "Funciones WebXR verificadas", "plane-detection").valor).toContain("requerida");
    });

    it("iPhone: dice «sin WebXR» sin romper y deja las funciones sin probar", () => {
        const i = informeCon({ ua: IPHONE_UA, tieneXR: false, vr: false, ar: false });
        expect(linea(i, "Aparato y navegador", "WebXR").valor).toContain("sin WebXR");
        expect(linea(i, "Aparato y navegador", "WebXR").estado).toBe("aviso");
        expect(seccion(i, "Funciones WebXR verificadas").lineas.every((l) => l.estado === "sin-probar")).toBe(true);
    });

    it("sin sesión: funciones, sesión y calidad quedan en sin-probar", () => {
        const i = informeCon();
        expect(linea(i, "Funciones WebXR verificadas", "local-floor").estado).toBe("sin-probar");
        expect(seccion(i, "Sesión").lineas[0].estado).toBe("sin-probar");
        expect(seccion(i, "Calidad y fotogramas").lineas[0].estado).toBe("sin-probar");
    });

    it("el texto plano no lleva URL con parámetros ni arrobas", () => {
        const i = informeCon({ ua: `${QUEST_UA} https://secreto.example/x?token=abc correo=a@b.c` }, { entradas: ["https://x/y?clave=1"], microfono: "concedido" });
        expect(i.texto).not.toContain("?");
        expect(i.texto).not.toContain("@");
        expect(i.texto).not.toContain("token=");
        expect(i.texto).toContain("(enlace omitido)");
    });

    it("orden estable: mismas entradas, mismas secciones y mismo texto", () => {
        const extra: Extra = { sesion: { modo: "immersive-vr", funcionesConcedidas: ["local-floor"], frecuenciasSoportadas: [] } };
        const a = informeCon({}, extra);
        const b = informeCon({}, extra);
        expect(a).toEqual(b);
        expect(seccion(a, "Funciones WebXR verificadas").lineas.map((l) => l.clave)).toEqual([...FUNCIONES_ESPERADAS.quest]);
    });

    it("vr null se muestra como comprobando y sin-probar", () => {
        const i = informeCon({ vr: null, ar: null });
        expect(linea(i, "Aparato y navegador", "VR inmersiva")).toEqual({ clave: "VR inmersiva", valor: "comprobando", estado: "sin-probar" });
        expect(linea(i, "Aparato y navegador", "AR").estado).toBe("sin-probar");
    });

    it("sin https es fallo y sin AR es aviso", () => {
        const i = informeCon({ seguro: false, ar: false });
        expect(linea(i, "Aparato y navegador", "contexto seguro").estado).toBe("fallo");
        expect(linea(i, "Aparato y navegador", "AR").estado).toBe("aviso");
    });

    it("calidad: umbrales de fotograma con el presupuesto del perfil", () => {
        const ok = informeCon({}, { calidad: { nivel: "media", modo: "auto", frameMsMedia: 10 } });
        const aviso = informeCon({}, { calidad: { nivel: "media", modo: "auto", frameMsMedia: 16 } });
        const fallo = informeCon({}, { calidad: { nivel: "media", modo: "auto", frameMsMedia: 30, frameMsP95: 45 } });
        expect(linea(ok, "Calidad y fotogramas", "fotograma medio").estado).toBe("ok");
        expect(linea(aviso, "Calidad y fotogramas", "fotograma medio").estado).toBe("aviso");
        expect(linea(fallo, "Calidad y fotogramas", "fotograma medio").estado).toBe("fallo");
        expect(linea(fallo, "Calidad y fotogramas", "fotograma p95").estado).toBe("fallo");
    });

    it("micrófono: concedido, denegado y sin probar", () => {
        expect(linea(informeCon({}, { microfono: "concedido" }), "Micrófono", "permiso").estado).toBe("ok");
        expect(linea(informeCon({}, { microfono: "denegado" }), "Micrófono", "permiso").estado).toBe("aviso");
        expect(linea(informeCon(), "Micrófono", "permiso").estado).toBe("sin-probar");
    });

    it("ignora funciones desconocidas y marca las concedidas no esperadas", () => {
        const i = informeCon({}, { sesion: { modo: "immersive-vr", funcionesConcedidas: ["camera-access", "light-estimation"], frecuenciasSoportadas: [] } });
        expect(seccion(i, "Funciones WebXR verificadas").lineas.some((l) => l.clave === "camera-access")).toBe(false);
        expect(linea(i, "Funciones WebXR verificadas", "light-estimation")).toEqual({ clave: "light-estimation", valor: "concedida (no esperada)", estado: "ok" });
    });

    it("el texto es plano, lleva título y fecha ISO", () => {
        const i = informeCon();
        expect(i.texto).toContain(i.titulo);
        expect(i.texto).toContain("2026-10-25T12:00:00.000Z");
    });
});
