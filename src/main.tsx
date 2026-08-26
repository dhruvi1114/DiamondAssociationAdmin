import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import 'antd/dist/reset.css';
import '@/styles/index.css';
import App from '@/App';
import { persistor, store } from '@/store';
import { installThemeVariables } from '@/theme/cssVariables';

// Design tokens must exist before the first paint, otherwise every
// var(--…) resolves to nothing for one frame.
installThemeVariables();

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element #root is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <App />
      </PersistGate>
    </Provider>
  </StrictMode>,
);
