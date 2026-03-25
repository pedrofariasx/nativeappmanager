/*
 * File: vite.config.ts
 * Project: native-app-manager
 * Author: Pedro Farias
 * Created: 2026-03-22
 * 
 * Last Modified: Mon Mar 23 2026
 * Modified By: Pedro Farias
 * 
 */



import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
