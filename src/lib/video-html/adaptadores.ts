export type Adaptador = "css" | "waapi" | "animejs" | "lottie" | "three" | "typegpu" | "gsap";

export interface ResultadoDeteccion {
  usados: Adaptador[];
  editableVisualmente: boolean;
  motivo: string;
}

function tienePatron(html: string, patron: RegExp): boolean {
  return patron.test(html);
}

export function detectarAdaptadores(html: string): ResultadoDeteccion {
  const usados: Adaptador[] = [];

  if (tienePatron(html, /<style[\s\S]*?@keyframes[\s\S]*?<\/style>/i)) {
    usados.push("css");
  }

  if (
    tienePatron(html, /<script[\s\S]*?\.animate\([\s\S]*?<\/script>/i) ||
    tienePatron(html, /<script[\s\S]*?\belement\b[\s\S]*?\.animate\([\s\S]*?<\/script>/i)
  ) {
    usados.push("waapi");
  }

  if (tienePatron(html, /<script[\s\S]*?\banime\s*\([\s\S]*?<\/script>/i)) {
    usados.push("animejs");
  }

  if (
    tienePatron(html, /<lottie-player/i) ||
    tienePatron(html, /<script[\s\S]*?\blottie\b[\s\S]*?<\/script>/i)
  ) {
    usados.push("lottie");
  }

  if (
    tienePatron(html, /<script[\s\S]*?\bthree\b[\s\S]*?<\/script>/i) ||
    tienePatron(html, /<script[\s\S]*?\bTHREE\b[\s\S]*?<\/script>/i)
  ) {
    usados.push("three");
  }

  if (tienePatron(html, /<script[\s\S]*?\btypegpu\b[\s\S]*?<\/script>/i)) {
    usados.push("typegpu");
  }

  if (
    tienePatron(html, /<script[\s\S]*?\bgsap\b[\s\S]*?<\/script>/i) ||
    tienePatron(html, /<script[\s\S]*?\bTweenMax\b[\s\S]*?<\/script>/i) ||
    tienePatron(html, /<script[\s\S]*?\bTimelineMax\b[\s\S]*?<\/script>/i)
  ) {
    usados.push("gsap");
  }

  const editableVisualmente = !usados.includes("gsap");
  const motivo = usados.includes("gsap")
    ? "La licencia de GSAP Standard prohíbe usarla en herramientas que permiten crear animaciones visuales sin código. Se sugiere convertir la animación a WAAPI."
    : "";

  return { usados, editableVisualmente, motivo };
}