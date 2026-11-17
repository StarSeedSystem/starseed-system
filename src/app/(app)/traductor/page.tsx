import { Suspense } from "react";
import { PantallaTraductor } from "./pantalla-traductor";

export const dynamic = "force-dynamic";

export default function PaginaTraductor() {
    return (
        <Suspense fallback={null}>
            <PantallaTraductor />
        </Suspense>
    );
}
