/**
 * @see https://prettier.io/docs/configuration
 * @type {import("prettier").Config}
 */
const config = {
  singleQuote: true,
  trailingComma: 'all',
  singleAttributePerLine: true,
  printWidth: 120,
  importOrder: ['<BUILTIN_MODULES>', '', '<THIRD_PARTY_MODULES>', '', '^@flicker(/.*)$', '', '^[.]'],
  plugins: ['@ianvs/prettier-plugin-sort-imports'],
};

export default config;
