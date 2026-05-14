import { create } from 'zustand'

export interface Toast {
  id: string
  message: string
  variant: 'default' | 'success' | 'error'
  ttl: number
  position: 'top' | 'bottom'
}

type ShowInput = { message: string } & Partial<Omit<Toast, 'id'>>

const DEFAULTS: Omit<Toast, 'id' | 'message'> = {
  variant: 'default',
  ttl: 4000,
  position: 'bottom',
}

interface ToastState {
  toasts: Toast[]
  show: (input: ShowInput) => string
  dismiss: (id: string) => void
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show(input) {
    const id = crypto.randomUUID()
    const toast: Toast = { ...DEFAULTS, ...input, id }
    set({ toasts: [...get().toasts, toast] })
    if (toast.ttl > 0) {
      setTimeout(() => get().dismiss(id), toast.ttl)
    }
    return id
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter(t => t.id !== id) })
  },
}))

export function useToast() {
  const show = useToastStore(s => s.show)
  const dismiss = useToastStore(s => s.dismiss)
  return { show, dismiss }
}
