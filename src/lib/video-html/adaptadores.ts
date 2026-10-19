export function detectarAdaptadores(html: string) {
  const usados: Array<"css" | "waapi" | "animejs" | "lottie" | "three" | "typegpu" | "gsap"> = [];

  // Check for CSS: presence of @keyframes in a style tag
  if (/<style[\s\S]*?@keyframes[\s\S]*?<\/style>/i.test(html)) {
    usados.push("css");
  }

  // Check for WAAPI: look for .animate( or animate( in a script tag
  if (/<script[\s\S]*?\.animate\([\s\S]*?<\/script>/i.test(html) || /<script[\s\S]*?animate\([\s\S]*?<\/script>/i.test(html)) {
    usados.push("waapi");
  }

  // Check for Anime.js: look for anime(
  if (/<script[\s\S]*?anime\([\s\S]*?<\/script>/i.test(html)) {
    usados.push("animejs");
  }

  // Check for Lottie: look for <lottie-player> or lottie in a script
  if (/<lottie-player/i.test(html) || /<script[\s\S]*?lottie[\s\S]*?<\/script>/i.test(html)) {
    usados.push("lottie");
  }

  // Check for Three.js: look for three or THREE in a script tag
  if (/<script[\s\S]*?\bthree\b[\s\S]*?<\/script>/i.test(html) || /<script[\s\S]*?\bTHREE\b[\s\S]*?<\/script>/i.test(html)) {
    usados.push("three");
  }

  // Check for TypeGPU: look for typegpu in a script
  if (/<script[\s\S]*?typegpu[\s\S]*?<\/script>/i.test(html)) {
    usados.push("typegpu");
  }

  // Check for GSAP: look for gsap or TweenMax in a script
  if (/<script[\s\S]*?(gsap|TweenMax|TimelineMax)[\s\S]*?<\/script>/i.test(html)) {
    usados.push("gsap");
  }

  const editableVisualmente = !usados.includes("gsap");
  const motivo = usados.includes("gsap")
    ? "La licencia de GSAP Standard prohíbe usarla en herramientas que permiten crear animaciones visuales sin código. Se sugiere convertir la animación a WAAPI."
    : "";

  return { usados, editableVisualmente, motivo };
}