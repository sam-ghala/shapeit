import { useEffect, useRef } from "react";
export function Dialog({ title, onClose, children, className = "" }) {
  const ref = useRef(null);
  const backdropDown = useRef(false);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${className}`}
      aria-label={title}
      onCancel={onClose}
      onPointerDown={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        backdropDown.current =
          e.target === e.currentTarget &&
          (e.clientX < box.left ||
            e.clientX > box.right ||
            e.clientY < box.top ||
            e.clientY > box.bottom);
      }}
      onClick={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        if (
          backdropDown.current &&
          e.target === e.currentTarget &&
          (e.clientX < box.left ||
            e.clientX > box.right ||
            e.clientY < box.top ||
            e.clientY > box.bottom)
        )
          onClose();
        backdropDown.current = false;
      }}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button aria-label="Close dialog" onClick={onClose}>
          ✕
        </button>
      </div>
      {children}
    </dialog>
  );
}
