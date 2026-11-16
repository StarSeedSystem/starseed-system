import { describe, it, expect } from "vitest";
import { desdeXliff, desdeStringsApple, desdeStringsAndroid } from "../importar-xml-strings";

describe("importar-xml-strings", () => {
    it("desdeXliff debe extraer objetivos", () => {
        const xml = `
        <trans-unit id="welcome">
            <source>Welcome</source>
            <target>Bienvenido</target>
        </trans-unit>
        `;
        const res = desdeXliff(xml);
        expect(res.entradas.welcome).toBe("Bienvenido");
    });

    it("desdeXliff debe descartar etiquetas", () => {
        const xml = `
        <trans-unit id="bad">
            <source>Bad</source>
            <target><b>Tag</b></target>
        </trans-unit>
        `;
        const res = desdeXliff(xml);
        expect(res.descartadas).toContain("bad");
    });

    it("desdeStringsApple debe extraer claves", () => {
        const str = `"welcome" = "Bienvenido";`;
        const res = desdeStringsApple(str);
        expect(res.entradas.welcome).toBe("Bienvenido");
    });

    it("desdeStringsAndroid debe extraer y convertir", () => {
        const xml = `<string name="welcome">Bienvenido %s y %1$s</string>`;
        const res = desdeStringsAndroid(xml);
        expect(res.entradas.welcome).toBe("Bienvenido {0} y {0}");
    });

    it("desdeStringsAndroid debe descartar translatable=false", () => {
        const xml = `<string name="skip" translatable="false">No</string>`;
        const res = desdeStringsAndroid(xml);
        expect(res.entradas.skip).toBeUndefined();
    });

    it("desdeXliff con XLIFF 2.0 debe extraer objetivos", () => {
        const xml = `
        <unit id="fragment1">
            <segment>
                <source>Hello</source>
                <target>Hola</target>
            </segment>
        </unit>
        `;
        const res = desdeXliff(xml);
        expect(res.entradas.fragment1).toBe("Hola");
    });

    it("desdeXliff con XML roto debe devolver aviso", () => {
        const res = desdeXliff("");
        expect(res.avisos).toContain("Texto vacío o inválido");
    });

    it("desdeStringsApple maneja escapes", () => {
        const str = `"msg" = "Line1\\nLine2";`;
        const res = desdeStringsApple(str);
        expect(res.entradas.msg).toBe("Line1\nLine2");
    });

    it("desdeStringsAndroid maneja escapes", () => {
        const xml = `<string name="msg">Línea\\nnueva\\'comilla'</string>`;
        const res = desdeStringsAndroid(xml);
        expect(res.entradas.msg).toBe("Línea\nnueva'comilla'");
    });
});
