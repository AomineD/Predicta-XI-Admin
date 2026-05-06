'use client';

import type { ConsumoRow } from './types';

export function InfoModal({ row, onClose }: { row: ConsumoRow; onClose: () => void }) {
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="rounded-2xl p-6 w-full max-w-3xl max-h-[85vh] flex flex-col"
        style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.12)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary font-sans">
            LLM Call #{row.id} — {row.model}
          </h3>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-sans font-medium bg-surface-3 text-text-secondary hover:text-text-primary transition-colors"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-auto space-y-4">
          {row.llmInput && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">System Prompt</span>
                  <button
                    onClick={() => handleCopy(row.llmInput!.systemPrompt)}
                    className="text-xs text-text-muted hover:text-text-primary transition-colors"
                  >
                    Copy
                  </button>
                </div>
                <pre className="text-xs text-text-muted font-mono whitespace-pre-wrap p-3 rounded-xl bg-surface-3 max-h-48 overflow-auto">
                  {row.llmInput.systemPrompt}
                </pre>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">User Prompt</span>
                  <button
                    onClick={() => handleCopy(row.llmInput!.userPrompt)}
                    className="text-xs text-text-muted hover:text-text-primary transition-colors"
                  >
                    Copy
                  </button>
                </div>
                <pre className="text-xs text-text-muted font-mono whitespace-pre-wrap p-3 rounded-xl bg-surface-3 max-h-48 overflow-auto">
                  {row.llmInput.userPrompt}
                </pre>
              </div>
            </>
          )}
          {!row.llmInput && (
            <p className="text-xs text-text-muted italic">No input data available (call may have failed before LLM request)</p>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">LLM Output</span>
              {row.llmOutput && (
                <button
                  onClick={() => handleCopy(row.llmOutput!)}
                  className="text-xs text-text-muted hover:text-text-primary transition-colors"
                >
                  Copy
                </button>
              )}
            </div>
            <pre className="text-xs text-text-muted font-mono whitespace-pre-wrap p-3 rounded-xl bg-surface-3 max-h-48 overflow-auto">
              {row.llmOutput ?? '— No output —'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
