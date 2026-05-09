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
