import { modoXRDe } from "@/lib/vivo/xr";
import dynamic from "next/dynamic";
import type { Metadata } from "next/types";

const EscenaOS = dynamic(() => import("@/components/xr/shell/escena-os"), {
  ssr: false,
  loading: () => null,
});

export const metadata: Metadata = {
  title: "Sistema XR",
  description: "Escena base XR de StarSeed OS con entrada automática y recentrado",
};

interface PageProps {
  searchParams: Promise<{ modo?: string }>;
}

export default async function PageXR({ searchParams }: PageProps) {
  const params = await searchParams;
  const modo = modoXRDe(params.modo);
  
  return <EscenaOS modo={modo} />;
}
