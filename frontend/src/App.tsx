import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

import { I18nProvider } from "./i18n/I18nContext";
import { AppRouter } from "./router/AppRouter";
import { AppStateProvider } from "./state/AppStateContext";
import "./styles/app.css";

function buildQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        refetchOnWindowFocus: false,
      },
    },
  });
}

function App() {
  const [queryClient] = useState<QueryClient>(() => buildQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <AppStateProvider>
          <BrowserRouter>
            <AppRouter />
          </BrowserRouter>
        </AppStateProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

export default App;
