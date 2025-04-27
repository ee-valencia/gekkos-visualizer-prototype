// src/hooks/useFetchSlice.ts
import { useState, useCallback } from "react";

export interface SliceOptions {
  dataset: string;
  level: number;
  sliceType: "inline" | "crossline";
  sliceNumber: number;
}

export interface SliceResult {
  data: number[][];
  width: number;
  height: number;
  min: number;
  max: number;
  fetchTime: number;
}

export function useFetchSlice() {
  const [result, setResult] = useState<SliceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSlice = useCallback(async (opts: SliceOptions) => {
    setLoading(true);
    setError(null);
    const { dataset, level, sliceType, sliceNumber } = opts;
    const url = new URL(`${import.meta.env.VITE_API_URL}/zarr/${dataset}/level/${level}/cached_slice`);
    url.searchParams.append(sliceType, sliceNumber.toString());

    const start = performance.now();
    try {
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as {
        slice_shape: [number, number];
        data: number[][];
      };
      const [width, height] = json.slice_shape;
      const flat = json.data.flat();
      const min = Math.min(...flat);
      const max = Math.max(...flat);
      const fetchTime = performance.now() - start;

      setResult({ data: json.data, width, height, min, max, fetchTime });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { result, loading, error, fetchSlice };
}