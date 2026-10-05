// Da la ruta de la API
export const apiUrl = (path: string): string => {
  const p = path.startsWith('/') ? path : `/${path}`;

  return `${import.meta.env.VITE_API_URL}${p}`;
};

const readApiErrorText = async (res: Response): Promise<string> =>
  res.text().catch(() => '');

const ensureOk = async (res: Response) => {
  if (!res.ok) {
    const text = await readApiErrorText(res);

    throw new Error(text || `API ${res.status} ${res.statusText}`);
  }
};

// Custom fetch
export const apiFetch = (path: string, init?: RequestInit): Promise<Response> => {
  const headers = new Headers(init?.headers);
  const body = init?.body;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  if (body != null && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(apiUrl(path), { ...init, headers });
};

// Transforma response de la API
export const apiJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await apiFetch(path, init);

  await ensureOk(res);

  return res.json() as Promise<T>;
};

/** Igual que `apiJson`, pero un 404 devuelve `null` (sin lanzar). */
export const apiJsonOrNull = async <T>(path: string, init?: RequestInit): Promise<T | null> => {
  const res = await apiFetch(path, init);

  if (res.status === 404) return null;

  await ensureOk(res);

  return res.json() as Promise<T>;
};

export const apiBlob = async (path: string, init?: RequestInit): Promise<Blob> => {
  const res = await apiFetch(path, init);

  await ensureOk(res);

  return res.blob();
};
