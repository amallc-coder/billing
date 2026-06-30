// Brand mark — three stacked horizontal bars (a mini bar chart), warm-to-green,
// matching the clinilytics logo. Used in the header and on the auth screen.
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
      <rect x="6" y="8" width="13" height="4.4" rx="2.2" fill="#df5a2c" />
      <rect x="6" y="13.8" width="20" height="4.4" rx="2.2" fill="#e89227" />
      <rect x="6" y="19.6" width="10" height="4.4" rx="2.2" fill="#1f9d6b" />
    </svg>
  )
}
