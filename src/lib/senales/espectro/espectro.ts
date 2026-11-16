export interface SenalEspectro {
  tipo: "wifi";
  banda?: "2.4GHz" | "5GHz" | "6GHz";
  frecuenciaMhz?: number;
  rssi?: number;
  origen: "medida" | "declarada" | "estimada";
  timestamp: number;
}