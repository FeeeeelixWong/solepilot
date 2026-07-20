interface PuterAI {
  chat: (
    prompt: string,
    options?: { model?: string },
  ) => Promise<unknown>;
}

interface Window {
  puter?: {
    ai?: PuterAI;
  };
}
