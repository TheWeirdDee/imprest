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
module.exports = config;
