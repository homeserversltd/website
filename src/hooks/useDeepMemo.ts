import { useMemo, useRef } from 'react';
import isEqual from 'fast-deep-equal';

/**
 * Custom hook that memoizes a value deeply, ensuring that the 
 * reference only changes when the value itself changes. This 
 * is useful for preventing unnecessary re-renders in React 
 * components that depend on complex objects or arrays.
 * 
 * @param value - The value to be deeply memoized. This can be 
 * any type, including objects and arrays.
 * @returns The deeply memoized value, which will only change 
 * when the input value is different from the previous one.
 */
export const useDeepMemo = <T>(value: T): T => {
  const ref = useRef<T>(value);
  
  if (!isEqual(ref.current, value)) {
    ref.current = value;
  }

  return useMemo(() => ref.current, [ref.current]);
}; 