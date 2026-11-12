import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  outDir: ".output/v0.1.3",
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: "SAGE — Your Private AI Research Companion",
    description:
      "Local-first page intelligence, inspectable sources, and private research.",
    permissions: [
      "activeTab",
      "scripting",
      "storage",
      "contextMenus",
      "sidePanel",
    ],
    optional_permissions: ["tabs"],
    optional_host_permissions: [
      "http://localhost/*",
      "http://127.0.0.1/*",
      "http://*/*",
      "https://*/*",
    ],
    incognito: "not_allowed",
    options_ui: { page: "options.html", open_in_tab: true },
    icons: {
      16: "icons/16.png",
      32: "icons/32.png",
      48: "icons/48.png",
      128: "icons/128.png",
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'; base-uri 'none'",
    },
  },
  hooks: {
    "build:manifestGenerated": (_wxt, manifest) => {
      // Keep "tabs" strictly optional for privacy; remove any dev-injected duplicate from permissions
      if (
        manifest.permissions?.includes("tabs") &&
        manifest.optional_permissions?.includes("tabs")
      ) {
        manifest.permissions = manifest.permissions.filter((p) => p !== "tabs");
      }
    },
  },
});
