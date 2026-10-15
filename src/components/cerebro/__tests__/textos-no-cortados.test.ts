import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Guardia: textos no cortados en botones", () => {
  const forbiddenPatterns = [
    "truncate",
    /line-clamp-\d+/,
    "whitespace-nowrap",
  ];

  const getFilesToCheck = (): string[] => {
    const cerebroDir = join(process.cwd(), "src", "components", "cerebro");
    const files = [
      join(process.cwd(), "src", "components", "aurora", "personalities-panel.tsx"),
    ];

    // Read all .tsx files in cerebro directory
    try {
      const entries = readFileSync(cerebroDir, { encoding: "utf8" })
        .split("\n")
        .filter(line => line.endsWith(".tsx"))
        .map(line => line.trim())
        .filter(line => line && !line.startsWith("."));
      
      for (const entry of entries) {
        files.join(join(cerebroDir, entry));
      }
    } catch (e) {
      // Fallback to glob-like approach
      const fs = require("node:fs");
      const path = require("node:path");
      const cerebroDir = join(process.cwd(), "src", "components", "cerebro");
      const entries = fs.readdirSync(cerebroDir);
      for (const entry of entries) {
        if (entry.endsWith(".tsx")) {
          files.push(join(cerebroDir, entry));
        }
      }
    }

    return files;
  };

  const checkFileForForbiddenClasses = (filePath: string): void => {
    const content = readFileSync(filePath, "utf8");
    const lines = content.split("\n");

    let inButtonTag = false;
    let buttonTagStartLine = 0;
    let buttonTagContent = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Look for opening of button or Button tag
      if (!inButtonTag && (line.includes("<button") || line.includes("<Button"))) {
        inButtonTag = true;
        buttonTagStartLine = lineNum;
        buttonTagContent = line;
      }

      if (inButtonTag) {
        buttonTagContent += " " + line.trim();

        // Check if we've reached the end of the opening tag
        if (line.includes(">") && !line.includes("/>")) {
          // Check for forbidden classes in className attribute
          const classNameMatch = buttonTagContent.match(/className\s*=\s*["'][^"']*["']|className\s*=\s*{([^}]*)}/);
          if (classNameMatch) {
            const classNameValue = classNameMatch[0];
            // Check each forbidden pattern
            for (const pattern of forbiddenPatterns) {
              if (typeof pattern === "string") {
                if (classNameValue.includes(pattern)) {
                  throw new Error(
                    `Forbidden class "${pattern}" found in button label at ${filePath}:${buttonTagStartLine}\n` +
                    `Tag content: ${buttonTagContent.trim()}`
                  );
                }
              } else if (pattern instanceof RegExp) {
                if (pattern.test(classNameValue)) {
                  throw new Error(
                    `Forbidden class matching "${pattern}" found in button label at ${filePath}:${buttonTagStartLine}\n` +
                    `Tag content: ${buttonTagContent.trim()}`
                  );
                }
              }
            }
          }

          // Reset for next tag
          inButtonTag = false;
          buttonTagContent = "";
        }
      }
    }
  };

  it("no button should have truncate, line-clamp, or whitespace-nowrap classes", () => {
    const files = getFilesToCheck();
    let errors: string[] = [];

    for (const file of files) {
      try {
        checkFileForForbiddenClasses(file);
      } catch (error) {
        errors.push((error as Error).message);
      }
    }

    if (errors.length > 0) {
      fail(errors.join("\n\n"));
    }
  });
});