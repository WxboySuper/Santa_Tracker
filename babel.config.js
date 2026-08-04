module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
    '@babel/preset-typescript',
  ],
  plugins: [
    // react-router v8 is ESM-only and uses `import.meta` (e.g. `import.meta.hot`
    // in its dev/HMR path). Babel leaves `import.meta` untouched when compiling
    // to CommonJS, which breaks the jest CJS runtime. This config is only used
    // by jest (Vite builds with esbuild), so shimming it here is safe.
    function importMetaShim() {
      return {
        visitor: {
          MetaProperty(path) {
            if (
              path.node.meta.name === 'import' &&
              path.node.property.name === 'meta'
            ) {
              path.replaceWithSourceString('({ hot: void 0, url: void 0 })');
            }
          },
        },
      };
    },
  ],
};
