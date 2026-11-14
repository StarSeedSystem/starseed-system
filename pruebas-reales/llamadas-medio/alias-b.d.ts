// LLA1114B · tipos del alias `@b/…` de `entrada.ts`. El lado B del banco puede venir de OTRO árbol (lo resuelve
// `construir.mjs` al empaquetar); para el comprobador de tipos es el mismo módulo que `@/…` de este árbol.
// Sin esta declaración, `tsc` (la puerta y la CI comprueban `pruebas-reales/**`) no encuentra `@b/…`.
declare module "@b/lib/llamadas/motor" {
  export * from "@/lib/llamadas/motor";
}
declare module "@b/lib/llamadas/voz-datos/diagnostico" {
  export * from "@/lib/llamadas/voz-datos/diagnostico";
}
