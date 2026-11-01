import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/native.ts', 'src/noop.ts', 'src/testing.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  target: 'es2022',
});
