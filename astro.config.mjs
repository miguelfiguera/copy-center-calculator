// @ts-check
import { defineConfig, envField } from 'astro/config';
import netlify from '@astrojs/netlify';

export default defineConfig({
  output: 'server',
  adapter: netlify(),
  env: {
    schema: {
      AUTH_USER: envField.string({ context: 'server', access: 'secret' }),
      AUTH_PASSWORD: envField.string({ context: 'server', access: 'secret' }),
      AUTH_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
});
