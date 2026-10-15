// src/lib/cerebros/telepatia-aplicar.ts
import { type Brain, saveBrain } from "@/lib/brains/brains";
import { type VinculoTelepatico } from "./telepatia";

export async function guardarVinculo(cerebro: Brain, v: VinculoTelepatico): Promise<Brain | null> {
  const telepatia = (cerebro.config.telepatia as VinculoTelepatico[]) || [];
  const next = [...telepatia.filter((vt) => vt.id !== v.id), v];
  return saveBrain({ ...cerebro, config: { ...cerebro.config, telepatia: next } });
}

export async function quitarVinculo(cerebro: Brain, id: string): Promise<Brain | null> {
  const telepatia = (cerebro.config.telepatia as VinculoTelepatico[]) || [];
  const next = telepatia.filter((v) => v.id !== id);
  return saveBrain({ ...cerebro, config: { ...cerebro.config, telepatia: next } });
}
