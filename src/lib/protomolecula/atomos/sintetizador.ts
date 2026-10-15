import { DefinicionAtomo } from "../registro-atomos";
import type { Parametro } from "../tipos";
import { documentoSintetizador } from "./sintetizador-html";

export const SINTETIZADOR: DefinicionAtomo = {
  herramientaId: "sintetizador-web-audio",
  nombre: "Sintetizador Web Audio",
  categoria: "audio",
  integracion: "iframe-aislado",
  control: "total",
  entradas: [],
  salidas: ["wav"],
  ficha: {
    web: "https://developer.mozilla.org/docs/Web/API/Web_Audio_API",
    licencia: "API del navegador"
  },
  vista: {
    tipo: "documento",
    documento: documentoSintetizador
  },
  parametros: [
    { id: "onda", nombre: "Onda", sinonimos: ["forma de onda", "tipo de onda"], tipo: "opcion", opciones: ["seno", "cuadrada", "sierra", "triángulo"], defecto: "seno" },
    { id: "frecuencia", nombre: "Frecuencia", sinonimos: ["freq", "hz", "tono"], tipo: "numero", min: 20, max: 20000, paso: 1, unidad: "Hz", defecto: 440 },
    { id: "volumen", nombre: "Volumen", sinonimos: ["gain", "ganancia", "db"], tipo: "numero", min: -60, max: 6, paso: 0.1, unidad: "dB", defecto: -12 },
    { id: "filtro", nombre: "Filtro", sinonimos: ["tipo de filtro", "filtro activo"], tipo: "opcion", opciones: ["paso bajo", "paso alto", "banda"], defecto: "paso bajo" },
    { id: "corte", nombre: "Frecuencia de corte", sinonimos: ["frecuencia de corte", "fc"], tipo: "numero", min: 20, max: 20000, paso: 1, unidad: "Hz", defecto: 4000 },
    { id: "resonancia", nombre: "Resonancia", sinonimos: ["q", "realimentación"], tipo: "numero", min: 0, max: 20, paso: 0.1, unidad: "", defecto: 1 },
    { id: "ataque", nombre: "Ataque", sinonimos: ["attack", "inicio"], tipo: "numero", min: 0, max: 2, paso: 0.01, unidad: "s", defecto: 0 },
    { id: "liberacion", nombre: "Liberación", sinonimos: ["release", "liberación"], tipo: "numero", min: 0, max: 5, paso: 0.01, unidad: "s", defecto: 0 },
    { id: "eco", nombre: "Echo", sinonimos: ["echo", "reverberación"], tipo: "numero", min: 0, max: 100, paso: 1, unidad: "%", defecto: 0 },
    { id: "sonando", nombre: "Sonando", sinonimos: ["estado", "encendido"], tipo: "booleano", defecto: false },
    { id: "nota", nombre: "Nota", sinonimos: ["tocar", "nota", "disparo"], tipo: "disparo" }
  ]
};