import { fusionarEstados, prioridadDeElemento, excedeLimite, EstadoSala, ElementoSala } from "../sincronia-sala";

export type Mutante = {
  nombre: string;
  fusionarEstados?: typeof fusionarEstados;
  prioridadDeElemento?: typeof prioridadDeElemento;
  excedeLimite?: typeof excedeLimite;
};

export function generarMutantes(): Mutante[] {
  return [
    {
      nombre: "sin-fusionar-estados",
      fusionarEstados: () => ({ resultado: { salaId: "", elementos: {}, reloj: 0 }, conflictos: ["mutado"] }),
    },
    {
      nombre: "sin-prioridad-elemento",
      prioridadDeElemento: () => 3,
    },
    {
      nombre: "sin-excede-limite",
      excedeLimite: () => false,
    },
  ];
}