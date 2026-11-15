/** VEN1115L · punto de entrada del arnés de Playwright: monta la página de prueba sin Next (parámetros ?modo= &nivel= &giro=). UNI1115M: ?vista=panel monta el panel con una app nativa falsa. */
import { createRoot } from "react-dom/client";
import { HistoriaVentanaControl } from "../historia";
import { ControlEntreNeuronasPanel } from "../../banda-control";

const q = new URLSearchParams(location.search);
const giro = Number(q.get("giro") ?? 0) as 0 | 90 | 180 | 270;
if (q.get("vista") === "panel") {
    // Una tableta falsa: lo nativo contesta como `control_capacidades` y `control_entrada_aceptados` (UNI1115M).
    (window as unknown as { __TAURI__: unknown }).__TAURI__ = {
        core: {
            invoke: async (c: string) => {
                if (c === "control_capacidades") return { pantalla: { accesibilidad: false, proyeccion: false, sin_preguntar: false }, entrada: { gestos: false, max_dedos: 0, teclas: [], volumen: false, brillo: false, texto: false }, falta: ["servicio-accesibilidad", "ajustes-restringidos", "consentimiento-pantalla", "escribir-ajustes"] };
                if (c === "control_entrada_aceptados") return { ok: true, controladores: [{ huella: "ab12cd34", nombre: "Mac de Alex", codigo: "123-456" }] };
                if (c === "control_neuronas_estado") return { indicador_posible: true, falta: [] };
                return { ok: true };
            },
        },
    };
    createRoot(document.getElementById("raiz")!).render(<div className="min-h-screen bg-[#05070d] p-4 text-white"><ControlEntreNeuronasPanel /></div>);
} else {
    createRoot(document.getElementById("raiz")!).render(<HistoriaVentanaControl modo={q.get("modo") === "pagina" ? "pagina" : "flotante"} nivel={q.get("nivel") === "ver" ? "ver" : "controlar"} giro={giro} />);
}
