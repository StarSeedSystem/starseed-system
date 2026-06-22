import { MemoryHub } from "@/components/exocortex/memory-hub";

export const metadata = { title: "Memory Hub · StarSeed", description: "Crea, configura y sincroniza tus memorias de StarSeed por contexto." };

export default function MemoriasPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-fuchsia-50">Memory Hub</h1>
        <p className="text-sm text-white/50 mt-1 mb-6">Crea, configura y sincroniza tus memorias de StarSeed por contexto (perfil, cuenta, página, grupo, chat…), con la guía de Astraura.</p>
        <MemoryHub />
      </div>
    </main>
  );
}
