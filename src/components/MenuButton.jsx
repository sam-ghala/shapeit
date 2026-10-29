export function MenuButton({ onClick }) {
  return (
    <button
      className="menu-back"
      aria-label="Back to menu"
      title="Menu"
      onClick={onClick}
    >
      <svg
        viewBox="0 0 24 24"
        width="26"
        height="26"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m11 5-7 7 7 7M4 12h16" />
      </svg>
    </button>
  );
}
