if (import.meta.env.VITE_API_URL === undefined) {
  throw new Error(
    "VITE_API_URL is not defined — set it in .env or .env.production",
  );
}

export const API_URL: string = import.meta.env.VITE_API_URL;

export function fetchFromBackend(
  path: string,
  options?: RequestInit,
): Promise<Response> {
  return fetch(`${API_URL}${path}`, options);
}
