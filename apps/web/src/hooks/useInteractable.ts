import { useEffect, type RefObject } from "react";

export function useInteractable(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const enable = () => window.nativeApi?.setInteractive(true);
    const disable = () => window.nativeApi?.setInteractive(false);

    el.addEventListener("mouseenter", enable);
    el.addEventListener("mouseleave", disable);

    return () => {
      el.removeEventListener("mouseenter", enable);
      el.removeEventListener("mouseleave", disable);
    };
  }, [ref]);
}
