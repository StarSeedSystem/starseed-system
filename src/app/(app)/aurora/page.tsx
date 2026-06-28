"use client";
import AuroraStudio from "@/components/aurora/aurora-studio";
import { ChatConnectionsPanel } from "@/components/messaging/chat-connections-panel";

export default function AuroraPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="max-w-4xl mx-auto space-y-10">
        <div>
          <h1 className="text-2xl font-bold text-fuchsia-50">Aurora · Voz de Astraura</h1>
          <p className="text-sm text-white/50 mt-1 mb-6">Control por voz en tiempo real de todos tus sistemas StarSeed. Configura proveedor, voz, carácter, personalidad y emociones, y guarda Personalidades en baúles, memorias y archivos.</p>
          <AuroraStudio />
        </div>

        {/* Conexiones de chat tri-fuente (Terminal · Servidor StarSeed · Externo)
            con integración de Astraura + memorias y vínculo de Telegram. */}
        <section>
          <h2 className="text-lg font-semibold text-fuchsia-50 mb-1">Conexiones de chat</h2>
          <p className="text-sm text-white/50 mb-4">Elige por dónde conversas con Aurora (con el cerebro Astraura): tu dispositivo, el servidor StarSeed y/o un mensajero externo como Telegram. Las tres pueden estar activas a la vez, cada una con sus memorias y contexto.</p>
          <ChatConnectionsPanel />
        </section>
      </div>
    </main>
  );
}
