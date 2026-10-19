"use client";
// Envoltorio de cliente de la orbe de la Protomolécula. Next 15 no permite `next/dynamic` con
// `ssr: false` en un componente de servidor (src/app/layout.tsx lo es): `next build` fallaba con
// «`ssr: false` is not allowed with `next/dynamic` in Server Components». La carga diferida y sin
// SSR vive aquí, en el cliente, como ya hace el resto de envoltorios del layout.
import dynamic from "next/dynamic";

const OrbeProtomolecula = dynamic(() => import("./orbe-protomolecula"), { ssr: false });

export default OrbeProtomolecula;
