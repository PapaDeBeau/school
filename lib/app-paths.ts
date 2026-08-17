export const APP_BASE_PATH = "/school";

export function appPath(path: string) {
  return `${APP_BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
}
