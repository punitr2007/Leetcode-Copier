module.exports = {
  // Source directory for the extension
  sourceDir: '.',
  // Build output directory
  artifactsDir: 'web-ext-artifacts',
  // Files to ignore when packaging the extension
  build: {
    overwriteDest: true,
  },
  ignoreFiles: [
    '.git/**',
    '.github/**',
    'node_modules/**',
    'package.json',
    'package-lock.json',
    'web-ext-artifacts/**',
    'scripts/**',
    '*.md',
    '*.log',
    '*.json.log',
    'amo-lint-report.json',
    'amo-sign-output.log',
    'amo-sign-error.log',
    'web-ext.config.cjs',
    'LICENSE'
  ],
};
