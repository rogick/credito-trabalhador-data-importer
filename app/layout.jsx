import './globals.css';

export const metadata = {
  title: 'eSocial Consignado — Recepção de Lote',
  description:
    'Consumer da API eSocial Consignado (SERPRO) — Crédito do Trabalhador.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body className="bg-gray-100">{children}</body>
    </html>
  );
}
