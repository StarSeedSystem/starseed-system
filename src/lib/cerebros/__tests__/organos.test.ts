import { describe, expect, it } from "vitest";
import {
  actualizarOrgano,
  alternarNeuronaEnOrgano,
  construirGrafoOrganos,
  crearOrgano,
  eliminarOrgano,
} from "../organos";
import { PILARES } from "@/components/cerebro/pilares";
import type { Neuron } from "@/lib/neurons/neurons";
import type { Brain } from "@/lib/brains/brains";

describe("órganos configurables 2D/3D/4D y pilar principal Neuronas", () => {
  it("coloca Neuronas como primer pilar principal de Cerebros", () => {
    expect(PILARES[0].id).toBe("neuronas");
    expect(PILARES[0].etiqueta).toBe("Neuronas");
  });

  it("permite crear, actualizar, asignar neuronas, construir grafo 2D/3D/4D y eliminar órganos", () => {
    const org = crearOrgano(
      {
        nombre: "Núcleo Cognitivo Privado",
        categoria: "computo",
        visibilidad: "privado",
        formatoVista: "4d",
        color: "#0091ff",
      },
      1_750_000_000_000,
    );

    let lista = [org];
    lista = alternarNeuronaEnOrgano(lista, org.id, "neu-1", 1_750_000_001_000);
    expect(lista[0].neuronasIds).toEqual(["neu-1"]);

    lista = actualizarOrgano(lista, org.id, { cualidades: { autoEnrutar: false } }, 1_750_000_002_000);
    expect(lista[0].cualidades.autoEnrutar).toBe(false);

    const neuronas: Neuron[] = [
      {
        id: "neu-1",
        name: "Maggabook",
        kind: "laptop",
        capabilities: { platform: "macOS" },
        permissions: { compute: true, storage: true, sync: true, agent: true, senses: true, wake: true },
        online: true,
        isThisDevice: true,
      },
    ];
    const cerebros: Brain[] = [
      { id: "br-1", name: "Cerebro Maestro", scope: "account", description: "", config: {} },
      { id: "br-pub", name: "Cerebro Público", scope: "community", description: "", config: {} },
    ];

    const grafoCompleto = construirGrafoOrganos({
      organos: lista,
      neuronas,
      cerebros,
      agentesNombres: ["Astraura", "Hermes"],
      procesosNombres: ["Sync P2P"],
    });
    expect(grafoCompleto.nodos.some((n) => n.tipo === "organo" && n.titulo === "Núcleo Cognitivo Privado")).toBe(true);
    expect(grafoCompleto.nodos.some((n) => n.tipo === "neurona" && n.titulo === "Maggabook")).toBe(true);
    expect(grafoCompleto.nodos.some((n) => n.tipo === "cerebro" && n.titulo === "Cerebro Público")).toBe(true);
    expect(grafoCompleto.aristas.some((a) => a.de === `org:${org.id}` && a.a === "neu:neu-1")).toBe(true);

    const grafoPublico = construirGrafoOrganos({
      organos: lista,
      neuronas,
      cerebros,
      soloPublicos: true,
    });
    expect(grafoPublico.nodos.some((n) => n.titulo === "Núcleo Cognitivo Privado")).toBe(false);
    expect(grafoPublico.nodos.some((n) => n.titulo === "Cerebro Público")).toBe(true);

    const trasEliminar = eliminarOrgano(lista, org.id);
    expect(trasEliminar).toHaveLength(0);
  });
});
