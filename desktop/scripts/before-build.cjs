// The Electron shell (desktop/app) has no dependencies; the web app ships as
// extraResources with its own node_modules. Returning false tells electron-builder
// not to collect node_modules into app.asar (it would otherwise pick up the whole
// project's dependency tree).
exports.default = async () => false;
