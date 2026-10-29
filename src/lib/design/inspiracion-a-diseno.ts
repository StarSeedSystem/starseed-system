// inspiracion-a-diseno.ts — de referencia a diseño propio (RFI1018G · tarea G)
// Módulo PURO: sin red, sin reloj ni disco; tarjeta de `referencias.buscar` (F), catálogo, ADN y
// principios van inyectados. De una referencia citada sale un diseño PROPIO: patrón reexpresado,
// nombre nuevo, tokens del contexto y créditos; nunca texto, marca ni assets del tercero.
import type { EntradaReferencia } from "@/lib/library/referencias/catalogo";
import type { TarjetaReferencia } from "@/lib/library/referencias/buscar-referencias";
import type { RegistroMovimiento } from "./registros-movimiento";
import type { PrincipioUsabilidad } from "./principios-referencia";
import { CURVA, DURACION } from "./movimiento";

export type ObjetivoDiseno = "menu" | "boton" | "transicion" | "animacion" | "seccion" | "pagina" | "marca" | "escena3d" | "xr";
export interface ContextoDiseno { nombre?: string; tema?: string; registro?: unknown; tokens: Record<string, string> }
/** Referencia que entra al brief: tarjeta de F («entradaId») + su entrada resuelta en el catálogo. */
export interface ReferenciaBrief { tarjeta?: Pick<TarjetaReferencia, "entradaId">; entrada: EntradaReferencia }
export interface AdnDisenoBrief { tema?: string; movimiento?: string; claves?: string[] }
export interface PeticionBrief {
  referencias: readonly ReferenciaBrief[]; objetivo: ObjetivoDiseno; contexto: ContextoDiseno;
  adn?: AdnDisenoBrief | string | string[]; principios?: readonly PrincipioUsabilidad[];
}
export interface BriefDiseno {
  objetivo: ObjetivoDiseno;
  /** Nombre NUEVO de la pieza; jamás el nombre de una referencia. */
  nombre: string;
  /** Patrones estudiados, reexpresados en palabras propias (uno por tema). */
  patron: string[];
  jerarquia: string; ritmo: string;
  /** Movimiento: duración, curva y resorte de la gramática del OS, con su registro. */
  movimiento: { duracionMs: number; curva: string; resorte: { rigidez: number; amortiguacion: number }; notas: string };
  /** Emparejamiento tipográfico: como mucho dos familias por pieza. */
  emparejamientoTipografico: { titulares: string; cuerpo: string };
  /** Tokens del tema del contexto, tal cual entraron. */
  tokens: Record<string, string>;
  principios: string[];
  /** Créditos: la referencia citada, su clase de uso y su url. */
  creditos: string[];
}
export interface ValidacionDiseno { valido: boolean; motivos: string[] }

