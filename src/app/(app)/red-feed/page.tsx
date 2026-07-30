import { NetworkFeed } from "@/components/mesh/network-feed";

export const metadata = {
  title: "Feed de red · StarSeed OS",
  description: "Contenido recibido de otras neuronas por la red sináptica.",
};

export default function RedFeedPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <NetworkFeed />
    </main>
  );
}
