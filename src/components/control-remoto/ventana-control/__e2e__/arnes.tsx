/** VEN1115L · punto de entrada del arnés de Playwright: monta la página de prueba sin Next (parámetros ?modo= &nivel= &giro=). */
import { createRoot } from "react-dom/client";
import { HistoriaVentanaControl } from "../historia";

const q = new URLSearchParams(location.search);
const giro = Number(q.get("giro") ?? 0) as 0 | 90 | 180 | 270;
createRoot(document.getElementById("raiz")!).render(<HistoriaVentanaControl modo={q.get("modo") === "pagina" ? "pagina" : "flotante"} nivel={q.get("nivel") === "ver" ? "ver" : "controlar"} giro={giro} />);
