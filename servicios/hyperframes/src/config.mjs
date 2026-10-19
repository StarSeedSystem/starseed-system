// config.mjs
// Configuración para el servicio HyperFrames

export function leerConfig() {
  const config = {
    puerto: 4490,
    escucha: "127.0.0.1",
    version: "1.0.0",
    maxCuerpo: 8 * 1024 * 1024,
    telemetriaApagada: true,
  };

  return config;
}

export function resumenConfig(config) {
  return {
    puerto: config.puerto,
    version: config.version,
    maxCuerpo: config.maxCuerpo,
    telemetriaApagada: config.telemetriaApagada,
  };
}