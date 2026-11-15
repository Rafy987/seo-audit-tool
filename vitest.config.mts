import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Lets tests import files with the same "@/..." paths the app uses (see tsconfig.json).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
});
