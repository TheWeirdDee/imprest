// Resolves @imprest/core (and config/networks.json) from the monorepo, so the mobile
// client shares business logic with the web app instead of copying it.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");
const config = getDefaultConfig(projectRoot);
config.watchFolders = [path.join(repoRoot, "packages/core"), path.join(repoRoot, "config")];
config.resolver.nodeModulesPaths = [path.join(projectRoot, "node_modules")];
config.resolver.extraNodeModules = { "@imprest/core": path.join(repoRoot, "packages/core/src") };
config.resolver.unstable_enablePackageExports = true;
// @noble/hashes 1.x imports "@noble/hashes/crypto", a subpath its own "exports" map does not
// list. Metro warned and then fell back to the file, which works. Resolve that one import
// file-based directly so the warning noise is gone; everything else keeps package exports.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (/^@noble\/hashes\/crypto(\.js)?$/.test(moduleName)) {
    return context.resolveRequest({ ...context, unstable_enablePackageExports: false }, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
