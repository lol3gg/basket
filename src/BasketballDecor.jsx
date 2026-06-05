/** Palla da basket SVG — linee classiche, stile premium oro. */
export function BasketballIcon({ className = '', size = 64, style }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      style={style}
    >
      <circle cx="50" cy="50" r="47" fill="currentColor" fillOpacity="0.06" stroke="currentColor" strokeWidth="1.2" />
      <path d="M50 4 V96" stroke="currentColor" strokeWidth="1" strokeOpacity="0.55" />
      <path d="M4 50 H96" stroke="currentColor" strokeWidth="1" strokeOpacity="0.55" />
      <path
        d="M16 16 Q50 50 16 84"
        stroke="currentColor"
        strokeWidth="1"
        strokeOpacity="0.45"
        fill="none"
      />
      <path
        d="M84 16 Q50 50 84 84"
        stroke="currentColor"
        strokeWidth="1"
        strokeOpacity="0.45"
        fill="none"
      />
      <ellipse cx="50" cy="50" rx="47" ry="47" stroke="currentColor" strokeWidth="0.5" strokeOpacity="0.25" />
    </svg>
  );
}

const FLOATERS = [
  { className: 'bball-1', size: 140, style: { top: '6%', right: '4%' } },
  { className: 'bball-2', size: 88, style: { bottom: '14%', left: '3%' } },
  { className: 'bball-3', size: 56, style: { top: '42%', left: '8%' } },
  { className: 'bball-4', size: 72, style: { bottom: '28%', right: '10%' } },
  { className: 'bball-5', size: 44, style: { top: '18%', left: '42%' } },
];

export default function BasketballDecor() {
  return (
    <div className="basketball-decor" aria-hidden="true">
      {FLOATERS.map(({ className, size, style }) => (
        <BasketballIcon key={className} className={`bball ${className}`} size={size} style={style} />
      ))}
    </div>
  );
}
