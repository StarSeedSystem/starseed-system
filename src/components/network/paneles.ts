// Puente de paneles de la Red: una sola implementación montada en dos sitios.
//
// Las cuatro rutas de /network (/network, /politics, /education, /culture)
// están enlazadas desde más de sesenta lugares del OS (dock, catálogo de
// apps, widgets, páginas de entidad, Aurora, onboarding). Copiar su
// contenido al Hub crearía dos versiones que se irían separando con el
// tiempo, justo lo que se quiere evitar. Reexportarlas aquí permite que
// el Hub las monte como pestaña ("Panorama Sociocultural") sin duplicar
// código: UNA implementación, dos sitios.
//
// Es un puente a propósito: el día que alguien quiera mover el cuerpo de
// esas páginas a componentes de verdad, solo tendrá que cambiar ESTE
// archivo y el Hub seguirá funcionando igual.
//
// CONTRATO que esto exige a las cuatro páginas:
//  1. Deben seguir siendo componentes de CLIENTE ("use client"): un
//     componente de servidor no se puede montar dentro del Hub.
//  2. No deben exportar `metadata` ni `generateMetadata`: eso las
//     convertiría en rutas de Next y rompería el montaje como componente.
//  3. No deben usar usePathname, useSearchParams ni useRouter: dentro de
//     una pestaña del Hub la URL no cambia, así que depender de la ruta
//     las desincronizaría.
// La prueba __tests__/paneles.test.ts vigila estas tres condiciones.

export { default as PanelPanorama } from "@/app/(app)/network/page";
export { default as PanelPolitica } from "@/app/(app)/network/politics/page";
export { default as PanelEducacion } from "@/app/(app)/network/education/page";
export { default as PanelCultura } from "@/app/(app)/network/culture/page";
