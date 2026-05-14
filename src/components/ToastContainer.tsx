import { useToastStore } from '../hooks/useToast'
import type { Toast } from '../hooks/useToast'

function toastClasses(variant: Toast['variant']): string {
  if (variant === 'success') return 'bg-green-900 border-green-700'
  if (variant === 'error') return 'bg-red-900 border-red-700'
  return 'bg-slate-900 border-slate-600'
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div className={`${toastClasses(toast.variant)} border rounded-xl p-4 shadow-xl flex items-center gap-4`}>
      <p className="text-white text-sm flex-1 min-w-0">{toast.message}</p>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-slate-400 text-2xl min-w-[44px] min-h-[44px] flex items-center justify-center active:opacity-60 transition-opacity cursor-pointer"
      >
        ✕
      </button>
    </div>
  )
}

export function ToastContainer() {
  const toasts = useToastStore(s => s.toasts)
  const dismiss = useToastStore(s => s.dismiss)

  const top = toasts.filter(t => t.position === 'top')
  const bottom = toasts.filter(t => t.position === 'bottom')

  return (
    <>
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40 flex flex-col gap-2 w-full max-w-sm px-4">
        {top.map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
      <div
        className="fixed z-40 flex flex-col-reverse gap-2 w-full max-w-sm px-4 left-1/2 -translate-x-1/2"
        style={{ bottom: 'calc(var(--spacing-bottom-bar-inset) + 1rem)' }}
      >
        {bottom.map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </>
  )
}
