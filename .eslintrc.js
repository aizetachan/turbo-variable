/* eslint-env node */
module.exports = {
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:@figma/figma-plugins/recommended',
        'prettier',
    ],
    plugins: ['prettier'],
    rules: {
        'prettier/prettier': 'error',
    },
    parser: '@typescript-eslint/parser',
    parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
    },
    root: true,
    ignorePatterns: ['.eslintrc.js', 'node_modules/'],
}