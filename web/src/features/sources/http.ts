/** How sources reach the web. Tests pass a fetcher that returns saved samples. */
export type Fetcher = {
  text: (url: string) => Promise<string>;
  json: (url: string) => Promise<unknown>;
  /** A JSON POST, for career sites whose listing API takes a request body (Workday). */
  postJson?: (url: string, body: unknown) => Promise<unknown>;
};

// Generic on purpose: nothing about the app's users goes to the sites it reads.
const userAgent = "job-ai/0.1 (personal job search; low volume)";

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
  postJson: async (url, body) => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "user-agent": userAgent,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`${response.status} from ${new URL(url).host}`);
    return response.json();
  },
};

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
