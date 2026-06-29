import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite serve apenas como ferramenta de build/dev. A lógica do app está
// inteiramente em src/EsocialConsignadoApp.jsx.
export default defineConfig({
  plugins: [react()],
});
