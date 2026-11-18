import { Suspense } from "react";
import { TraductorApp } from "@/components/traductor/traductor-app";

export const dynamic = "force-dynamic";

export default function PaginaTraductor() {
    return (
        <Suspense fallback={null}>
            <TraductorApp />
        </Suspense>
    );
}
