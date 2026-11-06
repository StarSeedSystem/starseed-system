import { describe, it, expect } from "vitest";
import { buildSandboxDoc } from "../post-blocks";

describe("buildSandboxDoc", () => {
    it("genera documento HTML base para lenguaje html", () => {
        const doc = buildSandboxDoc({ code: "<h1>Hola</h1>", language: "html" });
        expect(doc).toContain("<!doctype html>");
        expect(doc).toContain("<h1>Hola</h1>");
        expect(doc).toContain("box-sizing:border-box");
        expect(doc).toContain("color:#e7e7ee");
    });

    it("genera documento con estilo inyectado para lenguaje css", () => {
        const doc = buildSandboxDoc({ code: ".preview{color:red}", language: "css" });
        expect(doc).toContain("<style>.preview{color:red}</style>");
        expect(doc).toContain('class="preview"');
    });

    it("genera documento con script para lenguaje js", () => {
        const doc = buildSandboxDoc({ code: "console.log('hola')", language: "js" });
        expect(doc).toContain('<div id="app"></div>');
        expect(doc).toContain("<script>console.log('hola')</script>");
    });

    it("genera documento con React y Babel vía CDN para lenguaje jsx", () => {
        const doc = buildSandboxDoc({
            code: "function App(){return <h1>Hola</h1>}",
            language: "jsx",
        });
        expect(doc).toContain('id="root"');
        expect(doc).toContain('type="text/babel"');
        expect(doc).toContain("data-presets=\"react\"");
        expect(doc).toContain("unpkg.com/react@18/umd/react.production.min.js");
        expect(doc).toContain("unpkg.com/react-dom@18/umd/react-dom.production.min.js");
        expect(doc).toContain("unpkg.com/@babel/standalone/babel.min.js");
    });

    it("incluye SRI integrity y crossorigin en scripts de unpkg para jsx", () => {
        const doc = buildSandboxDoc({ code: "<App/>", language: "jsx" });
        expect(doc).toContain('integrity="sha384-DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z"');
        expect(doc).toContain('integrity="sha384-gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1"');
        expect(doc).toContain('integrity="sha384-r5Ldzi45mT2cLBHDFFiSsTooTu4rFdkBdx9D50zWqSmJ8FLuJkQQTF7h6ERx/NX0"');
        expect(doc).toContain('crossorigin="anonymous"');
    });

    it("escapa cierre de script en código de usuario", () => {
        const doc = buildSandboxDoc({ code: "</script>alert(1)", language: "js" });
        expect(doc).toContain("<\\/script>alert(1)");
        expect(doc).not.toContain("</script>alert(1)");
    });

    it("devuelve documento base si código está vacío", () => {
        const doc = buildSandboxDoc({ code: "", language: "html" });
        expect(doc).toContain("<!doctype html>");
        expect(doc).toContain("box-sizing:border-box");
        expect(doc).toContain("color:#e7e7ee");
    });

    it("respeta documento HTML completo si ya trae etiqueta html", () => {
        const fullHtml = "<html><head></head><body>Completo</body></html>";
        const doc = buildSandboxDoc({ code: fullHtml, language: "html" });
        expect(doc).toBe(fullHtml);
    });
});