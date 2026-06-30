// ════════════════════════════════════════════════════════════════
// Integraciones · Barril — punto de entrada único
// ----------------------------------------------------------------
// Reexporta el contrato público para que la UI de configuración y el
// motor de Aurora importen desde "@/lib/integrations".
// ════════════════════════════════════════════════════════════════

export type {
  IntegrationConfig,
  IntegrationAction,
  IntegrationDescriptor,
  IntegrationResult,
  IntegrationCategory,
} from "./types";

export {
  INTEGRATIONS,
  getIntegration,
  integrationConfigKey,
  loadIntegrationConfig,
  saveIntegrationConfig,
} from "./registry";

export { runIntegration, testIntegration } from "./run";

export {
  AURORA_INTEGRATION_TOOLS,
  getAuroraTool,
  isAuroraToolAvailable,
  listAvailableAuroraTools,
  runAuroraTool,
  auroraToolsPromptSection,
} from "./aurora-tools";
export type { AuroraIntegrationTool } from "./aurora-tools";
