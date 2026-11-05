// Règles recommandées, avec l'environnement de chaque partie du projet.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'site/', 'node_modules/', 'server/node_modules/', 'server/.wrangler/', 'assets/', 'server/hints/', 'Notes/'] },
  js.configs.recommended,
  {
    // Scripts de la page : chargés par boot.js, ils partagent window.
    files: ['src/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser, module: 'readonly' },
    },
  },
  {
    // Appli de bureau, tests du jeu et outils en CommonJS.
    files: ['*.js', 'test/**/*.js', 'tools/**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    // Service worker, modèle complété par build-site.mjs.
    files: ['tools/sw.template.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.serviceworker, __FILES__: 'readonly' },
    },
  },
  {
    files: ['tools/**/*.mjs', 'eslint.config.mjs', 'server/test/**/*.js'],
    languageOptions: { sourceType: 'module', globals: globals.node },
  },
  {
    // Worker Cloudflare.
    files: ['server/src/**/*.js'],
    languageOptions: { sourceType: 'module', globals: globals.serviceworker },
  },
];
