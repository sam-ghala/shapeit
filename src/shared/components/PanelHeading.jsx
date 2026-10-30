export function PanelHeading({ title, onClose, children, className = "" }) {
  return (
    <div className={`panel-heading ${className}`}>
      <h2>{title}</h2>
      <div className="panel-heading-actions">
        {children}
        <button
          className="panel-close"
          aria-label="Close menu"
          onClick={onClose}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </div>
  );
}
