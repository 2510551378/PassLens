interface TracePanelState<T> {
  sessions: WeakMap<object, T>;
  activePanel: object | undefined;
}

interface TracePanelSessionManager<T> {
  register(panel: object, session: T): void;
  unregister(panel: object): void;
  setActivePanel(panel: object): void;
  getActiveSession(): T | undefined;
  getSession(panel: object): T | undefined;
}

export function createTracePanelSessionManager<T>(): TracePanelSessionManager<T> {
  const state: TracePanelState<T> = {
    sessions: new WeakMap<object, T>(),
    activePanel: undefined
  };

  return {
    register(panel: object, session: T): void {
      state.sessions.set(panel, session);
      state.activePanel = panel;
    },

    unregister(panel: object): void {
      if (state.activePanel === panel) {
        state.activePanel = undefined;
      }
      state.sessions.delete(panel);
    },

    setActivePanel(panel: object): void {
      if (state.sessions.has(panel)) {
        state.activePanel = panel;
      }
    },

    getActiveSession(): T | undefined {
      return state.activePanel ? state.sessions.get(state.activePanel) : undefined;
    },

    getSession(panel: object): T | undefined {
      return state.sessions.get(panel);
    }
  };
}
