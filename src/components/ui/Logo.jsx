// Brand mark — a two-leaf sprout (clinical + analytics + growth), drawn in the
// warm brand palette. Used in the header and on the auth screen.
export default function Logo({ size = 26, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path d="M16 29 L16 14" stroke="#1c1a14" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M16 16 C10 17 5 14 5 8 C11 8 16 11 16 16 Z" fill="#1f9d6b" />
      <path d="M16 13 C22 14 27 11 27 5 C21 5 16 8 16 13 Z" fill="#bd6a3a" />
    </svg>
  )
}
