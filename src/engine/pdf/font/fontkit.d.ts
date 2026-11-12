declare module 'fontkit' {
  interface FontkitModule {
    create(input: Buffer | Uint8Array): {
      attributes: Record<string, unknown>;
      getGlyphForCodePoint(codePoint: number): {
        name: string;
        path: {
          toSVG(): string;
          toFunction(): (t: number) => { x: number; y: number };
        } | null;
      };
      [key: string]: unknown;
    };
    openSync(filename: string): unknown;
    open(filename: string): Promise<unknown>;
  }
  const fontkit: FontkitModule;
  export = fontkit;
}