// ── reglas internas, en palabras propias (nada de texto de los terceros) ──
const OBJETIVOS: readonly ObjetivoDiseno[] = ["menu", "boton", "transicion", "animacion", "seccion", "pagina", "marca", "escena3d", "xr"];
const esObjetivo = (o: unknown): o is ObjetivoDiseno => typeof o === "string" && (OBJETIVOS as readonly string[]).includes(o);
const NOMBRE_O: Record<ObjetivoDiseno, string> = { menu: "Carta", boton: "Pastilla", transicion: "Paso", animacion: "Trino", seccion: "Cámara", pagina: "Lienzo", marca: "Emblema", escena3d: "Orbe", xr: "Umbral" };
const NOMBRE_TEMA: Record<string, string> = { "ia-diseno": "Generativa", guias: "Senda", movimiento: "Corriente", marca: "Cresta", "tipografia-iconos": "Glifos", "inspiracion-ui": "Vitrina", reglas: "Brújula" };
const PATRONES_TEMA: Record<string, string> = {
  "ia-diseno": "Una pieza protagonista: la propuesta ocurre al centro y la persona la toma o la deja; lo demás queda a un gesto.", guias: "Senda por fases con la fase en curso marcada y la ruta entera visible; el proceso no se infiere a solas.",
  movimiento: "Entrada desde el borde más cercano al gesto y regreso a él, con la secuencia encadenada en cascada.", marca: "Insignia propia: espiral o pliegue nuevos con crecimiento áureo; la pieza nace del centro y vuelve a él.",
  "tipografia-iconos": "Dos voces como mucho: titulares y cuerpo con escalas fijas y peso aireado; ni una tercera por entusiasmo.", "inspiracion-ui": "Jerarquía en capas de cristal: primero lo que responde, después lo que se lee; el centro libre, mandos del borde.",
  reglas: "Se escanea antes de leerse: subtítulos que digan la idea, pocas palabras y una instrucción por frase.",
};
const PATRON_GENERICO = "Patrón reexpresado con forma, ritmo y nombres propios: se estudia la estructura de la referencia, no su piel; nada se copia.";
const JERARQUIA_O: Record<ObjetivoDiseno, string> = {
  menu: "Opción crítica arriba y el resto en cascada; los iconos comparten peso y la selección toma el acento del tema.", boton: "Una acción por pastilla: un primario único, el secundario del borde y el ancla reservado al error.",
  transicion: "Un plano manda por vista: origen compartido en el centro y velocidad de llegada común.", animacion: "Un sujeto por escena; el resto acompaña con menor escala y ninguna capa extra de brillo.",
  seccion: "Bloques de arriba abajo con subtítulo propio; el foco llama donde la persona ya miró.", pagina: "Foco al centro, título cerca del eje óptico y el rastro de navegación en el borde inferior.",
  marca: "Un símbolo, un color y un silencio alrededor; la firma no compite con el contenido.", escena3d: "Objeto en el centro óptico, luz que entra arriba a la derecha y recorrido de cámara corto.",
  xr: "Profundidad sobre movimiento: la información delante y el mundo detrás, sin capas pegadas a la cara.",
};
const RITMO_O: Record<ObjetivoDiseno, string> = {
  menu: "Cascada de 40 ms entre opciones, con tope de 240 ms; la primera opción entra antes que ninguna otra.", boton: "La respuesta al gesto llega en una respiración y se calma sola; nunca un latido en bucle.",
  transicion: "Un cambio de estado por vez, con corte invisible entre vistas.", animacion: "Respira con su propio ciclo, sin acelerar ni repetir el gesto de la interfaz.",
  seccion: "Escalona los bloques de arriba abajo, con retardos cortos y sin atropello.", pagina: "La escena despierta del centro hacia fuera y remata en reposo.",
  marca: "Un golpe y su eco: la pieza llega al reposo y no se repite en bucle.", escena3d: "Cámara con inercia suave; el objeto manda y la cámara no hace cine.",
  xr: "El gesto trae la capa del frente; el vaivén pequeño no marea.",
};
const TIPOGRAFIAS: readonly { claves: string[]; titulares: string; cuerpo: string }[] = [
  { claves: ["editorial", "premium", "lujo", "sofisticado"], titulares: "Satoshi (vía CSS alojada de Fontshare; nunca empaquetar sus archivos)", cuerpo: "Inter" }, { claves: ["tecnico", "cifras", "datos", "codigo"], titulares: "Rajdhani", cuerpo: "Inter" },
  { claves: ["organico", "calido", "comunidad", "naturaleza"], titulares: "Quicksand", cuerpo: "Inter" },
];
const TIPOGRAFIA_BASE = { titulares: "Rajdhani", cuerpo: "Inter" };
const CLASE_USO: Record<string, string> = {
  reutilizable: "reutilizable (código abierto; se conserva su aviso)", "reutilizable-con-condiciones": "reutilizable con condiciones (se aplica la suya en cada contexto)",
  "solo-referencia": "solo referencia (se estudia el patrón y se crea una versión propia)", "solo-enlace": "solo enlace (lo abre la persona)",
};
const MOV = (duracionMs: number, curva: string, rigidez: number, amortiguacion: number) => ({ duracionMs, curva, rigidez, amortiguacion });
const BASE_MOVIMIENTO: Record<ObjetivoDiseno, { duracionMs: number; curva: string; rigidez: number; amortiguacion: number }> = {
  menu: MOV(DURACION.normal, CURVA.entrada, 210, 26), boton: MOV(DURACION.rapido, CURVA.entrada, 320, 28), transicion: MOV(DURACION.normal, CURVA.suave, 170, 22),
  animacion: MOV(DURACION.escena, CURVA.suave, 140, 22), seccion: MOV(DURACION.pausado, CURVA.suave, 160, 24), pagina: MOV(DURACION.escena, CURVA.suave, 150, 22),
  marca: MOV(DURACION.pausado, CURVA.elastico, 380, 30), escena3d: MOV(DURACION.escena, CURVA.suave, 150, 20), xr: MOV(DURACION.escena, CURVA.suave, 130, 18),
};
const REGISTRO_ESCALA: Record<RegistroMovimiento, { duracion: number; suavidad: number }> = {
  sobrio: { duracion: 1, suavidad: 1 }, expresivo: { duracion: 1.25, suavidad: 1.1 }, experimental: { duracion: 1.5, suavidad: 1.15 },
};

const norm = (t: string): string => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const palabras = (t: string): string[] => norm(t).split(/[^a-z0-9]+/).filter(Boolean);
const registroDe = (v: unknown): RegistroMovimiento => (v === "sobrio" || v === "expresivo" || v === "experimental" ? v : "sobrio");
const clavesDe = (a: PeticionBrief["adn"]): string[] =>
  (!a ? [] : typeof a === "string" ? [a] : Array.isArray(a) ? a : [a.tema ?? "", a.movimiento ?? "", ...(a.claves ?? [])]).flatMap(palabras);

/** Brief de una pieza nueva a partir de referencias citadas: patrón reexpresado, nombre nuevo,
 *  tokens del contexto y créditos. El objetivo desconocido vuelve a «seccion». */
