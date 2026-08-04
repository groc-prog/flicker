/**
 * @see https://prettier.io/docs/configuration
 * @type {import("prettier").Config}
 */
const config = {
  singleQuote: true,
  trailingComma: 'all',
  singleAttributePerLine: true,
  printWidth: 120,
  importOrder: ['^@flicker(/.*)$', '', '<BUILTIN_MODULES>', '', '<THIRD_PARTY_MODULES>', '', '^[.]'],
  plugins: ['@ianvs/prettier-plugin-sort-imports'],
};

export default config;
