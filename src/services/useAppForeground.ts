import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

export function useAppForeground() {
  const [foreground, setForeground] = useState(
    AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive',
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state =>
      setForeground(state === 'active'),
    );
    return () => subscription.remove();
  }, []);

  return foreground;
}
