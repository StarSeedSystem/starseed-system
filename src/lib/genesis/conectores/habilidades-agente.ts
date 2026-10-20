"use client";

import { SkillCapability } from "@/ai/astraura/skills";

export type CapaModelo = "tarjeta" | "resumen" | "completa";

function recortarTexto(texto: string, capa: CapaModelo): string {
  if (capa === "tarjeta") {
    const palabras = texto.split(/\s+/);
    const recortado = palabras.slice(0, 60).join(" ");
    return recortado.length < texto.length ? recortado + "..." : recortado;
  }
  if (capa === "resumen") {
    const palabras = texto.split(/\s+/);
    const recortado = palabras.slice(0, 250).join(" ");
    return recortado.length < texto.length ? recortado + "..." : recortado;
  }
  return texto;
}

export function habilidadesPara(
  papel: string,
  ambito: string,
  opciones: {
    capacidades: SkillCapability[];
    desactivadas: string[];
  },
  capa: CapaModelo = "completa"
): SkillCapability[] {
  const { capacidades, desactivadas } = opciones;
  const habilidadesActivas = capacidades.filter(
    (h) => !desactivadas.includes(h.id)
  );
  const seleccionadas: SkillCapability[] = [];
  for (const habilidad of habilidadesActivas) {
    if (evaluarHabilidadParaPapel(habilidad, papel, ambito)) {
      seleccionadas.push({
        ...habilidad,
        systemPrompt: recortarTexto(habilidad.systemPrompt, capa),
      });
    }
  }
  return seleccionadas;
}

function evaluarHabilidadParaPapel(
  habilidad: SkillCapability,
  papel: string,
  ambito: string
): boolean {
  const routing = habilidad.routing;
  if (!routing) return true;
  if (!routing.preferStrong && !routing.web && !routing.vision && !routing.planning) return true;
  switch (papel) {
    case "escritor":
      return !!(routing.preferStrong || routing.web || routing.vision || routing.planning);
    case "revisor":
      return !!(routing.preferStrong || routing.vision || routing.web);
    case "chat":
      return !!(routing.preferStrong || routing.web || routing.vision || routing.planning);
    case "visión":
      return !!(routing.vision || routing.preferStrong || routing.web);
    case "voz":
      return true;
    case "imagen":
      return !!routing.preferStrong;
    case "código":
      return !!(routing.preferStrong || routing.web || routing.planning);
    default:
      return !!routing.preferStrong;
  }
}
