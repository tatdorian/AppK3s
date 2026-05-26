import { create } from 'zustand';

interface ProjectState {
  /** null = "Tous les projets" (admin only) */
  currentProjectId: string | null;
  setCurrentProject: (id: string | null) => void;
}

const STORAGE_KEY = 'appk3s_project';

export const useProjectStore = create<ProjectState>((set) => ({
  currentProjectId: localStorage.getItem(STORAGE_KEY) ?? null,

  setCurrentProject: (id) => {
    if (id === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, id);
    }
    set({ currentProjectId: id });
  },
}));
