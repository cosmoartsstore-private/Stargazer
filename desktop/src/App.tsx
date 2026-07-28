// アプリケーション全体へ共有状態を提供し、主画面コンテナを構成する。

import { AppProvider } from '@/stores/AppContext';
import { AppContainer } from '@/layout/AppContainer';

function App() {
  return (
    <AppProvider>
      <AppContainer />
    </AppProvider>
  );
}

export default App;
