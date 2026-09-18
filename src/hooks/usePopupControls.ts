import { useEffect, useState } from 'react';
import {
  DEFAULT_POPUP_CONTROLS,
  type PopupControls,
} from '../types/popupControls';
import { subscribePopupControls } from '../utils/popupControlsService';

/**
 * Live popup kill-switches from adminSettings/popupControls.
 * Defaults all ON if the doc is missing or unreadable.
 */
export function usePopupControls(): {
  controls: PopupControls;
  loading: boolean;
} {
  const [controls, setControls] = useState<PopupControls>(DEFAULT_POPUP_CONTROLS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribePopupControls((next) => {
      setControls(next);
      setLoading(false);
    });
    return unsub;
  }, []);

  return { controls, loading };
}
