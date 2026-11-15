import { defineConfig } from "vite";
import path from "node:path";
const raiz = path.resolve(import.meta.dirname, "../../..");
const stub = (n) => path.resolve(import.meta.dirname, "stubs", n);
export default defineConfig({
    root: import.meta.dirname, esbuild: { jsx: "automatic" }, server: { port: 9113, fs: { strict: false } },
    resolve: { alias: [
        { find: /^@\//, replacement: raiz + "/src/" },
        { find: "next/navigation", replacement: stub("navigation.ts") },
        { find: "next/link", replacement: stub("link.tsx") },
        { find: "next/image", replacement: stub("image.tsx") },
        { find: "next/dynamic", replacement: stub("dynamic.tsx") },
    ] },
    define: { "process.env": "({NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:1',NEXT_PUBLIC_SUPABASE_ANON_KEY:'x'})" },
    css: { postcss: raiz },
});
