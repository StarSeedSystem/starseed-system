// rutas: src/lib/astraura/modelos/ramas-proveedor.ts
// implementa ramasPorProveedor que, dada un catálogo de modelos locales, la lista de APIs
// externas y un perfil de neurona, devuelve una rama por proveedor. Cada rama contiene
// la lista de modelos ordenados por capacidad (score ECI, luego tamaño) y, además, indica
// el mejor modelo que cabe en la neurona y el más ligero que cabe.

import { encajar } from "./recomendar";
import type { ModeloLocal, PerfilNeurona, ModeloApi } from "./tipos";

export interface Rama {
  proveedor: string;
  modelos: ModeloLocal[]; // de más a menos capaz
  mejorQueCabe: ModeloLocal | null; // modelo más capaz con veredicto recomendado o justo
  masLigero: ModeloLocal | null; // modelo más ligero que cabe
}

/**
 * Devuelve un única rama por proveedor. Los proveedores los extrae de la lista de APIs
 * pasada como segundo parámetro; si esta lista está vacía, se generan ramas para los
 * proveedores conocidos: ollama, capas_astraua y abliteration.
 */
export function ramasPorProveedor(
  catalogo: readonly ModeloLocal[],
  apis: readonly ModeloApi[],
  perfil: PerfilNeurona
): Rama[] {
  // Identificamos los proveedores únicos en los APIs
  const provs = new Set(apis.map((a) => a.proveedor));
  const providers = Array.from(provs);

  // Si no hay APIs listamos los proveedores por defecto
  if (providers.length === 0) providers.push("ollama", "capa_astraua", "abliteration.ai");

  const ramas: Rama[] = [];

  // Función de comparación por capacidad. Ordena por ECI descendente; si no
  // hay puntuación, ordena por descargaGb ascendente (más pequeño primero).
  const sortDeCapacidad = (a: ModeloLocal, b: ModeloLocal): number => {
    const aScore = a.puntuacion?.eci ?? 0;
    const bScore = b.puntuacion?.eci ?? 0;
    if (aScore !== bScore) return bScore - aScore; // mayor primero
    return a.descargaGb - b.descargaGb; // menor primero
  };

  providers.forEach((prov) => {
    // Seleccionamos los modelos que corresponden a este proveedor.
    // Para los proveedores conocidos aplicamos reglas específicas:
    const modelos = catalogo.filter((m) => {
      switch (prov) {
        case "ollama":
          // Ollama incluye todos los modelos que soportan ollama runtime.
          return m.runtimes.includes("ollama");
        case "capa_astraua":
          // Modelos de capas de Astraura tienen tipo "capa-158" o "needle".
          return m.tipo === "capa-158" || m.tipo === "needle";
        case "abliteration.ai":
          return m.clase === "abliterated";
        default:
          return false;
      }
    });

    const modelosOrdenados = [...modelos].sort(sortDeCapacidad);

    // Encontrar mejorQueCabe
    let mejorQueCabe: ModeloLocal | null = null;
    for (const mod of modelosOrdenados) {
      const enc = encajar(mod, perfil, false);
      if (enc.veredicto === "recomendado" || enc.veredicto === "justo") {
        mejorQueCabe = mod;
        break;
      }
    }

    // Encontrar masLigero: modelo con menor descarga que cabe
    const modelosCaben = modelosOrdenados.filter((m) => {
      const enc = encajar(m, perfil, false);
      return enc.veredicto !== "no-cabe";
    });
    const masLigero = modelosCaben.sort((a, b) => a.descargaGb - b.descargaGb)[0] ?? null;

    // Si la neurona no tiene GPU, sustituimos la rama local por la más ligera
    if (perfil.chip === "cpu" || perfil.chip === "intel") {
      // Estamos en la rama de ollama o capas_astraua? Sólo nos interesa la rama local.
      if (prov === "ollama" || prov === "capa_astraua") {
        ramas.push({
          proveedor: prov,
          modelos: [masLigero!],
          mejorQueCabe: masLigero,
          masLigero,
        });
        return;
      }
    }

    ramas.push({
      proveedor: prov,
      modelos: modelosOrdenados,
      mejorQueCabe,
      masLigero,
    });
  });

  return ramas;
}
