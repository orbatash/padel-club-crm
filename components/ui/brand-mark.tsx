/** Padel ball mark — the one place Optic is used as a brand element. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <circle cx="16" cy="16" r="11" fill="var(--optic)" />
      <path
        d="M7.6 9.2c4.6 1.6 6.9 4.1 6.9 6.8s-2.3 5.2-6.9 6.8M24.4 9.2c-4.6 1.6-6.9 4.1-6.9 6.8s2.3 5.2 6.9 6.8"
        fill="none"
        stroke="var(--on-optic)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}
