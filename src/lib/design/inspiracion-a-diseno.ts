// inspiracion-a-diseno.ts — de referencia a diseño propio (RFI1018G). Módulo PURO: de las
// tarjetas de `referencias.buscar` (RFI1018F) sale un brief (patrón en palabras propias,
// nombre nuevo, tokens del contexto y créditos). Se cita, nunca se copia nada de terceros.
import { CURVA, DURACION } from "@/lib/design/movimiento";
/** Objetivo de la pieza que se diseña tomando la referencia como inspiración. */
export type ObjetivoDiseno = "menu" | "boton" | "transicion" | "animacion" | "seccion" | "pagina" | "marca" | "escena3d" | "xr";
/** Tarjeta de F (RFI1018F) o entrada del catálogo, resumida; campos opcionales. */
export interface ReferenciaBrief { id?: string; nombre?: string; url?: string; que_es?: string; porque?: string; enlaces?: Array<{ titulo?: string; url?: string }>; og_imagen?: string }
/** El registro de movimiento y los nombres fijos de la identidad del contexto. */
export interface AdnContexto { nombre?: string; registro?: "sobrio" | "expresivo" | "experimental"; tipografia?: string }
/** Dónde va la pieza y qué tokens del tema del contexto lleva encima. */
export interface ContextoBrief { tipo?: string; area?: string; entidad?: string; tokens?: Record<string, string> }
/** Regla de la casa (C): principio de usabilidad o redacción, tal cual vino. */
export type Principio = string | { titulo: string; descripcion?: string };
/** Referencia citada como inspiración en el resultado. */
export interface Credito { nombre: string; url: string }
/** El patrón, en palabras propias y con parámetros concretos. */
export interface PatronDiseno { estructura: string; jerarquia: string; ritmo: string; movimiento: { duracionMs: number; curva: string; resorte?: string }; tipografia: string }
/** Lo que llega a la mesa del Director de diseño. */
export interface BriefDiseno { nombre: string; objetivo: ObjetivoDiseno; patron: PatronDiseno; tokens: Record<string, string>; creditos: Credito[]; texto: string }
const PIEZA: Record<ObjetivoDiseno, string> = { menu: "Faro", boton: "Pulso", transicion: "Puente", animacion: "Latido", seccion: "Umbral", pagina: "Marco", marca: "Sello", escena3d: "Cámara", xr: "Presencia" };
const TIEMPO: Record<ObjetivoDiseno, { ms: number; curva: string; resorte: string }> = {
  menu: { ms: DURACION.rapido, curva: CURVA.entrada, resorte: "sin resorte: el borde guía" },
  boton: { ms: DURACION.instantaneo, curva: CURVA.elastico, resorte: "resorte corto (rigidez 260, amortiguación 24)" },
  transicion: { ms: DURACION.normal, curva: CURVA.suave, resorte: "sin resorte: ida y vuelta simétricas" },
  animacion: { ms: DURACION.escena, curva: CURVA.suave, resorte: "resorte suave (rigidez 120, amortiguación 20)" },
  seccion: { ms: DURACION.pausado, curva: CURVA.suave, resorte: "sin resorte" },
  pagina: { ms: DURACION.pausado, curva: CURVA.entrada, resorte: "sin resorte" },
  marca: { ms: DURACION.escena, curva: CURVA.suave, resorte: "sin resorte: firme y sin rebote" },
  escena3d: { ms: DURACION.escena, curva: CURVA.suave, resorte: "resorte de cámara lenta (rigidez 60, amortiguación 30)" },
  xr: { ms: DURACION.escena, curva: CURVA.suave, resorte: "resorte muy amortiguado: que la escala no maree" },
};
const PATRONES: Record<ObjetivoDiseno, [estructura: string, jerarquia: string, ritmo: string]> = {
  menu: ["Filas de una sola línea con señuelo, apoyadas en un borde; nunca nube de iconos", "El acceso donde estás se marca con una línea guía, no con color suelto", "Aparición en cascada de arriba abajo, con tope para que nadie espere"],
  boton: ["Una pastilla, una palabra y un punto de estado; nada de doble texto", "La acción principal pesa; la secundaria se apaga y se agrupa", "Entra cuando el dedo entra y resuelve al soltarlo"],
  transicion: ["Puente entre dos estados que comparte un único ancla visual", "Lo que entra llega por la ruta del foco; lo que sale, por la opuesta", "Una sola curva y una sola duración para la ida y la vuelta"],
  animacion: ["Gota con principio, medio y final de un solo cambio; bucle sin costura", "Un tema dominante que respira y un detalle secundario que acompaña", "Al compás del texto: frases de 2 a 8 segundos"],
  seccion: ["Bloque con titular, cuerpo y un solo vacío que abre la mirada hacia el foco", "Un foco único por sección; el resto lee, no compite", "Respiro en escalera Fibonacci al pasar de un bloque al siguiente"],
  pagina: ["Rejilla áurea 1:1,618 con el contenido en la columna ancha", "El título domina y el cuerpo respira debajo; nada justo en el centro", "Entrada en dos tiempos: marco primero, contenido después"],
  marca: ["Un gesto gráfico repetido (relación simple, tipo φ) sobre superficie limpia", "El nombre y un punto de giro; sin mascotas ni sellos recargados", "Aparecer definido, no estirado: el sello ya llega pensado"],
  escena3d: ["Sólido platónico como fondo y la pieza en un tercio, nunca en el centro", "Un solo foco iluminado; el resto vive por silueta", "Órbita a mano: el usuario manda sobre la cámara siempre"],
  xr: ["Primero el confort del usuario: nada de pantallas ancladas a la cara", "La jerarquía se lee por distancia, no por tamaño", "Todo movimiento lento y con tope: mareo cero"],
};
const TOKENS_TRINITY: Record<string, string> = { "cénit-guía": "#007FFF", "horizonte-creación": "#10B981", "lógica-control": "#FFBF00", "ancla-escasa": "#DC143C" };
const TIPOGRAFIA_DEFECTO = "Inter para el cuerpo y Rajdhani para el titular, escala φ, espaciado Fibonacci";
const creditoDe = (r: ReferenciaBrief): Credito => ({ nombre: r.nombre ?? r.id ?? "referencia sin nombre", url: r.url ?? r.enlaces?.[0]?.url ?? "(sin enlace citado)" });
/** Duración, curva y resorte del objetivo, moduladas por el registro del ADN. */
function movimientoDe(objetivo: ObjetivoDiseno, registro: string): PatronDiseno["movimiento"] {
  const base = TIEMPO[objetivo];
  const factor = registro === "experimental" ? 1.5 : registro === "expresivo" ? 1.2 : 1;
  const sobrio = registro === "sobrio";
  return { duracionMs: Math.round(base.ms * factor), curva: sobrio ? CURVA.suave : base.curva, resorte: sobrio ? "sin resorte: sobriedad" : base.resorte };
}
/** El brief para el Director de diseño: patrón propio, tokens y créditos (tope 2.500). */
export function briefDesdeReferencias(s: { referencias: ReferenciaBrief[]; objetivo: ObjetivoDiseno; contexto?: ContextoBrief; adn?: AdnContexto; principios?: Principio[] }): BriefDiseno {
  const objetivo = s.objetivo, registro = s.adn?.registro ?? "sobrio";
  const [estructura, jerarquia, ritmo] = PATRONES[objetivo];
  const patron: PatronDiseno = { estructura, jerarquia, ritmo, movimiento: movimientoDe(objetivo, registro), tipografia: s.adn?.tipografia ?? TIPOGRAFIA_DEFECTO };
  const tokens = s.contexto?.tokens && Object.keys(s.contexto.tokens).length ? s.contexto.tokens : TOKENS_TRINITY;
  const nombre = `${PIEZA[objetivo]} de ${s.adn?.nombre ?? s.contexto?.entidad ?? "la sesión"}`;
  const creditos = s.referencias.map(creditoDe);
  const reglas = (s.principios ?? []).slice(0, 3).map((p) => (typeof p === "string" ? p : p.titulo));
  const refs = s.referencias.map((r) => (r.porque ?? r.que_es ?? "").trim() && `· ${r.que_es ?? r.porque}`.trim()).filter(Boolean).slice(0, 4).join("\n");
  const texto = [
    `Pieza: «${nombre}» · objetivo ${objetivo}${s.contexto?.area ? ` · ${s.contexto.area}` : ""}${s.contexto?.tipo ? ` (${s.contexto.tipo})` : ""}.`,
    `Patrón — estructura: ${estructura}. Jerarquía: ${jerarquia}. Ritmo: ${ritmo}.`,
    `Movimiento: ${patron.movimiento.duracionMs} ms, curva ${patron.movimiento.curva}, ${patron.movimiento.resorte}.`,
    `Tipografía (emparejamiento propio): ${patron.tipografia}.`,
    `Tokens del contexto: ${Object.entries(tokens).map(([k, v]) => `${k} ${v}`).join("; ")}.`,
    reglas.length ? `Reglas de la casa:\n${reglas.map((r) => `· ${r}`).join("\n")}` : "",
    refs && `Qué se estudia (solo el patrón):\n${refs}`,
    `Créditos — inspiración citada, diseño propio: ${creditos.map((c) => `${c.nombre} (${c.url})`).join("; ")}.`,
    "Límite: nada se copia — ni frases de más de 8 palabras seguidas, ni marcas, ni logos, ni assets de terceros.",
  ].filter(Boolean).join("\n").slice(0, 2500);
  return { nombre, objetivo, patron, tokens, creditos, texto };
}
export type Verificacion = { ok: true } | { ok: false; motivos: string[] };
const HOSTS_PROPIOS = new Set(["localhost", "127.0.0.1", "starseed-os.vercel.app", "astraura-nube.vercel.app"]);
const RE_ASSET = /\.(png|jpe?g|webp|gif|svg|avif|mp4|webm|mov|lottie|woff2?|ttf|otf)$/i;
const RE_URL = /https?:\/\/[^\s"'<>()]+/gi;
const palabrasDe = (t: string): string[] => t.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
/** ¿El resultado arrastró una frase de la referencia por encima de 8 palabras seguidas? */
function fraseRepetida(resultado: string, referencias: ReferenciaBrief[]): string | null {
  const destino = palabrasDe(resultado).join(" ");
  for (const r of referencias) {
    const fuentes = [r.nombre, r.que_es, r.porque, ...(r.enlaces ?? []).map((e) => e.titulo ?? "")].filter(Boolean) as string[];
    for (const fuente of fuentes) {
      const origen = palabrasDe(fuente);
      for (let i = 0; i + 9 <= origen.length; i++) {
        const trozo = origen.slice(i, i + 9).join(" ");
        if (destino.includes(trozo)) return `Texto copiado de «${r.nombre ?? r.id}»: ${trozo}`;
      }
    }
  }
  return null;
}
/** ¿El resultado incrusta una imagen, vídeo, fuente o logo que no es del OS? */
function assetsDeTerceros(resultado: string, referencias: ReferenciaBrief[]): string[] {
  const motivos: string[] = [];
  for (const cruda of resultado.match(RE_URL) ?? []) {
    try {
      const url = new URL(cruda.replace(/[.,;)]+$/, ""));
      const deLaReferencia = referencias.some((r) => r.og_imagen && cruda.startsWith(r.og_imagen));
      if (deLaReferencia || (RE_ASSET.test(url.pathname) && !HOSTS_PROPIOS.has(url.hostname)))
        motivos.push(`${deLaReferencia ? "Portada (logo) de la referencia" : "Asset de tercero"}: ${url.href}`);
    } catch {
      // no es una URL interpretable: no se opina sobre ella
    }
  }
  return motivos;
}
/** Rechaza el resultado si copia frases largas de las referencias o usa sus logos y assets. */
export function validarResultado(resultado: string, referencias: ReferenciaBrief[]): Verificacion {
  const motivos: string[] = [];
  const frase = fraseRepetida(resultado, referencias);
  if (frase) motivos.push(frase);
  motivos.push(...assetsDeTerceros(resultado, referencias));
  return motivos.length ? { ok: false, motivos } : { ok: true };
}
