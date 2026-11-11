import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Keyboard, View } from 'react-native';
import type { GuideRect } from '../domain/GuideLayout';
import { fieldwork } from '../services/LocalRepositoryAdapter';
import { useAppForeground } from '../services/useAppForeground';
import type { GuideStatus } from '../specs/NativeFieldwork';
import { GUIDE_STEPS, type GuideScope, type GuideTargetId } from './GuideSteps';
import type { MainTabsParamList } from './WizardState';

export type GuideAnchor = {
  measure: () => Promise<GuideRect | null>;
  reveal: () => Promise<void>;
};
export type GuideRun = {
  scope: GuideScope;
  index: number;
  origin: keyof MainTabsParamList;
};

type Guide = {
  run: GuideRun | null;
  active: boolean;
  seen: GuideStatus | null;
  start: (scope: GuideScope, origin?: keyof MainTabsParamList) => void;
  finish: () => void;
  move: (direction: -1 | 1) => void;
  register: (id: GuideTargetId, anchor: GuideAnchor) => () => void;
  anchor: (id: GuideTargetId) => GuideAnchor | undefined;
};
const GuideContext = createContext<Guide | null>(null);

export function measureGuideView(
  view: React.ComponentRef<typeof View> | null,
): Promise<GuideRect | null> {
  if (!view) return Promise.resolve(null);
  return new Promise(resolve => {
    let done = false;
    const settle = (rect: GuideRect | null) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      resolve(rect);
    };
    const timeout = setTimeout(() => settle(null), 300);
    try {
      view.measureInWindow((x, y, width, height) => {
        settle(width > 0 && height > 0 ? { x, y, width, height } : null);
      });
    } catch {
      // A native target can disappear during navigation or a quick dismissal.
      settle(null);
    }
  });
}

export function GuideProvider({
  children,
  navigate,
}: React.PropsWithChildren<{
  navigate: (tab: keyof MainTabsParamList) => void;
}>) {
  const [run, setRun] = useState<GuideRun | null>(null);
  const [seen, setSeen] = useState<GuideStatus | null>(null);
  const anchors = useRef(new Map<GuideTargetId, GuideAnchor>());
  const current = useRef(run);
  current.current = run;
  const go = useRef(navigate);
  go.current = navigate;

  useEffect(() => {
    let active = true;
    fieldwork()
      .getGuideStatus()
      .then(value => {
        if (active)
          setSeen(previous => ({
            overview: !!previous?.overview || value.overview,
            room: !!previous?.room || value.room,
          }));
      })
      .catch(() => {
        // A guide preference must never prevent measuring or reading the history.
      });
    return () => {
      active = false;
    };
  }, []);

  const start = useCallback(
    (scope: GuideScope, origin: keyof MainTabsParamList = 'Medir') => {
      if (current.current) return;
      Keyboard.dismiss();
      const next = { scope, index: 0, origin };
      current.current = next;
      setRun(next);
      // Only local UI preferences; this does not touch consent or measurements.
      setSeen(previous => ({
        overview: previous?.overview ?? false,
        room: previous?.room ?? false,
        [scope]: true,
      }));
      fieldwork()
        .markGuideSeen(scope)
        .catch(() => {});
      const tab = GUIDE_STEPS[scope][0].tab;
      if (tab) go.current(tab);
    },
    [],
  );
  const finish = useCallback(() => {
    const previous = current.current;
    current.current = null;
    setRun(null);
    if (previous?.scope === 'overview') go.current(previous.origin);
  }, []);
  const move = useCallback(
    (direction: -1 | 1) => {
      const previous = current.current;
      if (!previous) return;
      const index = previous.index + direction;
      if (index < 0) return;
      if (index >= GUIDE_STEPS[previous.scope].length) {
        finish();
        return;
      }
      const next = { ...previous, index };
      current.current = next;
      setRun(next);
      const tab = GUIDE_STEPS[next.scope][index].tab;
      if (tab) go.current(tab);
    },
    [finish],
  );
  const register = useCallback((id: GuideTargetId, anchor: GuideAnchor) => {
    anchors.current.set(id, anchor);
    return () => {
      if (anchors.current.get(id) === anchor) anchors.current.delete(id);
    };
  }, []);
  const anchor = useCallback(
    (id: GuideTargetId) => anchors.current.get(id),
    [],
  );
  const value = useMemo(
    () => ({ run, active: !!run, seen, start, finish, move, register, anchor }),
    [run, seen, start, finish, move, register, anchor],
  );
  return (
    <GuideContext.Provider value={value}>{children}</GuideContext.Provider>
  );
}

export function useGuide() {
  const value = useContext(GuideContext);
  if (!value) throw new Error('GuideProvider required');
  return value;
}

export function useAutoGuide(scope: GuideScope, enabled: boolean) {
  const { active, seen, start } = useGuide();
  const foreground = useAppForeground();
  useEffect(() => {
    if (!enabled || !foreground || active || !seen || seen[scope]) return;
    // Give the native screen transition time to settle; no sensor or consent action.
    const timer = setTimeout(() => start(scope), 650);
    return () => clearTimeout(timer);
  }, [scope, enabled, foreground, active, seen, start]);
}
