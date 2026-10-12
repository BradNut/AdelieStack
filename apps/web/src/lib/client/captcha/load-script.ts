const pending = new Map<string, Promise<void>>();

/** Adds a provider script once and resolves when it has loaded; a failed load can be retried. */
export function loadScript(src: string): Promise<void> {
  const existing = pending.get(src);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      pending.delete(src);
      reject(new Error(`Could not load ${src}`));
    };
    document.head.append(script);
  });
  pending.set(src, promise);
  return promise;
}
