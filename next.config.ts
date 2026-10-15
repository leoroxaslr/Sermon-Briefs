import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle (.next/standalone), used by the desktop app.
  output: "standalone",
  cacheComponents: true,
  // Never ship local data (briefs, settings, API keys) inside the bundle.
  outputFileTracingExcludes: {
    "/**": ["./data/**/*", "./.env*"],
  },
  // tesseract.js loads its worker and WebAssembly core dynamically, so tracing misses them.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/tesseract.js/src/**/*",
      // The worker thread's own dependency tree (see tesseract.js/package.json).
      ...["tesseract.js-core", "bmp-js", "idb-keyval", "is-url", "node-fetch", "whatwg-url", "tr46"]
        .concat(["webidl-conversions", "regenerator-runtime", "wasm-feature-detect", "zlibjs"])
        .map((pkg) => `./node_modules/${pkg}/**/*`),
    ],
  },
  // Native/worker-based packages must load from node_modules, not the server bundle.
  serverExternalPackages: ["tesseract.js", "unpdf", "mammoth", "jszip", "@napi-rs/canvas"],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
