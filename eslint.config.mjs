import prettier from 'eslint-config-prettier';

import apify from '@apify/eslint-config/js.js';

const config = [{ ignores: ['**/dist'] }, ...apify, prettier];

// eslint config files require default export
// eslint-disable-next-line import-x/no-default-export
export default config;
