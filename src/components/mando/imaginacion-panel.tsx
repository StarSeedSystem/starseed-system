// Imaginación · panel del medidor para la ventana de Imaginación (solo vista, nunca filtra).
// Muestra los propuestos filtrados de Astraura hoy según la Ola 1102A.
<<<<<<< HEAD
import { etiquetaMedidorAstraura } from "@/lib/mando/imaginacion-tipos";

const hoy = new Date().toISOString().split("T")[0];

export default function ImaginacionPanel() {
  const filtroAstraura = {
    fecha: hoy,
    vistas: 690,
    entran: 8,
    filtradas: {
      tipoArchivo: { entrada: 8, descartada: 682 },
      familiaRepetida: { entrada: 8, descartada: 0 },
      tope: { entrada: 3, descartada: 5 },
    },
    autorizacionInventada: true,
  };

  const etiqueta = etiquetaMedidorAstraura(filtroAstraura);

  return (
    <div className="cursor-pointer rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-accent/50">
      <h3 className="text-lg font-semibold">Medidor de Imaginación</h3>
      <p className="text-sm text-muted-foreground">{etiqueta}</p>
=======
export default function ImaginacionPanel() {
  return (
    <div className="cursor-pointer rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-accent/50">
      <h3 className="text-lg font-semibold">Medidor de Imaginación</h3>
      <p className="text-sm text-muted-foreground">Filtrados de Astraura hoy: 0 (familia · tipo · tope)</p>
>>>>>>> 82ca44fb8 (salvavidas · IMG1102D: trabajo del agente antes de las puertas (tsc / vitest))
    </div>
  );
}
