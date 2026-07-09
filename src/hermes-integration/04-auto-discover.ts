/**
 * 🌌 StarSeed OS — AutoDiscover System
 *
 * Escanea el sistema del usuario en busca de:
 * - IAs locales (Ollama, llama.cpp, LM Studio)
 * - APIs configuradas (.env, config.yaml, keychains)
 * - Skills de Hermes Agent instalados
 * - Configuraciones de agentes externos
 *
 * Cada "descubrimiento" se convierte en un nodo en la memoria unificada
 * y se pregunta al usuario si desea integrarlo.
 */

import type {
  DiscoveryResult, DiscoveredProvider, DiscoveredKey, DiscoveredAgent, SkillDocument, SkillMetadata
} from './01-types';

// ========================================================================
// File system access (client-side compatible)
// ========================================================================

interface FileSystemAPI {
  readFile(path: string): Promise<string | null>;
  readDir(path: string): Promise<string[] | null>;
  fileExists(path: string): Promise<boolean>;
}

/** Fallback read that tries multiple methods depending on environment */
const fs: FileSystemAPI = {
  async readFile(path: string): Promise<string | null> {
    // In browser context, try to read from IndexedDB or return null
    if (typeof window !== 'undefined') {
      try {
        const res = await fetch(`/api/fs/read?path=${encodeURIComponent(path)}`);
        if (res.ok) return res.text();
      } catch {}
      return null;
    }
    return null;
  },

  async readDir(path: string): Promise<string[] | null> {
    if (typeof window !== 'undefined') {
      try {
        const res = await fetch(`/api/fs/readdir?path=${encodeURIComponent(path)}`);
        if (res.ok) {
          const data = await res.json();
          return Array.isArray(data) ? data : null;
        }
      } catch {}
      return null;
    }
    return null;
  },

  async fileExists(path: string): Promise<boolean> {
    const content = await this.readFile(path);
    return content !== null;
  },
};

// ========================================================================
// AutoDiscover
// ========================================================================

export class AutoDiscover {
  private results: DiscoveryResult = {
    providers: [],
    agents: [],
    skills: [],
    memories: [],
    apiKeys: [],
  };

  /** Escanea todo el sistema y retorna todo lo encontrado */
  async scanAll(): Promise<DiscoveryResult> {
    this.results = { providers: [], agents: [], skills: [], memories: [], apiKeys: [] };

    const scans = await Promise.allSettled([
      this.scanLocalAI(),
      this.scanEnvFiles(),
      this.scanHermesConfig(),
      this.scanHermesSkills(),
      this.scanKnownLocations(),
    ]);

    for (const scan of scans) {
      if (scan.status === 'fulfilled' && scan.value) {
        this.merge(scan.value);
      }
    }

    return this.results;
  }

  // ======================================================================
  // 1. IAs Locales
  // ======================================================================

