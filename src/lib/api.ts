export const API_URL: string =
  "https://i55bwod2e0.execute-api.ap-southeast-2.amazonaws.com";

export function fetchFromBackend(
  path: string,
  options?: RequestInit,
): Promise<Response> {
  return fetch(`${API_URL}${path}`, options);
}
