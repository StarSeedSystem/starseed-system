import { describe, it, expect } from "vitest";
import { desdeXliff, desdeStringsApple, desdeStringsAndroid, type ResultadoImportacion } from "../importar-xml-strings";

describe("desdeXliff", () => {
    it("importa XLIFF 1.2 con trans-unit, source y target", () => {
        const xliff12 = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2">
    <file original="test" datatype="plaintext">
        <body>
            <trans-unit id="hola" resname="hola">
                <source>Hello</source>
                <target>Hola</target>
            </trans-unit>
            <trans-unit id="mundo" resname="mundo">
                <source>World</source>
                <target>Mundo</target>
            </trans-unit>
        </body>
    </file>
</xliff>`;

        const resultado = desdeXliff(xliff12);
        expect(resultado.entradas.hola).toBe("Hola");
        expect(resultado.entradas.mundo).toBe("Mundo");
        expect(resultado.descartadas).toHaveLength(0);
    });

    it("importa XLIFF 2.0 con unit, segment, source y target", () => {
        const xliff20 = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="2.0" xmlns="urn:oasis:names:tc:xliff:document:2.0">
    <file id="test">
        <unit id="bienvenido">
            <segment>
                <source>Welcome</source>
                <target>Bienvenido</target>
            </segment>
        </unit>
        <unit id="gracias">
            <segment>
                <source>Thanks</source>
                <target>Gracias</target>
            </segment>
        </unit>
    </file>
</xliff>`;

        const resultado = desdeXliff(xliff20);
        expect(resultado.entradas.bienvenido).toBe("Bienvenido");
        expect(resultado.entradas.gracias).toBe("Gracias");
    });

    it("decodifica entidades XML basicas", () => {
        const xliff = `<xliff version="1.2"><file><body>
            <trans-unit id="test">
                <source>& < > " &apos;</source>
                <target>& < > " &apos;</target>
            </trans-unit>
        </body></file></xliff>`;

        const resultado = desdeXliff(xliff);
        expect(resultado.entradas.test).toBe("& < > \" '");
    });

    it("descarta valores que contienen etiquetas XML", () => {
        const xliff = `<xliff version="1.2"><file><body>
            <trans-unit id="con_etiqueta">
                <source>Bold</source>
                <target><b>Negrita</b></target>
            </trans-unit>
            <trans-unit id="sin_etiqueta">
                <source>Normal</source>
                <target>Normal</target>
            </trans-unit>
        </body></file></xliff>`;

        const resultado = desdeXliff(xliff);
        expect(resultado.entradas.sin_etiqueta).toBe("Normal");
        expect(resultado.descartadas).toHaveLength(1);
        expect(resultado.descartadas[0].clave).toBe("con_etiqueta");
        expect(resultado.descartadas[0].motivo).toContain("etiquetas");
    });

    it("XML roto devuelve vacio con aviso", () => {
        const xliffRoto = `esto no es xml valido <trans-unit id="test"><source>Hola</source>`;
        const resultado = desdeXliff(xliffRoto);
        expect(Object.keys(resultado.entradas)).toHaveLength(0);
    });
});

describe("desdeStringsApple", () => {
    it("importa formato basico clave = valor", () => {
        const strings = `"hola" = "Hola";
"mundo" = "Mundo";
"despedida" = "Adiós";`;

        const resultado = desdeStringsApple(strings);
        expect(resultado.entradas.hola).toBe("Hola");
        expect(resultado.entradas.mundo).toBe("Mundo");
        expect(resultado.entradas.despedida).toBe("Adiós");
    });

    it("ignora comentarios de bloque /* ... */", () => {
        const strings = `/* Esto es un comentario */
"hola" = "Hola";
/* Otro
comentario
multilinea */
"mundo" = "Mundo";`;

        const resultado = desdeStringsApple(strings);
        expect(resultado.entradas.hola).toBe("Hola");
        expect(resultado.entradas.mundo).toBe("Mundo");
    });

    it("ignora comentarios de linea //", () => {
        const strings = `// Comentario de linea
"hola" = "Hola";
"mundo" = "Mundo"; // Comentario al final`;

        const resultado = desdeStringsApple(strings);
        expect(resultado.entradas.hola).toBe("Hola");
        expect(resultado.entradas.mundo).toBe("Mundo");
    });

    it("decodifica escapes comunes", () => {
        const strings = `"nueva_linea" = "L\\u00ednea 1\\nL\\u00ednea 2";
"tabulador" = "Col1\\tCol2";
"comillas" = "El dice \\"Hola\\"";
"barra" = "Ruta: C:\\\\Windows";`;

        const resultado = desdeStringsApple(strings);
        expect(resultado.entradas.nueva_linea).toBe("Línea 1\nLínea 2");
        expect(resultado.entradas.tabulador).toBe("Col1\tCol2");
        expect(resultado.entradas.comillas).toBe('El dice "Hola"');
        expect(resultado.entradas.barra).toBe("Ruta: C:\\Windows");
    });

    it("decodifica entidades XML basicas", () => {
        const strings = `"test" = "& < > \\" &apos;";`;
        const resultado = desdeStringsApple(strings);
        expect(resultado.entradas.test).toBe("& < > \" '");
    });

    it("descarta valores que contienen etiquetas XML", () => {
        const strings = `"con_etiqueta" = "<b>Negrita</b>";
"sin_etiqueta" = "Normal";`;

        const resultado = desdeStringsApple(strings);
        expect(resultado.entradas.sin_etiqueta).toBe("Normal");
        expect(resultado.descartadas).toHaveLength(1);
        expect(resultado.descartadas[0].clave).toBe("con_etiqueta");
    });
});

