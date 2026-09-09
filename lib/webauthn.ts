/**
 * Puente mínimo entre la API WebAuthn del navegador y el JSON que habla el backend.
 *
 * `navigator.credentials` trabaja con `ArrayBuffer`; el servidor emite y espera
 * base64url. Los navegadores actuales ya saben hacer esa traducción solos
 * (`parseCreationOptionsFromJSON` / `toJSON`), así que se usa esa vía cuando
 * existe y solo se cae a la conversión manual en los que aún no la traen.
 *
 * Se hace aquí en vez de instalar `@simplewebauthn/browser`: son cuarenta líneas
 * de codificación sin criptografía propia, y el panel no gana una dependencia.
 */

export interface RegistrationResponseJSON {
  id: string;
  rawId: string;
  response: {
    clientDataJSON: string;
    attestationObject: string;
    transports?: string[];
  };
  authenticatorAttachment?: string;
  clientExtensionResults: Record<string, unknown>;
  type: string;
}

export interface AuthenticationResponseJSON {
  id: string;
  rawId: string;
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string | null;
  };
  authenticatorAttachment?: string;
  clientExtensionResults: Record<string, unknown>;
  type: string;
}

/** ¿Puede este navegador usar passkeys? */
export function isWebAuthnAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function';
}

/**
 * ¿Hay un autenticador integrado (Windows Hello, Touch ID, huella del teléfono)?
 * Solo sirve para decidir qué texto mostrar: una llave USB también vale aunque
 * esto devuelva `false`.
 */
export async function hasPlatformAuthenticator(): Promise<boolean> {
  if (!isWebAuthnAvailable()) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function base64UrlToBuffer(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

type CredentialDescriptorJSON = { id: string; type?: string; transports?: string[] };

function toDescriptors(list: CredentialDescriptorJSON[] | undefined): PublicKeyCredentialDescriptor[] | undefined {
  if (!list?.length) return undefined;
  return list.map((item) => ({
    id: base64UrlToBuffer(item.id),
    type: 'public-key' as const,
    transports: item.transports as AuthenticatorTransport[] | undefined,
  }));
}

/**
 * Registra una passkey nueva. `optionsJSON` viene tal cual del backend.
 * Devuelve `null` si cancelas el diálogo del sistema.
 */
export async function createPasskey(optionsJSON: Record<string, unknown>): Promise<RegistrationResponseJSON | null> {
  if (!isWebAuthnAvailable()) {
    throw new Error('Este navegador no admite passkeys.');
  }

  const parse = (window.PublicKeyCredential as unknown as {
    parseCreationOptionsFromJSON?: (json: unknown) => PublicKeyCredentialCreationOptions;
  }).parseCreationOptionsFromJSON;

  const publicKey = parse
    ? parse(optionsJSON)
    : ({
        ...(optionsJSON as unknown as PublicKeyCredentialCreationOptions),
        challenge: base64UrlToBuffer(optionsJSON.challenge as string),
        user: {
          ...(optionsJSON.user as { name: string; displayName: string }),
          id: base64UrlToBuffer((optionsJSON.user as { id: string }).id),
        },
        excludeCredentials: toDescriptors(optionsJSON.excludeCredentials as CredentialDescriptorJSON[] | undefined),
      } as PublicKeyCredentialCreationOptions);

  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!credential) return null;

  const toJSON = (credential as unknown as { toJSON?: () => RegistrationResponseJSON }).toJSON;
  if (typeof toJSON === 'function') return toJSON.call(credential);

  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    response: {
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      attestationObject: bufferToBase64Url(response.attestationObject),
      transports: response.getTransports?.() ?? undefined,
    },
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
    clientExtensionResults: credential.getClientExtensionResults() as Record<string, unknown>,
    type: credential.type,
  };
}

/**
 * Pide al navegador que firme el reto de login con una passkey ya registrada.
 * Devuelve `null` si cancelas el diálogo del sistema.
 */
export async function getPasskeyAssertion(optionsJSON: Record<string, unknown>): Promise<AuthenticationResponseJSON | null> {
  if (!isWebAuthnAvailable()) {
    throw new Error('Este navegador no admite passkeys.');
  }

  const parse = (window.PublicKeyCredential as unknown as {
    parseRequestOptionsFromJSON?: (json: unknown) => PublicKeyCredentialRequestOptions;
  }).parseRequestOptionsFromJSON;

  const publicKey = parse
    ? parse(optionsJSON)
    : ({
        ...(optionsJSON as unknown as PublicKeyCredentialRequestOptions),
        challenge: base64UrlToBuffer(optionsJSON.challenge as string),
        allowCredentials: toDescriptors(optionsJSON.allowCredentials as CredentialDescriptorJSON[] | undefined),
      } as PublicKeyCredentialRequestOptions);

  const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (!credential) return null;

  const toJSON = (credential as unknown as { toJSON?: () => AuthenticationResponseJSON }).toJSON;
  if (typeof toJSON === 'function') return toJSON.call(credential);

  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    response: {
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      authenticatorData: bufferToBase64Url(response.authenticatorData),
      signature: bufferToBase64Url(response.signature),
      userHandle: response.userHandle ? bufferToBase64Url(response.userHandle) : null,
    },
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
    clientExtensionResults: credential.getClientExtensionResults() as Record<string, unknown>,
    type: credential.type,
  };
}

/**
 * Traduce los errores del diálogo del sistema a algo legible. `NotAllowedError`
 * es tanto "cancelaste" como "se agotó el tiempo": no se distinguen a propósito
 * para no filtrar si la credencial existía.
 */
export function describeWebAuthnError(error: unknown): string | null {
  if (!(error instanceof Error)) return 'No se pudo completar la operación con la passkey.';

  switch (error.name) {
    case 'NotAllowedError':
      // Cancelación explícita: no es un fallo que merezca mensaje de error.
      return null;
    case 'InvalidStateError':
      return 'Este dispositivo ya tiene una passkey registrada en el panel.';
    case 'NotSupportedError':
      return 'Este navegador o dispositivo no admite passkeys.';
    case 'SecurityError':
      return 'El dominio no coincide con el registrado para las passkeys.';
    default:
      // Un fallo del diálogo del sistema llega como DOMException y su texto no
      // le dice nada a nadie: mensaje fijo. Lo que no viene del diálogo es un
      // error de la API (por ejemplo "Current password is incorrect") y ese sí
      // hay que mostrarlo, igual que hace el resto del panel.
      return error instanceof DOMException
        ? 'No se pudo completar la operación con la passkey.'
        : error.message || 'No se pudo completar la operación con la passkey.';
  }
}
