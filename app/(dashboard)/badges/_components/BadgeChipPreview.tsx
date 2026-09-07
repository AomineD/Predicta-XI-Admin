'use client';

import { CATEGORY_COLORS, type BadgeCategory } from './types';

/**
 * El SVG como `data:` URI, listo para un `<img>`.
 *
 * Se codifica con `encodeURIComponent` y no con `btoa`: `btoa` revienta con
 * cualquier carácter fuera de latin-1, y un icono exportado por Figma puede
 * traer un `<title>` con acentos — la previa se quedaría en blanco con un error
 * de consola en vez de enseñar el icono.
 */
function svgDataUri(svg: string): string {
  try {
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  } catch {
    return '';
  }
}

/**
 * El chip tal como se verá en el perfil de la app.
 *
 * Está aquí y no solo en Flutter porque el icono se pega como SVG en un
 * formulario: sin ver el resultado, un trazo demasiado fino o un `viewBox` mal
 * puesto solo se descubren tras publicar, con la insignia ya en los perfiles.
 *
 * Reproduce el mismo lenguaje que `BadgeChip` (icono pequeño, título en
 * versalitas, fondo tenue y borde del mismo tono). No reproduce la variante de
 * suscriptor —donde manda el color del tier— porque eso no depende de lo que se
 * edita aquí.
 */
export function BadgeChipPreview({
  category,
  iconSvg,
  iconSlug,
  title,
  size = 'md',
}: {
  category: BadgeCategory;
  iconSvg: string | null;
  iconSlug: string | null;
  title: string;
  size?: 'sm' | 'md';
}) {
  const c = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.feat;
  const px = size === 'sm' ? 11 : 13;
  // Ojo con el data URI vacío: `url("")` NO es una imagen ausente, resuelve al
  // documento actual y el navegador intentaría usar la página del panel como
  // máscara (chip en bloque sólido o invisible). Por eso la condición del render
  // es `maskUrl`, no `iconSvg`: si `svgDataUri` falla se cae al punto del slug.
  const maskUri = iconSvg ? svgDataUri(iconSvg) : '';
  const maskUrl = maskUri ? `url("${maskUri}")` : null;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 max-w-full"
      style={{ background: c.dim, borderColor: c.border }}
    >
      <span
        className="inline-flex items-center justify-center flex-none"
        style={{ width: px + 3, height: px + 3, color: c.accent }}
      >
        {maskUrl ? (
          // NUNCA con `dangerouslySetInnerHTML`.
          //
          // Aquí el SVG viene del textarea del editor, letra a letra, ANTES de
          // que el backend lo haya visto: inyectarlo en el DOM ejecutaría lo
          // que el admin acabe de pegar —normalmente algo descargado de una web
          // de iconos— dentro de la sesión que hace de proxy a todos los
          // endpoints de administración.
          //
          // Se usa como MÁSCARA CSS, no como `<img>`. Los dos son contextos sin
          // scripting (el navegador dibuja el SVG y no ejecuta nada de lo que
          // lleve dentro), pero la máscara además tiñe: pinta el color de la
          // categoría a través de la silueta del icono. Con `<img>` el color se
          // perdía y todo icono con `fill` propio —o sin `fill`, que por
          // defecto es negro— se veía NEGRO sobre el fondo oscuro del panel,
          // aunque en la app saliera del color correcto: Flutter lo tiñe con
          // `ColorFilter(BlendMode.srcIn)`, que es justo lo que replica esto.
          <span
            aria-hidden
            className="block w-full h-full"
            style={{
              backgroundColor: c.accent,
              maskImage: maskUrl,
              WebkitMaskImage: maskUrl,
              maskRepeat: 'no-repeat',
              WebkitMaskRepeat: 'no-repeat',
              maskPosition: 'center',
              WebkitMaskPosition: 'center',
              maskSize: 'contain',
              WebkitMaskSize: 'contain',
            }}
          />
        ) : iconSlug ? (
          <span className="block w-2 h-2 rounded-full" style={{ background: c.accent }} />
        ) : (
          <span className="block w-2 h-2 rounded-full border border-dashed" style={{ borderColor: c.accent }} />
        )}
      </span>
      <span
        className="text-[11px] font-semibold uppercase tracking-wide font-sans truncate"
        style={{ color: c.accent }}
      >
        {title || 'sin título'}
      </span>
    </span>
  );
}
