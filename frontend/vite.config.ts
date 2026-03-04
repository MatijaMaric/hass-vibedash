import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

/**
 * Vite plugin that inlines CSS into the JS bundle as a variable.
 * Needed because the Web Component uses Shadow DOM, so styles must
 * be injected inside the shadow root rather than document.head.
 */
function shadowCSSPlugin(): Plugin {
  return {
    name: "shadow-css-inline",
    enforce: "post",
    generateBundle(_, bundle) {
      const cssKeys: string[] = [];
      let cssContent = "";

      for (const [key, chunk] of Object.entries(bundle)) {
        if (key.endsWith(".css") && chunk.type === "asset") {
          cssContent += chunk.source;
          cssKeys.push(key);
        }
      }

      if (cssContent) {
        for (const key of cssKeys) {
          delete bundle[key];
        }
        for (const chunk of Object.values(bundle)) {
          if (chunk.type === "chunk" && chunk.isEntry) {
            chunk.code =
              `var __VIBEDASH_CSS__ = ${JSON.stringify(cssContent)};\n` +
              chunk.code;
          }
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), shadowCSSPlugin()],
  build: {
    lib: {
      entry: resolve(__dirname, "src/main.tsx"),
      formats: ["iife"],
      name: "VibeDashPanel",
      fileName: () => "vibedash-panel.js",
    },
    outDir: resolve(__dirname, "../custom_components/vibedash/frontend"),
    emptyOutDir: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    cssCodeSplit: false,
    minify: "esbuild",
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});