describe("desdeStringsAndroid", () => {
    it("importa strings.xml basico", () => {
        const xml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="hola">Hola</string>
    <string name="mundo">Mundo</string>
</resources>`;

        const resultado = desdeStringsAndroid(xml);
        expect(resultado.entradas.hola).toBe("Hola");
        expect(resultado.entradas.mundo).toBe("Mundo");
    });

    it("descarta translatable=false", () => {
        const xml = `<resources>
    <string name="no_traducir" translatable="false">No traducir</string>
    <string name="traducir">Traducir</string>
</resources>`;

        const resultado = desdeStringsAndroid(xml);
        expect(resultado.entradas.traducir).toBe("Traducir");
        expect(resultado.entradas.no_traducir).toBeUndefined();
        expect(resultado.avisos.some(a => a.includes("no traducible"))).toBe(true);
    });

    it("convierte %1$s, %2$s, %s a {0}, {1}, {0}", () => {
        const xml = `<resources>
    <string name="uno">Hola %1$s</string>
    <string name="dos">%1$s y %2$s</string>
    <string name="simple">Hola %s</string>
</resources>`;

        const resultado = desdeStringsAndroid(xml);
        expect(resultado.entradas.uno).toBe("Hola {0}");
        expect(resultado.entradas.dos).toBe("{0} y {1}");
        expect(resultado.entradas.simple).toBe("Hola {0}");
    });

    it("decodifica escapes y entidades", () => {
        const xml = `<resources>
    <string name="comillas">El dice \\"Hola\\"</string>
    <string name="apostrofe">No \\'es\\' malo</string>
    <string name="nueva_linea">Linea 1\\nLinea 2</string>
    <string name="entidades">& < ></string>
</resources>`;

        const resultado = desdeStringsAndroid(xml);
        expect(resultado.entradas.comillas).toBe('El dice "Hola"');
        expect(resultado.entradas.apostrofe).toBe("No 'es' malo");
        expect(resultado.entradas.nueva_linea).toBe("Linea 1\nLinea 2");
        expect(resultado.entradas.entidades).toBe("& < >");
    });

    it("descarta valores que contienen etiquetas XML", () => {
        const xml = `<resources>
    <string name="con_etiqueta"><b>Negrita</b></string>
    <string name="sin_etiqueta">Normal</string>
</resources>`;

        const resultado = desdeStringsAndroid(xml);
        expect(resultado.entradas.sin_etiqueta).toBe("Normal");
        expect(resultado.descartadas).toHaveLength(1);
        expect(resultado.descartadas[0].clave).toBe("con_etiqueta");
    });

    it("XML roto devuelve vacio", () => {
        const xmlRoto = `esto no es xml <string name="test">valor`;
        const resultado = desdeStringsAndroid(xmlRoto);
        expect(Object.keys(resultado.entradas)).toHaveLength(0);
    });
});

describe("limites y avisos", () => {
    it("texto muy grande genera aviso", () => {
        const grande = "x".repeat(6_000_000);
        const resultado = desdeXliff(grande);
        expect(resultado.avisos.some(a => a.includes("límite"))).toBe(true);
    });

    it("muchas entradas respeta limite", () => {
        const muchas = Array.from({ length: 60_000 }, (_, i) =>
            `<trans-unit id="k${i}"><source>s${i}</source><target>t${i}</target></trans-unit>`
        ).join("");
        const xliff = `<xliff version="1.2"><file><body>${muchas}</body></file></xliff>`;
        const resultado = desdeXliff(xliff);
        expect(Object.keys(resultado.entradas).length).toBeLessThanOrEqual(50_000);
    });
});