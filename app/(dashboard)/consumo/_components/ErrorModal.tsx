'use client';

export function ErrorModal({ error, onClose }: { error: string; onClose: () => void }) {
  const handleCopy = () => {
    navigator.clipboard.writeText(error);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col"
        style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.12)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-danger font-sans">Error Log</h3>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg text-xs font-sans font-medium bg-surface-3 text-text-secondary hover:text-text-primary transition-colors"
            >
              Copy
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-sans font-medium bg-surface-3 text-text-secondary hover:text-text-primary transition-colors"
            >
              Close
            </button>
          </div>
        </div>
        <pre className="flex-1 overflow-auto text-xs text-text-muted font-mono whitespace-pre-wrap p-4 rounded-xl bg-surface-3">
          {error}
        </pre>
      </div>
    </div>
  );
}
