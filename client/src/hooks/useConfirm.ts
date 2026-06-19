import { useState, useCallback } from "react";

interface ConfirmOptions {
  titulo: string;
  mensaje: string;
  btnOk?: string;
  peligroso?: boolean;
}

export function useConfirm() {
  const [state, setState] = useState<{
    open: boolean;
    options: ConfirmOptions;
    resolve: ((value: boolean) => void) | null;
  }>({
    open: false,
    options: { titulo: "", mensaje: "" },
    resolve: null,
  });

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ open: true, options, resolve });
    });
  }, []);

  const handleResponse = useCallback((value: boolean) => {
    state.resolve?.(value);
    setState((s) => ({ ...s, open: false, resolve: null }));
  }, [state]);

  return { confirm, confirmState: state, handleResponse };
}
