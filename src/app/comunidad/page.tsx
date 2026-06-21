export const metadata = {
  title: "Comunidad StarSeed · Telegram",
  description:
    "Canales y grupos de StarSeed en Telegram, con el Neurocortex (Astraura) publicando y acompañando.",
};

type Space = { emoji: string; name: string; desc: string; url: string };

const BOT = "https://t.me/starseed_nexus_bot";

const CHANNELS: Space[] = [
  { emoji: "📰", name: "StarSeed · Noticias", desc: "Novedades y anuncios del ecosistema", url: "https://t.me/+lDhIdAJQKvc1ODUx" },
  { emoji: "🧠", name: "Exocórtex & IA", desc: "Astraura, skills/MCP y guías de IA", url: "https://t.me/+E82hjlKSDCxhMWEx" },
  { emoji: "🏛️", name: "Constitución & Gobernanza", desc: "Artículos, enmiendas y votaciones", url: "https://t.me/+UTB_PNxc9AY2OTJh" },
  { emoji: "🎨", name: "Estudio & Audiomorphic", desc: "Arte, música y consciencia", url: "https://t.me/+VIUqsUmMZWczZTYx" },
  { emoji: "🌱", name: "Fundación & Sanghas", desc: "Comunidades físicas, eventos y reinversión", url: "https://t.me/+PuWkeYCwFzowYmNh" },
];

const GROUPS: Space[] = [
  { emoji: "🌌", name: "StarSeed · Comunidad", desc: "La Sangha digital: todos participan", url: "https://t.me/+eWHmQmw5A5s3ODhh" },
  { emoji: "☕", name: "Café StarSeed", desc: "Menú, encuentros y Granos & Semillas", url: "https://t.me/+2X7eBDbCblY4YTc5" },
];

export default function ComunidadPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0a0a1a] via-[#0d1024] to-black text-cyan-50 px-5 py-12">
      <div className="mx-auto max-w-3xl">
        <header className="text-center mb-10">
          <div className="text-4xl mb-3">🌱</div>
          <h1 className="text-3xl font-bold tracking-tight">Comunidad StarSeed en Telegram</h1>
          <p className="mt-3 text-cyan-200/70">
            Cinco canales de difusión y dos grupos de comunidad, con el <strong>Neurocortex</strong>{" "}
            (@starseed_nexus_bot) —el cuerpo en Telegram de tu Exocórtex Astraura— publicando y acompañando.
            «Una semilla, muchos mundos.»
          </p>
          <a href={BOT} target="_blank" rel="noopener noreferrer"
             className="inline-flex mt-5 items-center gap-2 rounded-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold px-5 py-2.5 transition">
            🤖 Abrir el chatbot personal
          </a>
        </header>

        <section className="mb-8">
          <h2 className="text-xs uppercase tracking-widest text-cyan-400/60 mb-3">Canales · difusión</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {CHANNELS.map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer"
                 className="group rounded-xl border border-cyan-500/15 bg-cyan-950/30 hover:border-cyan-400/40 hover:bg-cyan-900/30 p-4 transition">
                <div className="flex items-center gap-2 text-base font-semibold"><span className="text-xl">{s.emoji}</span>{s.name}</div>
                <div className="mt-1 text-sm text-cyan-200/60">{s.desc}</div>
              </a>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xs uppercase tracking-widest text-fuchsia-400/60 mb-3">Grupos · todos participan</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {GROUPS.map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer"
                 className="group rounded-xl border border-fuchsia-500/15 bg-fuchsia-950/20 hover:border-fuchsia-400/40 hover:bg-fuchsia-900/20 p-4 transition">
                <div className="flex items-center gap-2 text-base font-semibold"><span className="text-xl">{s.emoji}</span>{s.name}</div>
                <div className="mt-1 text-sm text-fuchsia-200/60">{s.desc}</div>
              </a>
            ))}
          </div>
        </section>

        <footer className="text-center text-sm text-cyan-300/50">
          <p>
            Inicia sesión en{" "}
            <a className="underline hover:text-cyan-200" href="https://starseed-os.vercel.app">StarSeed OS</a>{" "}
            para sincronizar tus chats y memorias de Telegram con tu cuenta soberana.
          </p>
          <div className="mt-3 flex justify-center gap-4">
            <a className="hover:text-cyan-200" href="https://starseed-nexus.vercel.app">Nexus</a>
            <a className="hover:text-cyan-200" href="https://starseed-os.vercel.app">StarSeed OS</a>
            <a className="hover:text-cyan-200" href={BOT}>Bot</a>
          </div>
        </footer>
      </div>
    </main>
  );
}
