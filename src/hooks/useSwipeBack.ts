import { useEffect, useRef } from "react";

interface Options {
  isOpen: boolean;
  onClose: () => void;
}

export function useSwipeBack({ isOpen, onClose }: Options) {
  const prevOpen = useRef(false);
  const pushedState = useRef(false);
  const closedViaPopstate = useRef(false);

  useEffect(() => {
    const opened = isOpen && !prevOpen.current;
    const closed = !isOpen && prevOpen.current;
    prevOpen.current = isOpen;

    if (opened) {
      history.pushState({ swipeBack: true }, "");
      pushedState.current = true;
      closedViaPopstate.current = false;
    }

    if (closed && pushedState.current && !closedViaPopstate.current) {
      history.back();
      pushedState.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function onPopState() {
      closedViaPopstate.current = true;
      pushedState.current = false;
      onClose();
    }

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      if (pushedState.current && !closedViaPopstate.current) {
        history.back();
        pushedState.current = false;
      }
    };
  }, [isOpen, onClose]);
}
