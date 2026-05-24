import { NextRequest, NextResponse } from "next/server";

// ─── Design Context Enrichment ───────────────────────────────────
const DESIGN_CONTEXT = `Design System: StarSeed Network — Ontocratic Cyberdelic Transhumanist aesthetic.
Color Palette: Deep space (#0F0F23) background, violet (#8B5CF6) primary, cyan (#00D4FF) accent, amber (#FBBF24) highlight.
Visual Style: Liquid glass materials, backdrop-blur, chromatic aberration, holographic gradients, smooth micro-animations.
Typography: Thin/light headers (Rajdhani 300), regular body (Inter 400), monospace code (JetBrains Mono).
Layout: Perimeter Paradigm with floating panels, macOS-style dock, side curtains, and glass containers.
Components: Crystal-mode cards, liquid glass buttons with glow, neon input borders, floating labels.

Generate the following UI component with this aesthetic:
`;

// ─── Stitch MCP Configuration ────────────────────────────────────
const STITCH_PROJECT_ID = process.env.STITCH_PROJECT_ID || "9377170978642673597";
const STITCH_API_URL = process.env.STITCH_MCP_URL || "https://autopush-stitchmcpserver-pa.googleapis.com/sse";
const STITCH_API_KEY = process.env.STITCH_API_KEY || "";

interface StitchRequest {
    prompt: string;
    deviceType?: "DESKTOP" | "MOBILE" | "TABLET";
    modelId?: "GEMINI_3_PRO" | "GEMINI_3_FLASH";
}

interface StitchGenerateResult {
    screenId: string;
    html: string;
    css: string;
    suggestions?: string[];
    outputComponents?: string;
}

export async function POST(req: NextRequest) {
    try {
        const body: StitchRequest = await req.json();

        if (!body.prompt?.trim()) {
            return NextResponse.json(
                { error: "Prompt is required" },
                { status: 400 }
            );
        }

        // Enrich the prompt with design context
        const enrichedPrompt = DESIGN_CONTEXT + body.prompt;

        // ─── Call Stitch MCP via JSON-RPC ─────────────────────────
        // The Stitch MCP server exposes generate_screen_from_text
        // We use the MCP tool calling convention
        const toolCall = {
            jsonrpc: "2.0",
            method: "tools/call",
            id: Date.now(),
            params: {
                name: "generate_screen_from_text",
                arguments: {
                    projectId: STITCH_PROJECT_ID,
                    prompt: enrichedPrompt,
                    deviceType: body.deviceType || "DESKTOP",
                    modelId: body.modelId || "GEMINI_3_FLASH",
                },
            },
        };

        // Attempt the MCP call
        if (STITCH_API_KEY) {
            try {
                const stitchResponse = await fetch(STITCH_API_URL, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-api-key": STITCH_API_KEY,
                    },
                    body: JSON.stringify(toolCall),
                    signal: AbortSignal.timeout(120_000), // 2 min timeout
                });

                if (stitchResponse.ok) {
                    const data = await stitchResponse.json();

                    // Extract the generated content from the MCP response
                    const result = data?.result?.content?.[0]?.text;
                    if (result) {
                        const parsed = JSON.parse(result);
                        return NextResponse.json({
                            success: true,
                            screenId: parsed.screenId || "",
                            html: parsed.html || "",
                            css: parsed.css || "",
                            code: parsed.html || parsed.code || result,
                            suggestions: parsed.outputComponents || null,
                            enrichedPrompt,
                        });
                    }
                }

                // If MCP call failed, fall through to local generation
                console.warn("Stitch MCP call failed, using local fallback");
            } catch (mcpError) {
                console.warn("Stitch MCP unreachable, using local fallback:", mcpError);
            }
        }

        // ─── Local Fallback ──────────────────────────────────────
        // When MCP is unavailable, generate a code template based on the prompt
        const fallbackCode = generateFallbackComponent(body.prompt, body.deviceType || "DESKTOP");

        return NextResponse.json({
            success: true,
            screenId: "",
            html: "",
            css: "",
            code: fallbackCode,
            suggestions: null,
            enrichedPrompt,
            fallback: true,
        });

    } catch (error: any) {
        console.error("Stitch generate error:", error);
        return NextResponse.json(
            { error: error.message || "Generation failed" },
            { status: 500 }
        );
    }
}

// ─── Fallback Generator ──────────────────────────────────────────
function generateFallbackComponent(prompt: string, device: string): string {
    const timestamp = new Date().toISOString();
    return `// 🔮 StarSeed Design Canvas — Generated Component
// Timestamp: ${timestamp}
// Device: ${device}
// ─────────────────────────────────────────────────

import React from "react";

/**
 * Auto-generated from prompt:
 * "${prompt}"
 *
 * Design tokens applied from StarSeed DESIGN.md:
 * - Background: #0F0F23 (deep space)
 * - Primary: #8B5CF6 (violet)
 * - Accent: #00D4FF (cyan)
 * - Glass: backdrop-blur-xl, border-white/10
 */

export function GeneratedComponent() {
  return (
    <div className="relative p-6 rounded-3xl overflow-hidden"
         style={{
           background: "rgba(15, 15, 35, 0.65)",
           backdropFilter: "blur(20px) saturate(180%)",
           border: "1px solid rgba(255, 255, 255, 0.08)",
           boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
         }}
    >
      {/* Glass noise overlay */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
           style={{ backgroundImage: "url('data:image/svg+xml,...')" }} />

      <h2 className="text-2xl font-light tracking-wide text-white/90"
          style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 300 }}>
        ${prompt.slice(0, 40)}
      </h2>

      <p className="mt-2 text-sm text-white/50"
         style={{ fontFamily: "'Inter', sans-serif" }}>
        Generated with StarSeed Design Canvas
      </p>

      {/* Primary action */}
      <button className="mt-4 px-6 py-2.5 rounded-full text-sm font-medium text-white
                         bg-gradient-to-r from-purple-500/80 to-cyan-500/80
                         hover:from-purple-500 hover:to-cyan-500
                         shadow-lg shadow-purple-500/20 transition-all duration-300">
        Interactuar
      </button>
    </div>
  );
}
`;
}
