/** Classic circle-head stickman (GDD §3) for cards and avatars. Pure SVG, no hooks. */
export function StickFigure({ color = '#f3f4f6', accent, pose = 'stand', className, label }: {
  color?: string;
  accent?: string;
  pose?: 'stand' | 'fight' | 'cheer';
  className?: string;
  label?: string;
}) {
  const arms = {
    stand: 'M30 40 L18 58 M30 40 L42 58',
    fight: 'M30 40 L46 36 L54 30 M30 40 L20 50 L28 46',
    cheer: 'M30 40 L16 24 M30 40 L44 24',
  }[pose];
  const legs = pose === 'fight' ? 'M30 64 L18 90 M30 64 L44 88' : 'M30 64 L20 92 M30 64 L40 92';
  return (
    <svg viewBox="0 0 60 100" className={className} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <g stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <circle cx="30" cy="20" r="11" />
        <path d="M30 31 L30 64" />
        <path d={arms} />
        <path d={legs} />
      </g>
      {accent && <path d="M19 14 Q30 2 41 14" stroke={accent} strokeWidth={4} fill="none" strokeLinecap="round" />}
    </svg>
  );
}
