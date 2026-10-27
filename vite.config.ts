import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { MYTHS } from "./src/game/myths";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "read-only-local-catalogue",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const path = request.url?.split("?")[0];
          if (path !== "/api/myths" && path !== "/api/session") return next();
          response.setHeader("Content-Type", "application/json");
          response.setHeader("Cache-Control", "no-store");
          if (request.method !== "GET") {
            response.statusCode = 401;
            response.end(JSON.stringify({ error: "Local Vite development is read-only. Use the Static Web Apps emulator to test authenticated editing." }));
            return;
          }
          response.end(JSON.stringify(path === "/api/session"
            ? { authenticated: false }
            : { myths: MYTHS, version: "seed" }));
        });
      },
    },
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
