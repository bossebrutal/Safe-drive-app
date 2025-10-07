// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('@expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add ONNX files as assets
config.resolver.assetExts.push('onnx');

module.exports = config;
