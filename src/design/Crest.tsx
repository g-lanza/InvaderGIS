/**
 * Crest — two-letter monogram identity mark.
 *
 * A hatched square (SVG diagonal lines at 18% opacity in the region color)
 * with the monogram centered and a solid region-color band along the bottom.
 *
 * Sizes: sm=22 · md=32 · lg=44 · xl=64
 *
 * Design laws: square corners, hairline border, no shadow, token colors only.
 * The hatch + band encode region identity at a glance across all four themes.
 */
import './Crest.css';

const SIZE_PX   = { sm: 22, md: 32, lg: 44, xl: 64 } as const;
const FONT_PX   = { sm: 8,  md: 11, lg: 15, xl: 22 } as const;
const BAND_H    = { sm: 3,  md: 4,  lg: 5,  xl: 7  } as const;

type CrestSize = keyof typeof SIZE_PX;

interface CrestProps {
  /** 1–2 letter abbreviation displayed in the square. */
  monogram: string;
  /** Hex color from regionColor() — drives hatch lines and bottom band. */
  regionColor: string;
  /** Visual size tier. Default: 'md'. */
  size?: CrestSize;
  /** Additional CSS class. */
  className?: string;
}

/** Monogram crest with hatched background and region-color band. */
export function Crest({ monogram, regionColor, size = 'md', className }: CrestProps) {
  const px     = SIZE_PX[size];
  const fontPx = FONT_PX[size];
  const bandH  = BAND_H[size];
  const label  = monogram.slice(0, 2).toUpperCase();
  const patId  = `crest-hatch-${label}-${size}`;

  return (
    <div
      className={`crest crest--${size}${className ? ` ${className}` : ''}`}
      style={{ width: px, height: px }}
      aria-hidden="true"
    >
      {/* Hatch background SVG */}
      <svg
        className="crest__hatch"
        viewBox={`0 0 ${px} ${px}`}
        width={px}
        height={px}
        aria-hidden="true"
      >
        <defs>
          <pattern
            id={patId}
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="5" height="5" fill={regionColor} fillOpacity="0.13" />
            <line
              x1="0" y1="0" x2="0" y2="5"
              stroke={regionColor}
              strokeOpacity="0.45"
              strokeWidth="0.6"
            />
          </pattern>
        </defs>
        <rect width={px} height={px} fill={`url(#${patId})`} />
      </svg>

      {/* Monogram */}
      <span
        className="crest__label"
        style={{ fontSize: fontPx }}
      >
        {label}
      </span>

      {/* Region color band */}
      <div
        className="crest__band"
        style={{ height: bandH, background: regionColor }}
      />
    </div>
  );
}
