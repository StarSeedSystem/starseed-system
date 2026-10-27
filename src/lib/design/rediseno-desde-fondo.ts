/** Rediseño desde el fondo (Ola 1018F · tarea L) · architecture/fondos-shaders.md §4.
 *  Tres propuestas de ThemeTokens (theme-engine.ts) adaptadas a la paleta del
 *  fondo: superficies translúcidas que dejan ver el fondo, acentos de la paleta,
 *  escala φ de armonía.md y contraste AA verificado (≥ 4,5: quien no lo pase se
 *  ajusta o se descarta). Módulo PURO: sin red, sin disco, sin DOM, determinista. */
import type { ThemeTokens } from "./theme-engine";
import { luminanciaDe, normalizarHex } from "./paleta-fondo";
import type { EntradaPaleta } from "./paleta-fondo";
export type Modo = "claro" | "oscuro";
export const PHI = 1.618; // razón áurea; memory/diseno/armonia.md
export interface AdnDiseno { identidad?: string; gustos?: string[]; prohibiciones?: string[] }
export interface EntradaRediseno { paleta: EntradaPaleta[]; temaActual: ThemeTokens; modo: Modo; adn?: AdnDiseno }
export interface RegistroContraste { par: string; sobre: string; texto: string; ratio: number; pasa: boolean }
/** Una de las tres propuestas (SOP §4): tokens + motivo geométrico + contraste. */
export interface PropuestaRediseno { clave: "sobria" | "armonica" | "atrevida"; nombre: string; motivo: string; tokens: ThemeTokens; contrastes: RegistroContraste[] }
export interface PropuestasDesdeFondo { sobria: PropuestaRediseno; armonica: PropuestaRediseno; atrevida: PropuestaRediseno }
export interface PedidoIA { destino: "director-diseno"; tarea: "rediseno-desde-fondo"; modo: Modo; privacidad: "local" | "compartido"; incluyeMemoriaPrivada: boolean; prompt: string; respuestaEsperada: string }
const canalRgb = (c: string): [number, number, number] => {
  const h = normalizarHex(c).slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
};
/** Superficie translúcida: el color con su alfa, en CSS rgba(). */
export const rgbaDe = (c: string, alfa: number): string => {
  const [r, g, b] = canalRgb(c);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alfa * 100) / 100})`;
};
/** Color resultante si una capa con `alfa` de `frente` se compone sobre `fondo`. */
export const compositar = (frente: string, alfa: number, fondo: string): string => {
  const f = canalRgb(frente), o = canalRgb(fondo);
  const v = f.map((x, i) => Math.round(x * alfa + o[i] * (1 - alfa)));
  return `#${v.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
};
/** Razón de contraste WCAG entre dos colores sólidos (#rrggbb). */
export const ratioContraste = (a: string, b: string): number => {
  const la = luminanciaDe(a), lb = luminanciaDe(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
/** Escala un radius («1rem») por `factor` (×φ, ×φ²…); si no se entiende, «1rem». */
export const escalarRadius = (valor: string | undefined, factor: number): string => {
  const m = /([\d.]+)\s*([a-z%]*)/.exec((valor ?? "1rem").trim());
  if (!m) return valor ?? "1rem";
  return `${Math.round(parseFloat(m[1]) * factor * 1000) / 1000}${m[2]}`;
};
/** Mejor tinta sobre la capa; si la translúcida no pasa AA se sube su opacidad y se acerca al fondo. */
function parContraste(color: string, alfa: number, fondo: string, textoTema: string): { css: string; ratio: number; texto: string; pasa: boolean } {
  const tintas = [textoTema, "#000000", "#ffffff"];
  let capa = color, alfaN = Math.min(1, Math.max(0, alfa)), mejor = { t: textoTema, r: 0 };
  for (let intento = 0; intento < 8; intento++) {
    const compuesto = compositar(capa, alfaN, fondo);
    for (const t of tintas) { const r = ratioContraste(compuesto, t); if (r > mejor.r) mejor = { t, r }; }
    if (mejor.r >= 4.5 || intento === 7) break;
    if (alfaN >= 1) capa = compositar(capa, 0.5, fondo);
    else alfaN = Math.min(1, alfaN + 0.15);
  }
  return { css: rgbaDe(capa, alfaN), ratio: Math.round(mejor.r * 100) / 100, texto: mejor.t, pasa: mejor.r >= 4.5 };
}
interface ConfigPropuesta { clave: PropuestaRediseno["clave"]; nombre: string; motivo: string; alfaCard: number; cristal: number; radio: number; materialClass?: string; motion: number }
const CONFIGS: ConfigPropuesta[] = [
  { clave: "sobria", nombre: "Sobria", alfaCard: 0.16, cristal: 0.3, radio: 1, motion: 0.5, motivo: "Espiral áurea: un solo foco; el acento conduce la mirada sin tapar el fondo." },
  { clave: "armonica", nombre: "Armónica", alfaCard: 0.32, cristal: 0.5, radio: PHI, motion: 1, materialClass: "ss-crystal", motivo: "Vesica piscis: superficies translúcidas superpuestas que dejan ver el fondo entre ambas." },
  { clave: "atrevida", nombre: "Atrevida", alfaCard: 0.55, cristal: 0.65, radio: PHI * PHI, motion: 1.5, materialClass: "ss-crystal", motivo: "Metatrón: acentos plenos y radios mayores; la geometría sagrada como estructura." },
];
/** Tres propuestas de ThemeTokens a partir de la paleta del fondo y el tema actual. */
export function propuestasDesdeFondo(entrada: EntradaRediseno): PropuestasDesdeFondo {
  const { modo, temaActual } = entrada;
  const fondo = temaActual.vars["background"] ?? (modo === "claro" ? "#ffffff" : "#0a0f1d"),
    textoTema = temaActual.vars["foreground"] ?? (modo === "claro" ? "#0a0f1d" : "#f8f9fa");
  const ordenada = [...(entrada.paleta ?? [])].sort((a, b) => b.peso - a.peso);
  const acento = ordenada[0]?.color ?? temaActual.vars["primary"] ?? "#007fff",
    apoyo = ordenada[1]?.color ?? (ordenada[0]?.color ?? acento);
  const propuestas = CONFIGS.map((c): PropuestaRediseno => {
    const veladura = parContraste(acento, c.alfaCard, fondo, textoTema);
    const primario = parContraste(apoyo, 1, fondo, textoTema);
    const tokens: ThemeTokens = {
      vars: {
        ...temaActual.vars,
        "primary-foreground": primario.texto, "accent-foreground": veladura.texto,
        "card-foreground": veladura.texto, "popover-foreground": veladura.texto,
        primary: primario.css, accent: veladura.css, card: veladura.css, popover: veladura.css,
        border: rgbaDe(acento, Math.min(1, c.cristal * 0.8)), ring: rgbaDe(acento, 1),
        radius: escalarRadius(temaActual.vars["radius"], c.radio),
        "ss-phi": String(PHI), "ss-motivo": c.motivo, "ss-cristal": String(c.cristal),
      },
      materialClass: temaActual.materialClass ?? c.materialClass, motion: c.motion, background: temaActual.background,
    };
    return {
      clave: c.clave, nombre: c.nombre, motivo: c.motivo, tokens,
      contrastes: [
        { par: "card", sobre: veladura.css, texto: veladura.texto, ratio: veladura.ratio, pasa: veladura.pasa },
        { par: "primary", sobre: primario.css, texto: primario.texto, ratio: primario.ratio, pasa: primario.pasa },
      ],
    };
  });
  return { sobria: propuestas[0], armonica: propuestas[1], atrevida: propuestas[2] };
}
export interface OpcionesPedidoIA { enNeuronaPropia?: boolean; peticion?: string; alcance?: string }
/** Arma el pedido al Director de diseño; los gustos privados solo viajan en una neurona de la persona (SOP §4). */
export function pedidoParaIA(entrada: EntradaRediseno, opciones: OpcionesPedidoIA = {}): PedidoIA {
  const propia = opciones.enNeuronaPropia === true, alcance = opciones.alcance ?? "perfil";
  const colores = [...(entrada.paleta ?? [])].sort((a, b) => b.peso - a.peso).map((e) => e.color).slice(0, 6).join(", ")
    || (entrada.temaActual.vars["primary"] ?? "tokens actuales");
  const gustos = propia ? entrada.adn?.gustos ?? [] : [];
  const prohibiciones = entrada.adn?.prohibiciones ?? [];
  const partes = [
    `Propón TRES rediseños (sobria, armónica, atrevida) del ${alcance} adaptados a su fondo, con paleta ${colores} y modo ${entrada.modo}.`,
    "Cada uno en formato ThemeTokens de theme-engine.ts (variables CSS sin el prefijo --): superficies translúcidas que dejen ver el fondo,",
    "acentos de la paleta, escala armónica φ = 1.618 (radios ×φ, radios armónicos) y UN motivo geométrico propio por propuesta",
    "(espiral áurea, vesica piscis, metatrón). Guardas: solo tokens y variantes permitidas; nunca ocultar ni desactivar un control esencial; contraste AA texto/superficie ≥ 4,5: quien no lo pase se ajusta o se descarta, y se dice por qué.",
  ];
  if (opciones.peticion) partes.push(`Petición de la persona: «${opciones.peticion}».`);
  if (gustos.length) partes.push(`Gustos memorizados (MEMORIA PRIVADA: esto corre en una neurona de la persona): ${gustos.join("; ")}.`);
  else partes.push("Sin memoria privada de gustos: esto NO corre en una neurona de la persona; diseña solo con lo que este contexto ya comparte.");
  if (prohibiciones.length) partes.push(`Prohibiciones del ADN de diseño: ${prohibiciones.join("; ")}.`);
  return {
    destino: "director-diseno", tarea: "rediseno-desde-fondo",
    modo: entrada.modo, privacidad: propia ? "local" : "compartido", incluyeMemoriaPrivada: gustos.length > 0,
    prompt: partes.join(" "),
    respuestaEsperada: 'JSON: { propuestas: [{ clave: "sobria" | "armonica" | "atrevida", tokens: ThemeTokens, motivo }], descartadas: [{ clave, motivo }] }',
  };
}
