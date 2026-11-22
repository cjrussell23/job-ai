/** How sources reach the web. Tests pass a fetcher that returns saved samples. */
export type Fetcher = {
  text: (url: string) => Promise<string>;
  json: (url: string) => Promise<unknown>;
};

// Generic on purpose: nothing about the app's users goes to the sites it reads.
export const userAgent = "job-ai/0.1 (personal job search; low volume)";

async function get(url: string): Promise<Response> {
  const response = await fetch(url, {
    headers: { "user-agent": userAgent },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${response.status} from ${new URL(url).host}`);
  return response;
}

export const httpFetcher: Fetcher = {
  text: async (url) => (await get(url)).text(),
  json: async (url) => (await get(url)).json(),
};

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
