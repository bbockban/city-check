import { useQuery } from '@tanstack/react-query';

import { fetchIfcParcelContext } from '@/api/services/ifc.services';

const useParcelFromIfc = (file: File | undefined, parcelId?: string) => {
  const fileKey = file ? `${file.name}:${file.size}:${file.lastModified}` : '';
  const pid = parcelId?.trim() ?? '';

  return useQuery({
    enabled: Boolean(file),
    queryFn: () => fetchIfcParcelContext(file!, pid || undefined),
    queryKey: ['parcel', 'ifc', 'parcel-context', fileKey, pid],
    retry: 1,
  });
};

export default useParcelFromIfc;