  private async scanLocalAI(): Promise<Partial<DiscoveryResult>> {
    const providers: DiscoveredProvider[] = [];

    // Ollama — puerto 11434
    try {
      const res = await fetch('http://localhost:11434/api/tags', {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const data = await res.json();
        providers.push({
          id: 'ollama',
          label: 'Ollama (Local)',
          baseUrl: 'http://localhost:11434',
          requiresKey: false,
          local: true,
          models: (data.models || []).map((m: any) => m.name),
          status: 'available',
          source: 'localhost:11434',
        });
      }
    } catch {}

    // LM Studio — puerto 1234
    try {
      const res = await fetch('http://localhost:1234/v1/models', {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const data = await res.json();
        providers.push({
          id: 'openai-compatible',
          label: 'LM Studio (Local)',
          baseUrl: 'http://localhost:1234/v1',
          requiresKey: false,
          local: true,
          models: (data.data || []).map((m: any) => m.id),
          status: 'available',
          source: 'localhost:1234',
        });
      }
    } catch {}

    // llama.cpp / vLLM — puertos 8080, 8000
    for (const port of [8080, 8000]) {
      try {
        const url = `http://localhost:${port}/v1/models`;
        const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
        if (res.ok) {
          const data = await res.json();
          const label = (data.data || []).some((m: any) => m.id?.includes('llama'))
            ? `llama.cpp (localhost:${port})`
            : `vLLM / OpenAI-compat (localhost:${port})`;
          providers.push({
            id: 'openai-compatible',
            label,
            baseUrl: `http://localhost:${port}/v1`,
            requiresKey: false,
            local: true,
            models: (data.data || []).map((m: any) => m.id),
            status: 'available',
            source: `localhost:${port}`,
          });
        }
      } catch {}
    }

    return { providers };
  }

  // ======================================================================
  // 2. Variables de Entorno y Configs
  // ======================================================================

  private async scanEnvFiles(): Promise<Partial<DiscoveryResult>> {
    const apiKeys: DiscoveredKey[] = [];
    const providers: DiscoveredProvider[] = [];

    const paths = [
      '.env', '.env.local', '.env.development', '.env.production',
    ];

    for (const envPath of paths) {
      const content = await fs.readFile(envPath);
      if (!content) continue;

      // Patrones de API keys conocidas
      const patterns: [RegExp, string, string][] = [
        [/OPENAI_API_KEY[=: ]+['\"]?(\S+)['\"]?/i, 'openai', 'OpenAI'],
        [/ANTHROPIC_API_KEY[=: ]+['\"]?(\S+)['\"]?/i, 'anthropic', 'Anthropic'],
        [/GOOGLE_API_KEY[=: ]+['\"]?(\S+)['\"]?/i, 'google', 'Google Gemini'],
        [/GEMINI_API_KEY[=: ]+['\"]?(\S+)['\"]?/i, 'google', 'Google Gemini'],
        [/DEEPSEEK_API_KEY[=: ]+['\"]?(\S+)['\"]?/i, 'deepseek', 'DeepSeek'],
        [/GROQ_API_KEY[=: ]+['\"]?(\S+)['\"]?/i, 'groq', 'Groq'],
        [/OPENROUTER_API_KEY[=: ]+['\"]?(\S+)['\"]?/i, 'openrouter', 'OpenRouter'],
        [/HF_TOKEN[=: ]+['\"]?(\S+)['\"]?/i, 'huggingface', 'HuggingFace'],
        [/HUGGINGFACE_TOKEN[=: ]+['\"]?(\S+)['\"]?/i, 'huggingface', 'HuggingFace'],
        [/TOGETHER_API_KEY[=: ]+['\"]?(\S+)['\"]?/i, 'together', 'Together AI'],
        [/XAI_API_KEY[=: ]+['\"]?(\S+)['\"]?/i, 'xai', 'xAI/Grok'],
        [/MISTRAL_API_KEY[=: ]+['\"]?(\S+)['\"]?/i, 'mistral', 'Mistral'],
        [/REPLICATE_API_TOKEN[=: ]+['\"]?(\S+)['\"]?/i, 'replicate', 'Replicate'],
        [/COHERE_API_KEY[=: ]+['\"]?(\S+)['\"]?/i, 'cohere', 'Cohere'],
        [/AI21_API_KEY[=: ]+['\"]?(\S+)['\"]?/i, 'ai21', 'AI21 Labs'],
        [/PERPLEXITY_API_KEY[=: ]+['\"]?(\S+)['\"]?/i, 'perplexity', 'Perplexity'],
      ];

      for (const [pattern, providerId, label] of patterns) {
        const match = content.match(pattern);
        if (match) {
          const key = match[1].trim();
          if (key.length > 10) { // Sanity check: real keys are long
            apiKeys.push({
              provider: providerId,
              label,
              keyPreview: key.slice(0, 12) + '••••' + key.slice(-4),
              source: envPath,
              encrypted: false,
            });
          }
        }
      }
    }

    return { apiKeys, providers };
  }

  // ======================================================================
  // 3. Hermes Agent Config
  // ======================================================================

  private async scanHermesConfig(): Promise<Partial<DiscoveryResult>> {
    const providers: DiscoveredProvider[] = [];

    const hermesConfigPath = '.hermes/config.yaml';
    const content = await fs.readFile(hermesConfigPath);

    if (!content) return { providers };

    // Detectar proveedor configurado
    const providerMatch = content.match(/^\s*provider:\s*['\"]?(\w+)['\"]?\s*$/m);
    const modelMatch = content.match(/^\s*default:\s*['\"]?([\w\/.-]+)['\"]?\s*$/m);

    if (providerMatch) {
      const providerId = providerMatch[1];
      const providerName = providerId.charAt(0).toUpperCase() + providerId.slice(1);
      providers.push({
        id: providerId,
        label: `Hermes: ${providerName}`,
        baseUrl: '',
        requiresKey: true,
        local: false,
        models: modelMatch ? [modelMatch[1]] : [],
        status: 'configured',
        source: '~/.hermes/config.yaml',
      });
    }

    // Detectar otros proveedores en el archivo
    const providerSections = content.match(/^\s+(\w+):\s*$/gm);
    if (providerSections) {
      for (const section of providerSections) {
        const name = section.trim().replace(':', '');
        if (!['default', 'provider', 'model'].includes(name)) {
          providers.push({
            id: name,
            label: `Hermes: ${name.charAt(0).toUpperCase() + name.slice(1)}`,
            baseUrl: '',
            requiresKey: true,
            local: false,
            models: [],
            status: 'configured',
            source: '~/.hermes/config.yaml',
          });
        }
      }
    }

    return { providers };
  }

  // ======================================================================
  // 4. Hermes Skills
  // ======================================================================

  private async scanHermesSkills(): Promise<Partial<DiscoveryResult>> {
    const skills: SkillDocument[] = [];

    const skillsBase = '.hermes/skills/';
    const dirs = await fs.readDir(skillsBase);
    if (!dirs) return { skills };

    for (const entry of dirs) {
      const skillPath = `${skillsBase}${entry}/SKILL.md`;
      const content = await fs.readFile(skillPath);
      if (!content) {
        // Maybe it's a direct file, not a directory
        const flatContent = await fs.readFile(`${skillsBase}${entry}`);
        if (flatContent && entry.endsWith('.md')) {
          const meta = this.parseSkillFrontmatter(flatContent);
          if (meta.name) {
            skills.push({
              metadata: { ...meta, name: meta.name, loadMode: 'manual' },
              content: flatContent,
              linkedFiles: {},
            });
          }
        }
        continue;
      }

      const meta = this.parseSkillFrontmatter(content);
      if (meta.name) {
        skills.push({
          metadata: { ...meta, name: meta.name, loadMode: 'auto' },
          content,
          linkedFiles: {},
        });
      }
    }

    return { skills };
  }

  // ======================================================================
  // 5. Otras ubicaciones conocidas
  // ======================================================================

  private async scanKnownLocations(): Promise<Partial<DiscoveryResult>> {
    const apiKeys: DiscoveredKey[] = [];

    // ~/.config/ (Linux), ~/Library/ (macOS)
    const altConfigPaths = [
      '.config/hermes/.env',
      '.config/hermes/config.yaml',
      'Library/Application Support/hermes/.env',
      'AppData/Local/hermes/.env',
    ];

    for (const path of altConfigPaths) {
      const content = await fs.readFile(path);
      if (!content) continue;

      // Extract API keys from content
      const keyMatch = content.match(/API_KEY[=: ]+['\"]?(\S+)['\"]?/i);
      if (keyMatch && keyMatch[1].length > 10) {
        apiKeys.push({
          provider: 'generic',
          label: `API Key (${path.split('/').pop()})`,
          keyPreview: keyMatch[1].slice(0, 8) + '••••',
          source: path,
          encrypted: false,
        });
      }
    }

    return { apiKeys };
  }

  // ======================================================================
  // HELPERS
  // ======================================================================

  private parseSkillFrontmatter(content: string): Partial<SkillMetadata> {
    const meta: Partial<SkillMetadata> = {};

    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return meta;

    const frontmatter = frontmatterMatch[1];
    const lines = frontmatter.split('\n');

    for (const line of lines) {
      const [key, ...rest] = line.split(':');
      const value = rest.join(':').trim().replace(/['"]/g, '');

      switch (key.trim()) {
        case 'name': meta.name = value; break;
        case 'description': meta.description = value; break;
        case 'version': meta.version = value; break;
        case 'tags':
          meta.tags = value.replace(/[\[\]]/g, '').split(',').map(t => t.trim());
          break;
        case 'author': meta.author = value; break;
        case 'created': meta.created = value; break;
        case 'updated': meta.updated = value; break;
      }
    }

    return meta;
  }

  private merge(partial: Partial<DiscoveryResult>): void {
    if (partial.providers) {
      const existing = new Set(this.results.providers.map(p => p.id));
      this.results.providers.push(
        ...partial.providers.filter(p => !existing.has(p.id))
      );
    }
    if (partial.apiKeys) {
      const existing = new Set(this.results.apiKeys.map(k => k.provider + k.source));
      this.results.apiKeys.push(
        ...partial.apiKeys.filter(k => !existing.has(k.provider + k.source))
      );
    }
    if (partial.skills) {
      const existing = new Set(this.results.skills.map(s => s.metadata.name));
      this.results.skills.push(
        ...partial.skills.filter(s => !existing.has(s.metadata.name))
      );
    }
    if (partial.agents) {
      this.results.agents.push(...partial.agents);
    }
    if (partial.memories) {
      const existing = new Set(this.results.memories.map(m => m.id));
      this.results.memories.push(
        ...partial.memories.filter(m => !existing.has(m.id))
      );
    }
  }

  /** Obtiene un resumen human-readable del escaneo */
  getSummary(): string {
    const parts: string[] = [];
    if (this.results.providers.length > 0) {
      parts.push(`${this.results.providers.length} proveedores IA`);
    }
    if (this.results.apiKeys.length > 0) {
      parts.push(`${this.results.apiKeys.length} API keys`);
    }
    if (this.results.skills.length > 0) {
      parts.push(`${this.results.skills.length} skills`);
    }
    if (this.results.agents.length > 0) {
      parts.push(`${this.results.agents.length} agentes`);
    }
    return parts.length > 0
      ? parts.join(', ')
      : 'No se encontraron recursos de IA';
  }
}