export function briefDesdeReferencias(p: PeticionBrief): BriefDiseno {
  const destino: ObjetivoDiseno = esObjetivo(p.objetivo) ? p.objetivo : "seccion";
  const referencias = p.referencias.filter((r) => !!r.entrada);
  const temas = [...new Set(referencias.map((r) => r.entrada.tema))];
  const adnClaves = clavesDe(p.adn), escala = REGISTRO_ESCALA[registroDe(p.contexto.registro)];
  const base = BASE_MOVIMIENTO[destino];
  const pareja = TIPOGRAFIAS.map((t) => ({ t, n: t.claves.filter((k) => adnClaves.includes(k)).length })).sort((a, b) => b.n - a.n)[0];
  const emparejamiento = pareja && pareja.n > 0 ? { titulares: pareja.t.titulares, cuerpo: pareja.t.cuerpo } : TIPOGRAFIA_BASE;
  const patron = [...new Set(temas.map((t) => PATRONES_TEMA[t]).filter(Boolean))];
  if (patron.length === 0) patron.push(PATRON_GENERICO);
  const clave = adnClaves[0] ?? "";
  const sufijo = temas.map((t) => NOMBRE_TEMA[t]).find(Boolean) ?? (clave ? clave.charAt(0).toUpperCase() + clave.slice(1) : "Origen");
  const movimiento = {
    duracionMs: Math.round(base.duracionMs * escala.duracion), curva: base.curva,
    resorte: { rigidez: Math.round(base.rigidez / escala.suavidad), amortiguacion: Math.round((base.amortiguacion / escala.suavidad) * 10) / 10 },
    notas: `Registro «${registroDe(p.contexto.registro)}»: solo animan transform y opacity; la salida es más corta que la entrada; la ventana es de interfaz, no se copian los números de vídeo; con prefers-reduced-motion el estado final se pinta quieto.`,
  };
  return {
    objetivo: destino, nombre: `${NOMBRE_O[destino]} ${sufijo}`, patron, jerarquia: JERARQUIA_O[destino], ritmo: RITMO_O[destino],
    movimiento, emparejamientoTipografico: emparejamiento, tokens: { ...p.contexto.tokens },
    principios: (p.principios ?? []).map((q) => `${q.titulo}: ${q.descripcion}`),
    creditos: referencias.map((r) => `«${r.entrada.nombre}» — ${r.entrada.url} — ${CLASE_USO[r.entrada.clase_uso] ?? r.entrada.clase_uso}`),
  };
}

const ngramas = (texto: string): string[] => { const t = palabras(texto), n: string[] = []; for (let i = 0; i + 8 <= t.length; i++) n.push(t.slice(i, i + 8).join(" ")); return n; };
const ASSETS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".mp4", ".mp3", ".webm", ".mov", ".woff", ".woff2", ".lottie"];

/** Valida el candidato (html | tsx) contra las referencias citadas: rechaza textos copiados de 8
 *  palabras seguidas o más, logos y capturas del tercero y assets externos; el crédito en texto es legítimo. */
export function validarResultado(codigo: string, referencias: readonly ReferenciaBrief[]): ValidacionDiseno {
  if (!referencias.length) return { valido: true, motivos: [] };
  const motivos: string[] = [], corpus = new Set<string>(), dominios = new Set<string>();
  for (const { entrada: e } of referencias) {
    if (!e) continue;
    for (const texto of [e.nombre, e.que_es, e.subtema ?? "", e.condiciones, ...(e.sin_verificar ?? [])]) ngramas(texto).forEach((g) => corpus.add(g));
    for (const url of [e.url, e.og_imagen, e.terminos]) {
      if (!url) continue;
      if (e.og_imagen && url === e.og_imagen && codigo.includes(e.og_imagen.replace(/^https?:/, "")))
        motivos.push(`Captura del sitio de «${e.nombre}» prohibida: las portadas se generan, no se copian.`);
      try { dominios.add(new URL(url).host); } catch { /* url no legible: se omite */ }
    }
  }
  if (ngramas(codigo).some((g) => corpus.has(g)))
    motivos.push("Contiene 8 palabras seguidas o más copiadas de una referencia: redacta el patrón con palabras propias y cita la fuente.");
  for (const u of codigo.match(/https?:\/\/[^\s"'`<>()]+/g) ?? []) {
    try {
      const d = new URL(u);
      if (dominios.has(d.host) && ASSETS.some((x) => d.pathname.toLowerCase().endsWith(x)))
        motivos.push(`Asset de terceros prohibido (${d.host}): los recursos van propios o generados; la cita solo como texto.`);
    } catch { /* url malformada: se omite */ }
  }
  const codigoN = norm(codigo);
  for (const { entrada: e } of referencias) {
    const nombre = norm(e.nombre);
    if (!nombre) continue;
    let en = codigoN.indexOf(nombre);
    while (en >= 0) {
      if (/(<svg|<img|<image|<path|<video|<canvas|\blogo\b)/i.test(codigoN.slice(Math.max(0, en - 90), en + nombre.length + 90)))
        motivos.push(`Marca gráfica de «${e.nombre}» prohibida: su nombre solo entra como crédito de texto, sin logo ni captura.`);
      en = codigoN.indexOf(nombre, en + nombre.length);
    }
  }
  return { valido: motivos.length === 0, motivos };
}
