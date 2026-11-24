import { BUILDING } from '@/game/level/building';

/** Static SVG preview of the building, both routes, spawns and the flag zone (Match Setup). */
export default function MapPreview() {
  const L = BUILDING;
  const cam = L.camera;
  const w = cam.x1 - cam.x0;
  const h = cam.y1 - cam.y0;
  const X = (x: number) => x - cam.x0;
  const Y = (y: number) => cam.y1 - y;
  const mainRoute = [
    [-7, 0.6], [20, 0.6], [16, 4.6], [4, 4.6], [8, 8.6], [20, 8.6], [16, 12.6], [4, 12.6], [8, 16.6], [17, 16.6],
  ];
  const ladderRoute = [[-7, 1.2], [-1, 1.2], [-1, 4.9], [4, 4.9]];
  const pts = (p: number[][]) => p.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Map preview: four-floor building with switchback stairs, outside ladder and rooftop flag zone">
      <rect x={0} y={0} width={w} height={h} fill="#1B1F2A" />
      <rect x={X(L.building.x0)} y={Y(L.building.y1)} width={24} height={16} fill="#343a46" />
      {L.solids.slice(3).map((s, i) => (
        <rect key={i} x={X(s.x0)} y={Y(s.y1)} width={s.x1 - s.x0} height={s.y1 - s.y0} fill="#6B7280" />
      ))}
      <rect x={X(cam.x0)} y={Y(0)} width={w} height={1} fill="#2a2f3a" />
      {L.stairs.map((s) => (
        <line key={s.id} x1={X(s.foot.x)} y1={Y(s.foot.y)} x2={X(s.top.x)} y2={Y(s.top.y)} stroke="#9CA3AF" strokeWidth={0.25} />
      ))}
      {L.ladders.map((l) => (
        <line key={l.id} x1={X(l.x)} y1={Y(l.y0)} x2={X(l.x)} y2={Y(l.y1 + 0.8)} stroke="#a08a5a" strokeWidth={0.3} strokeDasharray="0.3 0.2" />
      ))}
      <rect x={X(L.flagZone.x0)} y={Y(L.flagZone.y1)} width={6} height={2} fill="#F4D35E" opacity={0.35} />
      <text x={X(17)} y={Y(18.6)} fontSize={0.9} fill="#F4D35E" textAnchor="middle" fontWeight={800}>FLAG</text>
      <polyline points={pts(mainRoute)} fill="none" stroke="#E4572E" strokeWidth={0.18} strokeDasharray="0.6 0.3" />
      <polyline points={pts(ladderRoute)} fill="none" stroke="#fbbf24" strokeWidth={0.18} strokeDasharray="0.3 0.3" />
      <text x={X(-9)} y={Y(2.2)} fontSize={0.8} fill="#E4572E" fontWeight={800}>▲ ATTACK</text>
      <text x={X(9)} y={Y(13.6)} fontSize={0.8} fill="#2E86DE" fontWeight={800}>■ DEFEND</text>
      {L.floors.map((f) => (
        <text key={f.id} x={X(24.7)} y={Y(f.y + 0.6)} fontSize={0.7} fill="#9CA3AF">{f.name}</text>
      ))}
      <text x={X(-11.5)} y={Y(5.6)} fontSize={0.6} fill="#fbbf24">ladder shortcut</text>
    </svg>
  );
}
