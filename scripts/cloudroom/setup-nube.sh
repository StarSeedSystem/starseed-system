#!/bin/sh
# StarSeed · MetaGenesis: opencode con los proveedores GRATUITOS; las claves llegan como variables de entorno de Cloudroom (nunca en este script).
mkdir -p "$HOME/.config/opencode"
cat > "$HOME/.config/opencode/opencode.json" <<'JSON'
{
 "$schema": "https://opencode.ai/config.json",
 "lsp": {
  "typescript": {
   "disabled": true
  }
 },
 "provider": {
  "nvidia": {
   "npm": "@ai-sdk/openai-compatible",
   "name": "NVIDIA NIM (StarSeed)",
   "options": {
    "baseURL": "https://integrate.api.nvidia.com/v1",
    "apiKey": "{env:NVIDIA_API_KEY}"
   },
   "models": {
    "nvidia/nemotron-3-super-120b-a12b": {
     "name": "Nemotron 3 Super 120B (NIM)"
    },
    "z-ai/glm-5.3": {
     "name": "glm-5.3"
    },
    "moonshotai/kimi-k3": {
     "name": "Kimi K3 (NIM)"
    },
    "nvidia/nemotron-3-ultra-550b-a55b": {
     "name": "Nemotron 3 Ultra 550B (NIM)"
    }
   }
  },
  "xkiro": {
   "npm": "@ai-sdk/openai-compatible",
   "name": "xKiro (StarSeed)",
   "options": {
    "baseURL": "https://api.xkiro.com/v1",
    "apiKey": "{env:XKIRO_API_KEY}"
   },
   "models": {
    "qwen/qwen3-coder-plus:free": {
     "name": "Qwen3 Coder Plus (Free)"
    },
    "deepseek/deepseek-v4-pro": {
     "name": "DeepSeek V4 Pro"
    },
    "deepseek/deepseek-v4-flash": {
     "name": "DeepSeek V4 Flash"
    },
    "minimax/minimax-m3:free": {
     "name": "MiniMax M3 (Free)"
    },
    "qwen/qwen3.8-max:free": {
     "name": "Qwen3.8 Max (Free)"
    },
    "qwen/qwen3.7-plus:free": {
     "name": "Qwen3.7 Plus (Free)"
    },
    "mistralai/devstral-medium": {
     "name": "Devstral 2"
    },
    "openai/gpt-5.3-codex-spark": {
     "name": "Codex 5.3 Spark"
    },
    "qwen/qwen3.5-flash:free": {
     "name": "Qwen3.5 Flash (Free)"
    },
    "minimax/minimax-m2.7-highspeed:free": {
     "name": "MiniMax M2.7 Highspeed (Free)"
    }
   }
  },
  "llm7": {
   "npm": "@ai-sdk/openai-compatible",
   "name": "LLM7 (sin clave)",
   "options": {
    "baseURL": "https://api.llm7.io/v1",
    "apiKey": "sin-clave"
   },
   "models": {
    "minimax-m2.7": {
     "name": "minimax-m2.7"
    }
   }
  },
  "apinex": {
   "npm": "@ai-sdk/openai-compatible",
   "name": "apinex (pasarela)",
   "options": {
    "baseURL": "https://apinex.bond/v1",
    "apiKey": "{env:STARSEED_PASARELA_APINEX_KEY}"
   },
   "models": {
    "free/deepseek-v4-flash-0731": {
     "name": "deepseek-v4-flash-0731"
    },
    "free/deepseek-v4-pro-0813": {
     "name": "deepseek-v4-pro-0813"
    },
    "free/qwen-3.8-max": {
     "name": "qwen-3.8-max"
    },
    "free/gpt-5.6-luna": {
     "name": "gpt-5.6-luna"
    },
    "free/gemini-3.1-pro": {
     "name": "gemini-3.1-pro"
    },
    "free/gemini-3.8-flash": {
     "name": "gemini-3.8-flash"
    },
    "free/muse-spark-1.3": {
     "name": "muse-spark-1.3"
    },
    "free/glm-5.3-flash": {
     "name": "glm-5.3-flash"
    }
   }
  },
  "tokenrouter": {
   "npm": "@ai-sdk/openai-compatible",
   "name": "TokenRouter",
   "options": {
    "baseURL": "https://api.tokenrouter.com/v1",
    "apiKey": "{env:TOKENROUTER_API_KEY}"
   },
   "models": {
    "z-ai/glm-5.3-free": {
     "name": "GLM 5.3 (free)"
    }
   }
  },
  "groq": {
   "npm": "@ai-sdk/openai-compatible",
   "name": "groq (pasarela)",
   "options": {
    "baseURL": "https://api.groq.com/openai/v1",
    "apiKey": "{env:GROQ_API_KEY}"
   },
   "models": {
    "openai/gpt-oss-120b": {
     "name": "gpt-oss-120b"
    },
    "qwen/qwen3.8-27b": {
     "name": "qwen3.8-27b"
    },
    "openai/gpt-oss-20b": {
     "name": "gpt-oss-20b"
    },
    "qwen/qwen3.6-27b": {
     "name": "qwen3.6-27b"
    }
   }
  },
  "aihubmix": {
   "npm": "@ai-sdk/openai-compatible",
   "name": "AIHubMix",
   "options": {
    "baseURL": "https://aihubmix.com/v1",
    "apiKey": "{env:AIHUBMIX_API_KEY}"
   },
   "models": {
    "gemini-3.7-flash-free": {
     "name": "Gemini 3.7 Flash (free)"
    },
    "coding-glm-5.3-free": {
     "name": "GLM 5.3 coding (free)"
    },
    "coding-minimax-m3-free": {
     "name": "MiniMax M3 coding (free)"
    },
    "coding-kimi-k3-free": {
     "name": "Kimi K3 coding (free)"
    }
   }
  }
 }
}
JSON
mkdir -p "$HOME/.pi/agent"
cat > "$HOME/.pi/agent/models.json" <<'JSON'
{
 "$schema": "https://pi.dev/schemas/models.schema.json",
 "providers": {
  "nvidia": {
   "baseUrl": "https://integrate.api.nvidia.com/v1",
   "api": "openai-completions",
   "apiKey": "$NVIDIA_API_KEY",
   "models": [
    {
     "id": "z-ai/glm-5.3"
    }
   ]
  },
  "xkiro": {
   "baseUrl": "https://api.xkiro.com/v1",
   "api": "openai-completions",
   "apiKey": "$XKIRO_API_KEY",
   "headers": {
    "User-Agent": "StarSeed-MetaGenesis/1.0"
   },
   "models": [
    {
     "id": "qwen/qwen3-coder-plus:free"
    },
    {
     "id": "minimax/minimax-m3:free"
    },
    {
     "id": "qwen/qwen3.8-max:free"
    }
   ]
  }
 }
}
JSON
exit 0
