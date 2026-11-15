import { useEffect, useRef, type ReactNode, type RefObject } from "react";
export function Dialog({
  children,
  onClose,
  returnFocus,
}: {
  children: ReactNode;
  onClose: () => void;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = returnFocus.current;
    const dialog = ref.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>("#inspector-title")?.focus();
    return () => {
      dialog?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, [returnFocus]);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="inspector-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}
