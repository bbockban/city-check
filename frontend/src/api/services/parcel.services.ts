import { apiJson } from '..';
import type { MontevideoParcelResponse } from '../types';

export const fetchMontevideoParcel =
  (parcelId: string): Promise<MontevideoParcelResponse> =>
    apiJson<MontevideoParcelResponse>(`/api/v1/parcels/montevideo/${encodeURIComponent(parcelId.trim())}`);
