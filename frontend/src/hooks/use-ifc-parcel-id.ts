import { useMutation } from '@tanstack/react-query';

import { fetchParcelIdFromIfc } from '@/api/services/ifc.services';

const useIfcParcelId = () =>
  useMutation({
    mutationFn: (file: File) => fetchParcelIdFromIfc(file),
    retry: false,
  });

export default useIfcParcelId;
