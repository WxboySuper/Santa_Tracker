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
    //
    // Scoped to node_modules so application code that legitimately uses
    // `import.meta` keeps its real semantics in tests.
    function importMetaShim() {
      const { types: t } = require('@babel/core');
      return {
        visitor: {
          MetaProperty(path, state) {
            const filename = state.file.opts.filename ?? '';
            if (!filename.includes('node_modules')) return;
            if (
              path.node.meta.name === 'import' &&
              path.node.property.name === 'meta'
            ) {
              path.replaceWith(
                t.objectExpression([
                  t.objectProperty(
                    t.identifier('hot'),
                    t.unaryExpression('void', t.numericLiteral(0)),
                  ),
                  t.objectProperty(
                    t.identifier('url'),
                    t.unaryExpression('void', t.numericLiteral(0)),
                  ),
                ]),
              );
            }
          },
        },
      };
    },
  ],
};
