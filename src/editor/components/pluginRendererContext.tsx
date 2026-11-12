import { createContext, useContext, type ReactNode } from 'react';
import type { DomPluginRenderContext } from '@/engine/core/plugin.js';
import type { PluginRendererRegistry } from '@/engine/core/pluginRendererRegistry.js';

const PluginRendererContext = createContext<
  PluginRendererRegistry<DomPluginRenderContext> | undefined
>(undefined);

export function PluginRendererProvider({
  value,
  children,
}: {
  value: PluginRendererRegistry<DomPluginRenderContext> | undefined;
  children: ReactNode;
}) {
  return (
    <PluginRendererContext.Provider value={value}>
      {children}
    </PluginRendererContext.Provider>
  );
}

export function usePluginRendererRegistry():
  PluginRendererRegistry<DomPluginRenderContext> | undefined {
  return useContext(PluginRendererContext);
}
