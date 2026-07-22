import React from 'react';
import ReactDOM from 'react-dom/client';
// Importa os estilos globais, incluindo Tailwind
import './index.css';
// Importa o componente principal da aplicação (deve exportar AppContainer por padrão)
import AppContainer from './App'; // Renomeado para AppContainer se App.js exporta AppContainer
import reportWebVitals from './reportWebVitals';

// Guard global: impede que a rodinha do mouse altere o valor de inputs
// numéricos focados. Ao invés de bloquear o scroll (o que travaria a rolagem
// da página), apenas tiramos o foco do campo — assim o scroll segue normal e o
// valor não muda. Complementa o CSS que esconde as setinhas (index.css).
document.addEventListener('wheel', (event) => {
  const el = document.activeElement;
  if (el && el.type === 'number' && el === event.target) {
    el.blur();
  }
}, { passive: true });

// Encontra o elemento root no HTML
const rootElement = document.getElementById('root');

if (rootElement) {
  // Cria a raiz do React
  const root = ReactDOM.createRoot(rootElement);
  // Renderiza a aplicação
  root.render(
    <React.StrictMode>
      {/* Renderiza o componente principal */}
      <AppContainer />
    </React.StrictMode>
  );
} else {
  console.error("Failed to find the root element. Ensure there is an element with id='root' in your index.html.");
}


// Função opcional para medir performance
// Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
