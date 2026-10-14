import { planOptimizacion } from "@/lib/avatares/adn/optimizacion";
import { planificar } from "@/lib/avatares/adn/canalizacion";
import type { Requisito3D } from "@/lib/avatares/adn/motores";

export default function PrepararImpresion() {
  const plan = planOptimizacion("impresion");
  const peticion = {
    partida: "malla" as const,
    esqueleto: "ninguno" as const,
    capacidades: ["blender","cpu"] as readonly Requisito3D[],
    region: null,
    comercial: false,
    permitirDePago: false,
    cerrada: true,
    prioridad: plan.prioridad,
  };
  const resultado = planificar(peticion);
  return (
    <div className="rounded-2xl border p-4">
      <h3 className="text-lg font-semibold">Preparar para imprimir</h3>
      <p>Destino: {plan.destino} · Cerrada: {String(plan.cerrada)}</p>
      <ul>
        {resultado.pasos.map(p => (
          <li key={p.etapa} className="cursor-pointer">
            {p.etapa}: {p.motor?.nombre ?? p.motivo}
          </li>
        ))}
      </ul>
    </div>
  );
}
