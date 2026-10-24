"use strict";

// ═══════════════════════════════════════════════════════════════════════════
// paleta-fondo — Paletas deterministas para fondos con shaders
// --------------------------------------------------------------------------
// Basado en architecture/fondos-shaders.md §4 (paleta del fondo)
// Funciones puras: entradas → salidas, sin red, sin disco, sin estado.
// ═══════════════════════════════════════════════════════════════════════════

export interface ColorRGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface PresetColor {
  nombre: string;
  rgba: ColorRGBA;
  peso: number;
  origen: 'preset' | 'muestra';
}

export interface Preset {
  componentes: Array<{ type: string; id: string; props: Record<string, any> }>;
  structureVersion: number;
}

export function paletaDePreset(preset: Preset): PresetColor[] {
  const colores: PresetColor[] = [];
  const seeds: Record<string, number> = {};

  for (let i = 0; i < preset.componentes.length; i++) {
    const comp = preset.componentes[i];
    const seed = seeds[comp.id] || i;
    seeds[comp.id] = seed;

    const baseHue = comp.props.hue ?? 0;
    const baseSaturation = comp.props.saturation ?? 0.5;
    const baseLightness = comp.props.lightness ?? 0.5;

    const hue = baseHue + (seed % 360);
    const saturation = baseSaturation + ((seed * 13) % 100) / 100;
    const lightness = baseLightness + ((seed * 17) % 100) / 100;

    const hslaToRgba = (
      hue2: number,
      sat: number,
      light: number,
      alpha: number
    ): ColorRGBA => {
      const s = sat;
      const l = light;
      const c = (1 - Math.abs(2 * l - 1)) * s;
      const x = c * (1 - Math.abs(((hue2 / 60) % 2) - 1));
      const m = l - c / 2;

      let r = 0,
        g = 0,
        b = 0;

      if (hue2 >= 0 && hue2 < 60) {
        r = c;
        g = x;
        b = 0;
      } else if (hue2 >= 60 && hue2 < 120) {
        r = x;
        g = c;
        b = 0;
      } else if (hue2 >= 120 && hue2 < 180) {
        r = 0;
        g = c;
        b = x;
      } else if (hue2 >= 180 && hue2 < 240) {
        r = 0;
        g = x;
        b = c;
      } else if (hue2 >= 240 && hue2 < 300) {
        r = x;
        g = 0;
        b = c;
      } else if (hue2 >= 300 && hue2 < 360) {
        r = c;
        g = 0;
        b = x;
      }

      return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255),
        a: alpha ?? 1,
      };
    };

    const propWeight = comp.props.weight ?? 1;
    const weight = Math.round(propWeight * 100) / 100;

    colores.push({
      nombre: comp.id,
      rgba: hslaToRgba(hue, saturation, lightness, comp.props.alpha ?? 1),
      peso: weight,
      origen: 'preset',
    });
  }

  return colores.sort((a, b) => b.peso - a.peso);
}

export function paletaDeMuestra(pixelesRGBA: ColorRGBA[], k: number = 5): PresetColor[] {
  const colores: PresetColor[] = [];

  const seedBase = 12345;
  const centroideMedio = {
    r: 128,
    g: 128,
    b: 128,
    a: 255,
  };

  const distanciaEuclidiana = (a: ColorRGBA, b: ColorRGBA) => {
    return Math.sqrt(
      Math.pow(a.r - b.r, 2) +
      Math.pow(a.g - b.g, 2) +
      Math.pow(a.b - b.b, 2) +
      Math.pow(a.a - b.a, 2)
    );
  };

  const centroideInicial = (pixeles: ColorRGBA[], indice: number) => {
    const seed = seedBase + indice;
    const offset = seed % pixeles.length;
    return pixeles[offset] ?? centroideMedio;
  };

  const asignarCentroide = (pixeles: ColorRGBA[], centroide: ColorRGBA) => {
    return pixeles
      .map((p) => ({ p, dist: distanciaEuclidiana(p, centroide) }))
      .sort((a, b) => a.dist - b.dist)
      .map(({ p }) => p);
  };

  const calcularNuevoCentroide = (asignados: ColorRGBA[]) => {
    if (asignados.length === 0) return centroideMedio;

    const sumaR = asignados.reduce((acc, p) => acc + p.r, 0);
    const sumaG = asignados.reduce((acc, p) => acc + p.g, 0);
    const sumaB = asignados.reduce((acc, p) => acc + p.b, 0);
    const sumaA = asignados.reduce((acc, p) => acc + p.a, 0);
    const cantidad = asignados.length;

    return {
      r: Math.round(sumaR / cantidad),
      g: Math.round(sumaG / cantidad),
      b: Math.round(sumaB / cantidad),
      a: Math.round(sumaA / cantidad),
    };
  };

  const iterarKMedias = (pixeles: ColorRGBA[]) => {
    const centroides: ColorRGBA[] = [];

    for (let i = 0; i < k; i++) {
      centroides.push(centroideInicial(pixeles, i));
    }

    const asignaciones: ColorRGBA[][] = Array.from({ length: k }, () => []);

    for (let iter = 0; iter < 10; iter++) {
      asignaciones.forEach((arr) => arr.length = 0);

      pixeles.forEach((p) => {
        let distanciaMinima = Infinity;
        let indiceCentroide = 0;

        centroides.forEach((c, idx) => {
          const dist = distanciaEuclidiana(p, c);
          if (dist < distanciaMinima) {
            distanciaMinima = dist;
            indiceCentroide = idx;
          }
        });

        asignaciones[indiceCentroide].push(p);
      });

      let convergio = true;

      centroides.forEach((c, idx) => {
        const nuevoCentroide = calcularNuevoCentroide(asignaciones[idx]);
        const dist = distanciaEuclidiana(c, nuevoCentroide);

        if (dist > 0.5) {
          convergio = false;
        }

        centroides[idx] = nuevoCentroide;
      });

      if (convergio) break;
    }

    return centroides;
  };

  const centroides = iterarKMedias(pixelesRGBA);

  centroides.forEach((centroide, indice) => {
    const assigned = asignarCentroide(pixelesRGBA, centroide);
    const weight = assigned.length / pixelesRGBA.length;

    colores.push({
      nombre: `centroide-${indice + 1}`,
      rgba: centroide,
      peso: Number(weight.toFixed(3)),
      origen: 'muestra',
    });
  });

  return colores.sort((a, b) => b.peso - a.peso);
}

export interface FondoSet {
  nombre: string;
  colores: PresetColor[];
}

export function paletaFondo(set: FondoSet, muestra?: ColorRGBA[]): PresetColor[] {
  const colores = [...set.colores];

  if (muestra && muestra.length > 0) {
    const coloresDeMuestra = paletaDeMuestra(muestra, 3);
    colores.push(...coloresDeMuestra);
  }

  const conLuminancia = colores.map((c) => {
    const luminancia = 0.2126 * c.rgba.r + 0.7152 * c.rgba.g + 0.0722 * c.rgba.b;
    return { ...c, luminancia };
  });

  const ordenados = conLuminancia.sort((a, b) => {
    if (b.peso !== a.peso) {
      return b.peso - a.peso;
    }
    return b.luminancia - a.luminancia;
  });

  const unicos = new Map<string, PresetColor>();
  ordenados.forEach((c) => {
    const key = `${c.rgba.r},${c.rgba.g},${c.rgba.b},${c.rgba.a}`;
    if (!unicos.has(key)) {
      unicos.set(key, c);
    }
  });

  return Array.from(unicos.values());
}
