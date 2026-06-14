import { create } from 'zustand'

interface ViewState {
  selectedGroupId: number | null
  setSelectedGroup: (id: number) => void
  clearSelectedGroup: () => void
}

export const useViewStore = create<ViewState>((set) => ({
  selectedGroupId: null,
  setSelectedGroup: (id) => set({ selectedGroupId: id }),
  clearSelectedGroup: () => set({ selectedGroupId: null }),
}))
