export const PROD_ORIGIN = "https://counter-weight.evinle.app";
export const LOCAL_ORIGIN = "https://localhost:5174";

export const ALLOWED_ORIGINS = [LOCAL_ORIGIN, PROD_ORIGIN] as const;

export const PROD_CALLBACK_URL = `${PROD_ORIGIN}/auth/callback`;
export const LOCAL_CALLBACK_URL = `${LOCAL_ORIGIN}/auth/callback`;
