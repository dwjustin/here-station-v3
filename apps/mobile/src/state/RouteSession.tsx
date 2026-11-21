import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';

import type { RouteResponse } from '../api/routes';

type RouteSession = {
  route: RouteResponse | null;
  setRoute: Dispatch<SetStateAction<RouteResponse | null>>;
};

const RouteSessionContext = createContext<RouteSession | null>(null);

export function RouteSessionProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<RouteResponse | null>(null);
  return (
    <RouteSessionContext.Provider value={{ route, setRoute }}>
      {children}
    </RouteSessionContext.Provider>
  );
}

export function useRouteSession() {
  const session = useContext(RouteSessionContext);
  if (!session) throw new Error('RouteSessionProvider 안에서 사용해야 합니다.');
  return session;
}
