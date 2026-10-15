// Assembles desktop/vendor/bundle/ for electron-builder, after `next build`:
//   server/    the standalone Next.js server, checked to be complete and free of local data
//   node/      this machine's Node.js binary (so build on the target OS, e.g. Windows in CI)
//   tessdata/  the English OCR model, verified by checksum
// and syncs the app version into desktop/app/package.json.
//
// Everything sits one level down because electron-builder always drops a top-level
// node_modules folder from extraResources, but keeps nested ones.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

const root = path.resolve(import.meta.dirname, "..", "..");
const standalone = path.join(root, ".next", "standalone");
const vendor = path.join(root, "desktop", "vendor");
const bundle = path.join(vendor, "bundle");
const serverDir = path.join(bundle, "server");

const MIN_NODE_MAJOR = 24;
const OCR_MODEL_URL = "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz";
const OCR_MODEL_SHA256 = "5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747";

const fail = (message) => {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
};
const step = (message) => console.log(`• ${message}`);

// 1. The standalone bundle -----------------------------------------------------
if (!fs.existsSync(path.join(standalone, "server.js"))) fail("No .next/standalone/server.js. Run `next build` first.");
fs.rmSync(bundle, { recursive: true, force: true });
fs.cpSync(standalone, serverDir, { recursive: true, verbatimSymlinks: true });

// Turbopack links external packages from .next/node_modules/<name>-<hash>. Links (and
// Windows junctions, which can hold absolute build-machine paths) don't survive
// packaging reliably, so replace each one with a real copy of its target.
const replaceLinks = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      const target = fs.realpathSync(full);
      fs.rmSync(full, { recursive: true, force: true });
      fs.cpSync(target, full, { recursive: true, dereference: true });
      step(`inlined link ${path.relative(serverDir, full)}`);
    } else if (entry.isDirectory()) {
      replaceLinks(full);
    }
  }
};
replaceLinks(serverDir);

const forbidden = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(serverDir, full);
    if (entry.isSymbolicLink()) forbidden.push(`${rel} (symlink: would point at the build machine)`);
    else if (entry.isDirectory()) {
      if (rel === "data") forbidden.push(`${rel}/ (local briefs and settings)`);
      else walk(full);
    } else if (/^\.env/.test(entry.name) || /\.db(-wal|-shm)?$/.test(entry.name) || entry.name === "settings.json") {
      forbidden.push(rel);
    }
  }
};
walk(serverDir);
if (forbidden.length) fail(`The server bundle contains files that must not ship:\n  ${forbidden.join("\n  ")}`);

for (const required of ["tesseract.js-core", "@napi-rs/canvas", "unpdf", "bmp-js"]) {
  if (!fs.existsSync(path.join(serverDir, "node_modules", required))) fail(`The server bundle is missing ${required}.`);
}
step("server bundle checked: complete, no local data");

// 2. Static assets (standalone doesn't copy them) ------------------------------
fs.cpSync(path.join(root, ".next", "static"), path.join(serverDir, ".next", "static"), { recursive: true });
if (fs.existsSync(path.join(root, "public"))) {
  fs.cpSync(path.join(root, "public"), path.join(serverDir, "public"), { recursive: true });
}
fs.copyFileSync(path.join(root, "desktop", "server-launcher.cjs"), path.join(serverDir, "launcher.cjs"));
step("static assets and launcher copied");

// 3. Node.js runtime -----------------------------------------------------------
const major = Number(process.versions.node.split(".")[0]);
if (major < MIN_NODE_MAJOR) fail(`Node ${MIN_NODE_MAJOR}+ is required (this is ${process.version}).`);
fs.mkdirSync(path.join(bundle, "node"), { recursive: true });
const nodeName = process.platform === "win32" ? "node.exe" : "node";
fs.copyFileSync(process.execPath, path.join(bundle, "node", nodeName));
step(`bundled Node.js ${process.version} for ${process.platform}-${process.arch}`);

// 4. OCR model -----------------------------------------------------------------
// Cached outside the bundle so rebuilds don't download it again.
const modelPath = path.join(vendor, "tessdata-cache", "eng.traineddata");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
if (!fs.existsSync(modelPath) || sha256(fs.readFileSync(modelPath)) !== OCR_MODEL_SHA256) {
  const res = await fetch(OCR_MODEL_URL);
  if (!res.ok) fail(`Couldn't download the OCR model (HTTP ${res.status}).`);
  const model = gunzipSync(Buffer.from(await res.arrayBuffer()));
  if (sha256(model) !== OCR_MODEL_SHA256) fail("The downloaded OCR model failed its checksum.");
  fs.mkdirSync(path.dirname(modelPath), { recursive: true });
  fs.writeFileSync(modelPath, model);
}
fs.mkdirSync(path.join(bundle, "tessdata"), { recursive: true });
fs.copyFileSync(modelPath, path.join(bundle, "tessdata", "eng.traineddata"));
step("bundled OCR model (checksum verified)");

// 5. Version ---------------------------------------------------------------------
const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const appPkgPath = path.join(root, "desktop", "app", "package.json");
const appPkg = JSON.parse(fs.readFileSync(appPkgPath, "utf8"));
if (appPkg.version !== version) {
  appPkg.version = version;
  fs.writeFileSync(appPkgPath, `${JSON.stringify(appPkg, null, 2)}\n`);
}
step(`version ${version}`);
console.log("\n✓ Ready for electron-builder\n");
