import { describe, expect, it } from "vitest";
import {
    botonesNeurona,
    comandoInstalar,
    estimarDesdeNavegador,
    ordenContenedor,
    ordenDesconectar,
    soDesdeAgente,
    type NeuronaColmena,
} from "../colmena";

const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/154.0 Safari/537.36";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 16; Pixel) AppleWebKit/537.36 Chrome/154.0 Mobile Safari/537.36";

describe("colmena · sistema del aparato", () => {
    it("reconoce los sistemas, también el iPad que se presenta como Mac", () => {
        expect(soDesdeAgente(MAC_UA)).toBe("macos");
        expect(soDesdeAgente(MAC_UA, "MacIntel", true)).toBe("ios");
        expect(soDesdeAgente(IPHONE_UA)).toBe("ios");
        expect(soDesdeAgente(ANDROID_UA)).toBe("android");
        expect(soDesdeAgente("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
        expect(soDesdeAgente("Mozilla/5.0 (X11; Linux x86_64)")).toBe("linux");
    });
});

describe("colmena · lo que podría aportar (mismos umbrales que colmena_logica.py)", () => {
    it("una Mac de 8 GB y 8 núcleos: al menos 3 agentes", () => {
        const r = estimarDesdeNavegador({ userAgent: MAC_UA, memoriaGB: 8, nucleos: 8 });
        expect(r.agentes).toBe(3);
        expect(r.explica).toContain("al menos 3");
    });
    it("iPhone: no; memoria desconocida: no se inventa", () => {
        expect(estimarDesdeNavegador({ userAgent: IPHONE_UA, memoriaGB: 8 }).agentes).toBe(0);
        expect(estimarDesdeNavegador({ userAgent: MAC_UA }).agentes).toBeNull();
    });
    it("menos de 6 GB, Android, batería y datos móviles recortan", () => {
        expect(estimarDesdeNavegador({ userAgent: MAC_UA, memoriaGB: 4, nucleos: 8 }).agentes).toBe(0);
        expect(estimarDesdeNavegador({ userAgent: ANDROID_UA, memoriaGB: 8, nucleos: 8 }).agentes).toBe(1);
        expect(estimarDesdeNavegador({ userAgent: MAC_UA, memoriaGB: 8, nucleos: 8, bateria: { cargando: false, nivel: 0.5 } }).agentes).toBe(1);
        expect(estimarDesdeNavegador({ userAgent: MAC_UA, memoriaGB: 8, nucleos: 8, bateria: { cargando: false, nivel: 0.1 } }).agentes).toBe(0);
        expect(estimarDesdeNavegador({ userAgent: MAC_UA, memoriaGB: 8, nucleos: 8, redMedida: true }).agentes).toBe(1);
    });
});

const MAC: NeuronaColmena = {
    nodo: "mac-a1b2c3",
    vivo: true,
    so: "macos",
    enCurso: 3,
    contenedor: { activo: true, agentes: 3, apto: true, motivo: "" },
    // El texto del contrato (traspaso a otro contenedor) solo es verdad con el relevo cableado: aquí se prueba ese caso.
    relevoActivo: true,
};

describe("colmena · botones de una neurona", () => {
    it("la Mac trabajando: Desconectar (con confirmación) y Dejar de usar", () => {
        const b = botonesNeurona(MAC);
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: true, etiqueta: "Desconectar", confirmar: true });
        expect(b.desconectar.explica).toContain("3 agente(s)");
        expect(b.contenedor.etiqueta).toBe("Dejar de usar como contenedor");
        expect(b.instalar.visible).toBe(false);
    });
    it("sin trabajo en curso, el botón de desconectar está deshabilitado", () => {
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos", enCurso: 0 } as const);
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: false, etiqueta: "Desconectar" });
        expect(b.desconectar.explica).toBe("No tiene trabajo en curso: puedes apagarlo sin más.");
        expect(b.desconectar.confirmar).toBe(false);
    });
    it("con contenedor activo y sin trabajo en curso, el botón de desconectar está habilitado", () => {
        const b = botonesNeurona({ 
            nodo: "mac-a1b2c3", 
            vivo: true, 
            so: "macos", 
            enCurso: 0, 
            contenedor: { activo: true, agentes: 3, apto: true, motivo: "" } 
        } as const);
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: true, etiqueta: "Desconectar" });
        expect(b.contenedor).toMatchObject({ visible: true, habilitado: true, etiqueta: "Dejar de usar como contenedor" });
    });
    it("mostrar botón de desconectar cuando hay trabajo en curso con 1 agente", () => {
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos", enCurso: 1 } as const);
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: true, etiqueta: "Desconectar" });
        expect(b.desconectar.explica).toContain("1 agente");
        expect(b.desconectar.confirmar).toBe(true);
    });
    it("no apta: el botón se ve, desactivado, con el motivo", () => {
        const b = botonesNeurona({ ...MAC, contenedor: { activo: false, agentes: 0, apto: false, motivo: "Poco disco." } });
        expect(b.contenedor).toMatchObject({ visible: true, habilitado: false, explica: "Poco disco." });
    });
    it("desconectando: no se puede pulsar dos veces", () => {
        expect(botonesNeurona({ ...MAC, desconectando: true }).desconectar).toMatchObject({ habilitado: false, etiqueta: "Desconectando…" });
    });
    it("sin trabajador: solo instalar (y nunca en iPhone)", () => {
        const b = botonesNeurona({ nodo: null, vivo: true, so: "windows", enCurso: 0 });
        expect(b.desconectar.visible).toBe(false);
        expect(b.contenedor.visible).toBe(false);
        expect(b.instalar).toMatchObject({ visible: true, explica: "En Windows se instala dentro de WSL2." });
        expect(botonesNeurona({ nodo: null, vivo: true, so: "ios", enCurso: 0 }).instalar.visible).toBe(false);
    });
});

