import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import Icons from "unplugin-icons/vite";

export default defineConfig({
  plugins: [
    sveltekit(),
    Icons({
      compiler: "svelte",
      autoInstall: false
    })
  ],

  // Tauri expects a fixed port
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },

  clearScreen: false,

  // Env prefix for Tauri
  envPrefix: ['VITE_', 'TAURI_']
});
