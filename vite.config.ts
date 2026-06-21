import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { cloudflare } from "@cloudflare/vite-plugin";
import { execSync } from "child_process";

const gitSha = (() => {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
})();

const buildTime = new Date().toISOString();

const requiredEnvPlugin = {
  name: "require-env",
  configResolved(config: { env: Record<string, string> }) {
    const missing = [
      "VITE_API_URL",
      "VITE_COGNITO_DOMAIN",
      "VITE_COGNITO_CLIENT_ID",
      "VITE_VAPID_PUBLIC_KEY",
    ].filter((k) => config.env[k] === undefined);
    if (missing.length) {
      throw new Error(`Missing required env vars: ${missing.join(", ")}`);
    }
  },
};

export default defineConfig({
  define: {
    __APP_SHA__: JSON.stringify(gitSha),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  plugins: [
    requiredEnvPlugin,
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      manifest: {
        name: "Counter Weight",
        short_name: "CounterWeight",
        description: "Local-first countdown timer",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
      },
    }),
    cloudflare(),
  ],
  server: {
    host: true,
    https: {
      key: "./localhost+2-key.pem",
      cert: "./localhost+2.pem",
    },
    proxy: {
      "/auth": {
        target: "https://i55bwod2e0.execute-api.ap-southeast-2.amazonaws.com",
        changeOrigin: true,
        bypass(req) {
          // Cognito redirects the browser here with GET — let Vite serve index.html
          // so React can pick up the ?code param and POST it to the lambda
          if (req.method === "GET" && req.url?.startsWith("/auth/callback")) {
            return "/index.html";
          }
        },
      },
      "/trpc": {
        target: process.env.API_TARGET ?? "https://i55bwod2e0.execute-api.ap-southeast-2.amazonaws.com",
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
    https: {
      key: "./localhost+2-key.pem",
      cert: "./localhost+2.pem",
    },
  },
});
