import Modal from './Modal'
import Button from './Button'

export default function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmText = 'Confirm', variant = 'primary' }) {
  return (
    <Modal open={open} onClose={onClose} title={title} width="w-[420px]">
      <div className="px-6 py-5">
        <p className="text-sm text-[var(--text-secondary)]">{message}</p>
      </div>
      <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--border)]">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant={variant} onClick={() => { onConfirm(); onClose() }}>{confirmText}</Button>
      </div>
    </Modal>
  )
}
