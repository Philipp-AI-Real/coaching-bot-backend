import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: './src',
    // Import reflect-metadata before every test file so NestJS decorators work
    setupFiles: ['reflect-metadata'],
  },
  // SWC replaces esbuild so emitDecoratorMetadata works.
  // Without this, NestJS DI cannot read constructor parameter types at test time.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins: [swc.vite({
    jsc: {
      target: 'es2022',
      parser: { syntax: 'typescript', decorators: true },
      transform: { legacyDecorator: true, decoratorMetadata: true },
    },
  }) as any],
});
