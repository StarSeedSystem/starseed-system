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
  const puede = resultado.listo;
  return (
    <div className="rounded-2xl border p-4">
      <h3 className="text-lg font-semibold">Preparar para imprimir</h3>
      <p>Destino: {plan.destino} · Cerrada: {String(plan.cerrada)} · Prioridad: {plan.prioridad}</p>
      <p className="text-sm text-white/70">Neurona actual: Blender + CPU. Motores disponibles con malla cerrada.</p>
      <ul>
        {resultado.pasos.map(p => (
          <li key={p.etapa} className="cursor-pointer">
            {p.etapa}: {p.motor?.nombre ?? p.motivo}
          </li>
        ))}
      </ul>
      <div className="mt-3 text-sm">
        <p className={puede ? "text-emerald-300" : "text-amber-300"}>{puede ? "Se puede cerrar y entregar" : "No hay motor para cerrar en esta neurona"}</p>
        <p>Formatos de salida: GLB · STL · 3MF (malla cerrada, sin texturas)</p>
        {resultado.procedencia.length > 0 && (
          <div className="mt-2">
            <p className="font-medium">Procedencia</p>
            <ul>
              {resultado.procedencia.map((pr, i) => (
                <li key={i} className="cursor-pointer">{pr.herramienta} — {pr.licencia} {pr.atribucion ? `· ${pr.atribucion}` : ""}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}