describe("colmena · sin la bandera del relevo se asume que NO está activo (basta de ilusiones)", () => {
    const sinBandera: NeuronaColmena = { nodo: "mac-a1b2c3", vivo: true, so: "macos", enCurso: 3, contenedor: { activo: false, agentes: 3, apto: true, motivo: "" } };
    it("Desconectar no promete traspaso y no es pulsable: no cambiaría nada", () => {
        const b = botonesNeurona(sinBandera);
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: false });
        expect(b.desconectar.explica).toContain("traspaso del trabajo a otro contenedor aún no está activo");
        expect(b.desconectar.explica).not.toContain("lo pasa a otro contenedor");
    });
    it("Usar como contenedor tampoco es pulsable: el líder aún no reparte tareas por esa marca", () => {
        const b = botonesNeurona(sinBandera);
        expect(b.contenedor).toMatchObject({ visible: true, habilitado: false, etiqueta: "Usar como contenedor (3 agentes)" });
        expect(b.contenedor.explica).toContain("reparto de tareas a contenedores aún no está activo");
    });
    it("Dejar de usar sí se puede (cambia algo real) y no pide confirmar: no para lo que corre", () => {
        const b = botonesNeurona({ ...sinBandera, contenedor: { activo: true, agentes: 3, apto: true, motivo: "" } });
        expect(b.contenedor).toMatchObject({ habilitado: true, etiqueta: "Dejar de usar como contenedor" });
        expect(b.contenedor.confirmar).toBe(false);
        expect(b.contenedor.explica).toContain("No para lo que ya esté corriendo");
    });
    it("con el relevo declarado, vuelve el comportamiento del contrato", () => {
        const b = botonesNeurona({ ...sinBandera, relevoActivo: true });
        expect(b.desconectar).toMatchObject({ habilitado: true, confirmar: true });
        expect(b.contenedor.habilitado).toBe(true);
    });
});

describe("colmena · comando y órdenes", () => {
    it("comando solo con origen https y código válido", () => {
        expect(comandoInstalar("https://a1.example.org", "AB12-CD34")).toBe(
            "curl -fsSL https://a1.example.org/trabajador.sh | bash -s -- --emparejar AB12-CD34",
        );
        expect(comandoInstalar("http://a1.example.org", "AB12-CD34")).toBeNull();
        expect(comandoInstalar("https://a1.example.org", "x; rm -rf ~")).toBeNull();
    });
    it("órdenes con los argumentos de la lista blanca", () => {
        expect(ordenDesconectar("mac-a1b2c3")).toEqual({ accion: "desconectar", para: "mac-a1b2c3", args: {} });
        expect(ordenContenedor("mac-a1b2c3", true, 9)).toEqual({ accion: "contenedor", para: "mac-a1b2c3", args: { activo: true, trabajadores: 4 } });
        expect(ordenContenedor("mac-a1b2c3", false, 3).args).toEqual({ activo: false });
    });
});
