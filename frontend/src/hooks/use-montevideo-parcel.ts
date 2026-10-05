import { useQuery } from '@tanstack/react-query';

import { fetchMontevideoParcel } from '@/api/services/parcel.services';

const useMontevideoParcel = (parcelId: string | undefined) => {
  const trimmed = parcelId?.trim() ?? '';

  return useQuery({
    enabled: trimmed.length > 0,
    queryFn: () => fetchMontevideoParcel(trimmed),
    queryKey: ['parcel', 'montevideo', trimmed],
    retry: 1,
  });
};

export default useMontevideoParcel;
