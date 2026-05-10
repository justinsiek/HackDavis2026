"use client";

type Props = {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
};

export default function Sparkline({
  values,
  width = 80,
  height = 24,
  className = "text-[#0F172A]",
}: Props) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const last = values[values.length - 1];
  const lastX = (values.length - 1) * stepX;
  const lastY = height - ((last - min) / range) * height;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`overflow-visible ${className}`}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r="2" fill="currentColor" />
    </svg>
  );
}
