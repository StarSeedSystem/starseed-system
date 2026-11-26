import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEPLOY_DIR = join(__dirname, "..", "..", "..", "..", "deploy", "n8n-hf");

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateArranqueScript(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const scriptPath = join(DEPLOY_DIR, "arranque.sh");
  let script: string;
  try {
    script = readFileSync(scriptPath, "utf-8");
  } catch {
    return { valid: false, errors: [`Cannot read ${scriptPath}`], warnings: [] };
  }

  if (!script.includes("set -eu")) {
    errors.push("Missing 'set -eu' for strict error handling");
  }

  if (script.includes('import:workflow --separate --input="$FLUJOS"')) {
    errors.push("Uses directory-wide import with --separate which can create duplicates");
  }

  if (!script.includes("list:workflow --onlyId")) {
    errors.push("Does not check existing workflow IDs before import");
  }

  if (!script.includes("get_workflow_id")) {
    errors.push("Missing function to extract workflow ID from JSON files");
  }

  if (!script.includes("existing_ids")) {
    errors.push("Does not store existing workflow IDs for comparison");
  }

  if (script.includes('import:workflow --input="') && !script.includes("--separate")) {
    // Good: imports individually
  } else if (!script.includes('import:workflow --input="')) {
    errors.push("Does not import workflows individually");
  }

  if (!script.includes("update:workflow --id=")) {
    errors.push("Missing workflow activation logic");
  }

  if (!script.includes("--active=true")) {
    errors.push("Missing --active=true flag for activation");
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validateDockerfile(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const dockerfilePath = join(DEPLOY_DIR, "Dockerfile");
  let dockerfile: string;
  try {
    dockerfile = readFileSync(dockerfilePath, "utf-8");
  } catch {
    return { valid: false, errors: [`Cannot read ${dockerfilePath}`], warnings: [] };
  }

  if (!dockerfile.includes("N8N_SECURE_COOKIE=true")) {
    errors.push("Missing N8N_SECURE_COOKIE=true (secure session cookies required)");
  }

  if (dockerfile.includes("N8N_SECURE_COOKIE=false")) {
    errors.push("Has N8N_SECURE_COOKIE=false which is insecure");
  }

  if (!dockerfile.includes("FROM docker.n8n.io/n8nio/n8n:1.63.4")) {
    warnings.push("Should use pinned n8n version 1.63.4");
  }

  if (!dockerfile.includes("EXPOSE 7860")) {
    errors.push("Missing EXPOSE 7860 for Hugging Face Spaces");
  }

  if (!dockerfile.includes("N8N_PORT=7860")) {
    errors.push("Missing N8N_PORT=7860");
  }

  if (!dockerfile.includes("COPY arranque.sh /arranque.sh")) {
    errors.push("Missing COPY arranque.sh");
  }

  if (!dockerfile.includes("COPY flujos /opt/flujos")) {
    errors.push("Missing COPY flujos directory");
  }

  if (!dockerfile.includes("USER node")) {
    warnings.push("Should run as non-root user (node)");
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validateWorkflowFiles(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const workflowFiles = ["pieza-lista.json", "publicada.json", "revertida.json"];

  for (const file of workflowFiles) {
    const filePath = join(DEPLOY_DIR, "flujos", file);
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`Cannot read workflow file: ${file}`);
      continue;
    }

    let workflow: Record<string, unknown>;
    try {
      workflow = JSON.parse(content);
    } catch {
      errors.push(`Invalid JSON in workflow file: ${file}`);
      continue;
    }

    if (!workflow.id || typeof workflow.id !== "string" || workflow.id.length === 0) {
      errors.push(`Workflow ${file} missing stable 'id' field`);
    } else if (!workflow.id.startsWith("produccion-")) {
      warnings.push(`Workflow ${file} id '${workflow.id}' should start with 'produccion-'`);
    }

    if (!workflow.name || typeof workflow.name !== "string") {
      errors.push(`Workflow ${file} missing 'name' field`);
    }

    if (!Array.isArray(workflow.nodes)) {
      errors.push(`Workflow ${file} missing 'nodes' array`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validateAll(): ValidationResult {
  const results = [
    validateArranqueScript(),
    validateDockerfile(),
    validateWorkflowFiles(),
  ];

  const allErrors = results.flatMap((r) => r.errors);
  const allWarnings = results.flatMap((r) => r.warnings);

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}