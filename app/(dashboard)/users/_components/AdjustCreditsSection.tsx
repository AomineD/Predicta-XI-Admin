'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { InfoPopover } from '@/components/ui/InfoPopover';
import { useToast } from '@/components/ui/ToastProvider';

// Mismos topes que valida el backend (`credit-adjustment.validation.ts`). Aquí
// solo sirven para no dejar enviar algo que el servidor va a rechazar.
const MAX_ADJUSTMENT = 1000;
const MAX_NOTE_LENGTH = 500;

const inputClass =
  'h-9 w-full px-3 rounded-xl text-sm text-text-primary outline-none bg-surface-2 border border-border';

interface AdjustResponse {
  userId: string;
  amount: number;
  balance: number;
}

/**
 * Abona o descuenta créditos a mano. Pensado para compensaciones y correcciones
 * de soporte: cada ajuste queda en el historial del usuario como
 * `admin_adjustment`, con el correo del admin y la nota.
 */
export function AdjustCreditsSection({
  userId,
  currentCredits,
  deleted,
}: {
  userId: string;
  currentCredits: number;
  deleted: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const amount = Number(amountText);
  const trimmedNote = note.trim();
  const amountValid =
    amountText.trim() !== '' && Number.isInteger(amount) && amount !== 0 && Math.abs(amount) <= MAX_ADJUSTMENT;
  const leavesNegative = amountValid && currentCredits + amount < 0;
  const noteValid = trimmedNote.length > 0 && trimmedNote.length <= MAX_NOTE_LENGTH;
  const canSubmit = !deleted && amountValid && !leavesNegative && noteValid;

  const adjust = useMutation({
    mutationFn: () =>
      api.post<AdjustResponse>(`/admin/users/${userId}/credits/adjust`, { amount, note: trimmedNote }),
    onSuccess: (res) => {
      toast.success(`Saldo actualizado: ${res.balance} créditos`);
      setAmountText('');
      setNote('');
      setConfirmOpen(false);
      void qc.invalidateQueries({ queryKey: ['user-detail', userId] });
      void qc.invalidateQueries({ queryKey: ['user-insights', userId] });
      void qc.invalidateQueries({ queryKey: ['users-list'] });
    },
    onError: (e: Error) => {
      setConfirmOpen(false);
      toast.error(e.message);
    },
  });

  const verb = amount > 0 ? 'Abonar' : 'Descontar';

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Ajustar créditos</h3>
        <InfoPopover label="Qué hace Ajustar créditos">
          <p className="mb-2">
            Positivo abona y negativo descuenta, hasta {MAX_ADJUSTMENT} créditos por ajuste. El saldo nunca puede
            quedar negativo.
          </p>
          <p className="mb-2">
            Queda en el historial del usuario como <code>admin_adjustment</code>, con tu correo y la nota. La nota
            es obligatoria: es la única explicación que queda del movimiento.
          </p>
          <p>No pasa por la tienda ni envía notificación. Las cuentas borradas no se pueden ajustar.</p>
        </InfoPopover>
      </div>

      {deleted ? (
        <p className="text-sm text-text-muted">Cuenta borrada: no se puede ajustar.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <label htmlFor={`adjust-amount-${userId}`} className="text-xs text-text-muted mb-1 block">
                Créditos
              </label>
              <input
                id={`adjust-amount-${userId}`}
                type="number"
                inputMode="numeric"
                step={1}
                min={-MAX_ADJUSTMENT}
                max={MAX_ADJUSTMENT}
                placeholder="+10 / -10"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="col-span-2">
              <label htmlFor={`adjust-note-${userId}`} className="text-xs text-text-muted mb-1 block">
                Nota
              </label>
              <input
                id={`adjust-note-${userId}`}
                type="text"
                maxLength={MAX_NOTE_LENGTH}
                placeholder="Motivo del ajuste"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {amountText.trim() !== '' && !amountValid && (
            <p className="text-xs text-danger mb-2">
              Un entero distinto de 0, entre -{MAX_ADJUSTMENT} y {MAX_ADJUSTMENT}.
            </p>
          )}
          {leavesNegative && (
            <p className="text-xs text-danger mb-2">
              El saldo quedaría en {currentCredits + amount}. Máximo a descontar: {currentCredits}.
            </p>
          )}

          <Button
            variant="primary"
            size="sm"
            disabled={!canSubmit || adjust.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            {amountValid ? `${verb} ${Math.abs(amount)}` : 'Ajustar'}
          </Button>
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={`${verb} ${Math.abs(amount)} créditos`}
        message={
          <>
            Saldo actual {currentCredits} → {currentCredits + (amountValid ? amount : 0)}.
            <br />
            Nota: {trimmedNote}
          </>
        }
        confirmLabel={verb}
        cancelLabel="Cancelar"
        variant={amount < 0 ? 'danger' : 'default'}
        loading={adjust.isPending}
        onConfirm={() => adjust.mutate()}
        onClose={() => {
          if (!adjust.isPending) setConfirmOpen(false);
        }}
      />
    </div>
  );
}
