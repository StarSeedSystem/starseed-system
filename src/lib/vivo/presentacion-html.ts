/**
 * Exportador a HTML autónomo de la presentación en vivo (DSN1025D, ficha lib-frontend-slides).
 * Un solo archivo: escenario fijo de 1080 px de alto escalado entero al visor, sin dependencias,
 * sin peticiones externas y sin animaciones de fondo ni de texto (el archivo es estático, y se
 * dice en un comentario). Núcleo puro: sin `node:*`, sin DOM y sin red.
 */
import { FONDOS_BURBUJA } from "@/lib/mensajeria/formato-tipos";
import { dimensionesDe, lienzoEfectivo, type Diapositiva, type MetaPresentacion } from "./presentacion";
import { escaparHtml, elementoAHtml, hexValido } from "./presentacion-html-piezas";

const ALTO_ESCENARIO = 1080;

function cssFondo(fondo: string | undefined): string {
    const hex = hexValido(fondo);
    if (hex) return `background-color:${hex}`;
    const burbuja = FONDOS_BURBUJA.find((b) => b.id === fondo);
    return burbuja ? `background:${burbuja.css}` : "";
}

function diapositivaAHtml(d: Diapositiva, meta: MetaPresentacion, activa: boolean): string {
    const l = lienzoEfectivo(d, meta);
    const factor = ALTO_ESCENARIO / l.alto;
    const elementos = [...l.elementos]
        .sort((a, b) => a.z - b.z)
        .map((el) => elementoAHtml(el, factor))
        .join("");
    return `<section class="slide${activa ? " active" : ""}" style="${cssFondo(l.fondo)}">${elementos}</section>`;
}

/** Hoja de estilo única del archivo. Visibilidad por visibility/opacity/pointer-events, JAMÁS display:none. */
function hojaEstilo(ancho: number): string {
    return [
        "html,body{margin:0;padding:0;background:#0B0D1A;color:#F8FAFC}",
        "body{height:100%;display:grid;place-items:center;overflow:hidden}",
        `#escenario{position:relative;overflow:hidden;transform-origin:center;width:${ancho}px;height:${ALTO_ESCENARIO}px;box-shadow:0 0 40px rgba(0,0,0,.6)}`,
        ".slide{position:absolute;inset:0;visibility:hidden;opacity:0;pointer-events:none;transition:opacity .3s ease}",
        ".slide.active{visibility:visible;opacity:1;pointer-events:auto}",
        "aside#notas{position:fixed;left:12px;bottom:12px;max-width:44ch;background:rgba(0,0,0,.8);padding:10px 14px;border-radius:8px;font-family:system-ui,sans-serif;font-size:14px;white-space:pre-wrap;z-index:10}",
        ".tareas{list-style:none;padding-left:0}",
        "@media (prefers-reduced-motion:reduce){.slide{transition:none}}",
    ].join("\n");
}

/** Único script del archivo: escala el escenario entero al visor y navega. Sin eval, sin red. */
function scriptNavegacion(ancho: number, alto: number): string {
    const W = String(ancho);
    const H = String(alto);
    return [
        "(function(){var s=document.getElementById(\"escenario\"),n=[].slice.call(document.querySelectorAll(\".slide\")),t=document.getElementById(\"notas\"),i=0;",
        "function ir(k){i=Math.max(0,Math.min(n.length-1,k));for(var j=0;j<n.length;j++)n[j].classList.toggle(\"active\",j===i);history.replaceState(null,\"\",\"#\"+(i+1));}",
        `function escala(){var e=Math.min(innerWidth/${W},innerHeight/${H});s.style.transform=\"scale(\"+e+\")\";}`,
        "addEventListener(\"resize\",escala);escala();",
        "addEventListener(\"keydown\",function(e){var k=e.key;if(k===\"ArrowRight\"||k===\"ArrowDown\"||k===\"PageDown\"||k===\" \")e.preventDefault(),ir(i+1);else if(k===\"ArrowLeft\"||k===\"ArrowUp\"||k===\"PageUp\")e.preventDefault(),ir(i-1);else if(k===\"Home\")ir(0);else if(k===\"End\")ir(n.length-1);else if((k===\"n\"||k===\"N\")&&t)t.hidden=!t.hidden;});",
        "addEventListener(\"hashchange\",function(){ir((parseInt(location.hash.slice(1),10)||1)-1);});",
        "var x=null;addEventListener(\"touchstart\",function(e){x=e.touches[0].clientX;},{passive:true});",
        "addEventListener(\"touchend\",function(e){if(x===null)return;var dx=e.changedTouches[0].clientX-x;if(Math.abs(dx)>40)ir(dx<0?i+1:i-1);x=null;},{passive:true});",
        "ir((parseInt(location.hash.slice(1),10)||1)-1);})();",
    ].join("\n");
}

/**
 * Presentación → HTML de un solo archivo: `<!doctype html>`, `lang="es"`, viewport, título
 * escapado, política CSP, un comentario con la fecha, UNA hoja de estilo y UN script.
 */
export function presentacionAHtml(
    meta: MetaPresentacion,
    diapositivas: Diapositiva[],
    opciones?: { fecha?: string; incluirNotas?: boolean },
): string {
    const dims = dimensionesDe(meta.proporcion);
    const ancho = Math.round((ALTO_ESCENARIO * dims.ancho) / dims.alto);
    const fecha = opciones?.fecha ?? new Date().toISOString().slice(0, 10);
    const secciones = diapositivas.map((d, i) => diapositivaAHtml(d, meta, i === 0)).join("\n");
    const notas = opciones?.incluirNotas
        ? `<aside id="notas" hidden>${escaparHtml(diapositivas.map((d) => d.notas ?? "").join("\n——\n"))}</aside>`
        : "";
    const cuerpo = [
        `<div id="escenario">${secciones}</div>`,
        notas,
        "<script>",
        scriptNavegacion(ancho, ALTO_ESCENARIO),
        "</script>",
    ].filter(Boolean).join("\n");
    return [
        "<!doctype html>",
        '<html lang="es">',
        "<head>",
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">`,
        `<title>${escaparHtml(meta.titulo || "Presentación")}</title>`,
        `<!-- Exportada el ${escaparHtml(fecha)} · archivo estático: sin animaciones de fondo ni de texto, sin fuentes ni CSS remotos -->`,
        "<style>",
        hojaEstilo(ancho),
        "</style>",
        "</head>",
        "<body>",
        cuerpo,
        "</body>",
        "</html>",
    ].join("\n");
}

/** «Mi charla ñandú» → «mi-charla-nandu.html»; vacío → «presentacion.html». */
export function nombreArchivoPresentacion(meta: Pick<MetaPresentacion, "titulo">): string {
    const base = (meta.titulo ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
    return `${base || "presentacion"}.html`;
}

