// vite.config.ts — 仅用于 shadcn CLI 识别，不影响 electron-vite 构建
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src/renderer/src"),
    },
  },
})