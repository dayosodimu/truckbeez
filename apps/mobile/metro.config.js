// Metro config for the npm-workspaces monorepo (ADR-0003). Expo detects the workspace root
// and watches packages/shared. @truckbeez/shared's TypeScript source uses Node-style
// `./route.js` specifiers (NodeNext); Metro is told to try the `.ts` file when a relative
// `.js` import doesn't exist.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const upstream = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstream ?? context.resolveRequest;
  try {
    return resolve(context, moduleName, platform);
  } catch (error) {
    if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
      return resolve(context, moduleName.slice(0, -3), platform);
    }
    throw error;
  }
};

module.exports = config;
