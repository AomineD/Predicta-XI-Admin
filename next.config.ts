import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad del panel.
 *
 * El panel no tenía ninguna, y eso lo convertía en el blanco de más valor de
 * todo el producto: su sesión hace de proxy a **todos** los endpoints de
 * administración, así que cualquier script que llegue a ejecutarse aquí puede
 * operar el sistema entero. El detonante fue el editor de insignias, donde el
 * admin pega un SVG descargado de internet — ese caso ya se ataja pintándolo
 * como `data:` URI dentro de un `<img>` y validándolo en el servidor, pero una
 * CSP es la red que cubre lo que todavía no hemos pensado.
 *
 * `unsafe-inline` y `unsafe-eval` en `script-src` no son un descuido: Next
 * inyecta los scripts de hidratación en línea y el modo desarrollo usa `eval`.
 * Quitarlos exige el nonce del App Router, que es un cambio aparte; aun así la
 * cabecera ya corta `object-src`, `frame-ancestors` (clickjacking) y `base-uri`
 * (secuestro de rutas relativas), y limita a dónde puede salir una petición.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  // `data:` cubre la previa del icono de una insignia; `https:` los escudos y
  // banderas de los equipos, que vienen de Flashscore.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // El panel habla con su propio proxy (`/api/proxy`), nunca directo al backend.
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
