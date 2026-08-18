const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

// Expo configures Metro for monorepos itself since SDK 52. Setting watch folders or
// node_modules paths by hand here now only breaks nested dependency resolution.
const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });
