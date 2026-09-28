"use client";
/**
 * Montaje global del aviso de novedad de arranque (Ola 384 · D2).
 * ----------------------------------------------------------------------------
 * Carga perezosa (`next/dynamic`, `ssr: false`): en la inmensa mayoría de las
 * visitas el aviso no se muestra nunca (ya configurado, ya respondido, cuenta
 * nueva…), así que su lógica y `PreferenciasArranque` no deben pesar en el
 * paquete inicial de ninguna ruta. Se monta UNA vez en el layout raíz, junto
 * al resto del cromo global (`<BloqueoMontaje/>`, `<PrimerArranque/>`…).
 */
import dynamic from "next/dynamic";

const AvisoNovedadArranque = dynamic(
    () => import("./aviso-novedad-arranque").then((m) => m.AvisoNovedadArranque),
    { ssr: false },
);

export function AvisoNovedadMontaje() {
    return <AvisoNovedadArranque />;
}

export default AvisoNovedadMontaje;
