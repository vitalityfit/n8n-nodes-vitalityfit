import { createRequire } from 'node:module';
import { defineConfig } from 'vitest/config';

const require = createRequire(import.meta.url);

export default defineConfig({
	test: {
		include: ['test/**/*.test.ts'],
		// Load the CommonJS build of n8n-workflow, as n8n does when it runs the compiled node.
		alias: { 'n8n-workflow': require.resolve('n8n-workflow') },
		server: { deps: { external: [/n8n-workflow/] } },
	},
});
