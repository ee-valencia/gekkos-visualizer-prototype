// src/zarr-shim.d.ts
declare module "zarr" {
  /** HTTPStore for chunked Zarr arrays */
  export class HTTPStore {
    constructor(base: string, options?: { cache?: boolean; fetchOptions?: any; supportedMethods?: string[] });
  }
  /** Open a Zarr array for reading */
  export function openArray(opts: { store: any; mode: "r"; cache?: boolean }): Promise<any>;
}