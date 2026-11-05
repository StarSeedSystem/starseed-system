import { biblioteca } from "./biblioteca";

const RAIZ_REGEX = /^\s*root\s*=/;
const COMPONENTE_REGEX = /=\s*[A-Z][a-zA-Z0-9]*\s*\(/;

export function pareceOpenUI(texto: string): boolean {
  if (!texto || typeof texto !== "string") return false;
  const trimmed = texto.trim();
  if (!trimmed) return false;
  const rootName = biblioteca.root;
  if (!rootName) return false;
  const hasRootAssignment = RAIZ_REGEX.test(trimmed);
  if (!hasRootAssignment) return false;
  const componentNames = Object.keys(biblioteca.components);
  for (const nombre of componentNames) {
    const escaped = nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`=\\s*${escaped}\\s*\\(`);
    if (pattern.test(trimmed)) return true;
  }
  return COMPONENTE_REGEX.test(trimmed);
}

export function contieneComponenteOpenUI(texto: string): boolean {
  if (!texto || typeof texto !== "string") return false;
  const trimmed = texto.trim();
  if (!trimmed) return false;
  const componentNames = Object.keys(biblioteca.components);
  for (const nombre of componentNames) {
    const escaped = nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escaped}\\s*\\(`);
    if (pattern.test(trimmed)) return true;
  }
  return false;
}