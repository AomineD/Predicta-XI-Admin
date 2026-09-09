'use client';

import { useEffect, useState } from 'react';
import { useMounted } from '@/lib/use-mounted';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { SectionCard } from '@/components/ui/form-controls';
import { Input } from '@/components/ui/inputs';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import {
  createPasskey,
  describeWebAuthnError,
  hasPlatformAuthenticator,
  isWebAuthnAvailable,
} from '@/lib/webauthn';

interface Passkey {
  id: number;
  deviceName: string;
  createdAt: string | null;
  lastUsedAt: string | null;
  backedUp: boolean;
}

interface PasskeysResponse {
  /** `false` cuando al despliegue le falta ADMIN_PANEL_ORIGIN. */
  configured: boolean;
  passkeys: Passkey[];
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('es', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Nombre por defecto del dispositivo, para no obligar a inventarlo cada vez. */
function guessDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Passkey';
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Macintosh|Mac OS/i.test(ua)) return 'Mac';
  if (/iPhone|iPad/i.test(ua)) return 'iPhone / iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Passkey';
}

export function PasskeysCard() {
  const toast = useToast();
  const qc = useQueryClient();
  // `window` no existe en SSR, así que todo lo que dependa del navegador se
  // resuelve tras hidratar. `useMounted` lo hace sin setState en un effect.
  const mounted = useMounted();
  const supported = mounted && isWebAuthnAvailable();

  // `null` = "aún no lo has tocado": entonces manda el nombre adivinado.
  const [typedName, setTypedName] = useState<string | null>(null);
  const deviceName = typedName ?? (mounted ? guessDeviceName() : '');

  // Registrar exige la contraseña actual, no solo tener la sesión abierta: sin
  // ese paso, quien se apodere de la cookie un minuto deja una passkey suya y
  // cambiar la contraseña ya no lo echaría fuera.
  const [currentPassword, setCurrentPassword] = useState('');

  // Este sí necesita estado: la respuesta es asíncrona. El setState vive en el
  // callback de la promesa, no en el cuerpo del effect.
  const [platformAvailable, setPlatformAvailable] = useState(false);

  useEffect(() => {
    void hasPlatformAuthenticator().then(setPlatformAvailable);
  }, []);

  const { data, isLoading } = useQuery<PasskeysResponse>({
    queryKey: ['admin-passkeys'],
    queryFn: () => api.get('/admin/passkeys'),
  });

  const register = useMutation({
    mutationFn: async () => {
      const start = await api.post<{ challengeId: string; options: Record<string, unknown> }>(
        '/admin/passkeys/register/options',
        { currentPassword },
      );

      const credential = await createPasskey(start.options);
      // `null` es cancelación del diálogo del sistema, no un fallo.
      if (!credential) return null;

      return api.post<Passkey>('/admin/passkeys/register/verify', {
        challengeId: start.challengeId,
        deviceName: deviceName.trim() || guessDeviceName(),
        response: credential,
      });
    },
    onSuccess: (result) => {
      setCurrentPassword('');
      if (!result) return;
      void qc.invalidateQueries({ queryKey: ['admin-passkeys'] });
      toast.success(`Passkey "${result.deviceName}" registrada.`);
    },
    onError: (error: unknown) => {
      const message = describeWebAuthnError(error);
      if (message) toast.error(message);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/passkeys/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-passkeys'] });
      toast.success('Passkey eliminada.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const passkeys = data?.passkeys ?? [];

  return (
    <SectionCard
      title="Passkeys"
      subtitle="Entra con la huella o el PIN del dispositivo, sin escribir la contraseña"
      info={
        <>
          <p>
            Una passkey guarda una llave criptográfica en el dispositivo y firma el acceso con tu
            huella, tu cara o el PIN del equipo. La contraseña sigue funcionando: es el camino de
            recuperación si pierdes todos los dispositivos registrados.
          </p>
          <p className="mt-2">
            Registra una por equipo desde el propio equipo — la llave nunca sale de él, así que no
            puedes copiarla de un dispositivo a otro desde aquí.
          </p>
        </>
      }
    >
      {data && !data.configured && (
        <p className="text-warning text-xs font-sans mb-4">
          Las passkeys están apagadas en este despliegue: falta la variable{' '}
          <code className="text-text-primary">ADMIN_PANEL_ORIGIN</code> en el backend.
        </p>
      )}

      {!supported && (
        <p className="text-text-muted text-xs font-sans mb-4">
          Este navegador no admite passkeys. Puedes seguir entrando con tu contraseña.
        </p>
      )}

      {isLoading ? (
        <p className="text-text-muted text-xs font-sans">Cargando…</p>
      ) : passkeys.length === 0 ? (
        <p className="text-text-muted text-xs font-sans">
          Todavía no tienes ninguna passkey registrada.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {passkeys.map((passkey) => (
            <li key={passkey.id} className="flex items-center gap-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary font-sans truncate">{passkey.deviceName}</p>
                <p className="text-xs text-text-muted font-sans mt-0.5">
                  Registrada {formatDate(passkey.createdAt)} · Último uso {formatDate(passkey.lastUsedAt)}
                  {passkey.backedUp && ' · Sincronizada'}
                </p>
              </div>
              <Button
                variant="danger"
                disabled={remove.isPending}
                onClick={() => remove.mutate(passkey.id)}
              >
                Eliminar
              </Button>
            </li>
          ))}
        </ul>
      )}

      {supported && data?.configured !== false && (
        <div className="mt-5 pt-4 border-t border-border">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label htmlFor="passkey-name" className="block text-xs text-text-muted font-sans mb-1">
                Nombre del dispositivo
              </label>
              <Input
                id="passkey-name"
                className="w-56"
                value={deviceName}
                maxLength={60}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="PC de casa"
              />
            </div>

            <div>
              <label htmlFor="passkey-password" className="block text-xs text-text-muted font-sans mb-1">
                Contraseña actual
              </label>
              <Input
                id="passkey-password"
                type="password"
                className="w-56"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Tu contraseña"
              />
            </div>

            <Button
              variant="primary"
              loading={register.isPending}
              disabled={!currentPassword}
              onClick={() => register.mutate()}
            >
              {platformAvailable ? 'Añadir passkey de este equipo' : 'Añadir passkey'}
            </Button>
          </div>

          <p className="text-xs text-text-muted/70 font-sans mt-2">
            Al restablecer la contraseña desde &quot;Forgot password&quot; se borran todas las
            passkeys, para que nadie que las hubiera registrado siga entrando.
          </p>
        </div>
      )}
    </SectionCard>
  );
}
