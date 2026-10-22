interface CableArtProps {
  className?: string;
}

/**
 * Cabo de fibra desenhado à mão que sai da borda e termina em um conector.
 * É só ilustração: fica escondido dos leitores de tela.
 */
export function CableArt({ className = '' }: CableArtProps) {
  return (
    <svg
      viewBox="0 0 640 220"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M-12 168 C 70 232, 150 40, 262 96 S 430 214, 520 112"
        stroke="#0e1b2c"
        strokeWidth="18"
        strokeLinecap="round"
      />
      <path
        d="M-12 168 C 70 232, 150 40, 262 96 S 430 214, 520 112"
        stroke="#ffffff"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="2 26"
      />
      <g transform="translate(520 112) rotate(-38)">
        <rect x="0" y="-26" width="64" height="52" rx="14" fill="#0e1b2c" />
        <rect x="60" y="-16" width="26" height="12" rx="6" fill="#0e1b2c" />
        <rect x="60" y="4" width="26" height="12" rx="6" fill="#0e1b2c" />
        <circle cx="22" cy="0" r="7" fill="#ffe300" />
      </g>
    </svg>
  );
}
