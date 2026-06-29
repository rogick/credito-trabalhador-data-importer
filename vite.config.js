import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const SERPRO_HOST =
  'https://producaorestrita-esocialconsignado.df-1.estaleiro.serpro.gov.br';

// Vite serve como ferramenta de build/dev. A lógica do app está em
// src/EsocialConsignadoApp.jsx.
//
// Proxy de dev: a API do SERPRO não envia cabeçalhos CORS, então chamadas
// diretas do navegador são bloqueadas. Em desenvolvimento, aponte o campo
// "URL base da API" do app para:
//
//     /esocial-api/recepcaolote/api/ContratoEmprestimoConsignado
//
// As requisições saem same-origin para o Vite, que as encaminha ao SERPRO
// do lado do servidor (sem CORS).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/esocial-api': {
        target: SERPRO_HOST,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/esocial-api/, ''),
      },
    },
  },
});
