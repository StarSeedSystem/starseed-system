import { LaboratorioAstraura } from "@/components/laboratorio/laboratorio-astraura";

export default function LaboratorioPage() {
  return (
    <section className="flex min-h-[78vh] flex-1 flex-col">
      <header className="mb-3 shrink-0">
        <h1 className="text-2xl font-semibold">Laboratorio de Astraura</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          El banco de pruebas de la inteligencia fásica de Astraura: desarrolla y
          mide la IA sin tocar el sistema en marcha. Nada de lo que veas aquí se
          escribe en el OS sin tu confirmación explícita.
        </p>
      </header>
      <div className="min-h-[60vh] flex-1 overflow-hidden rounded-2xl border border-white/10">
        <LaboratorioAstraura />
      </div>
    </section>
  );
}