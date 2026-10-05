import { useMutation } from '@tanstack/react-query';

import { georeferenceIfc } from '@/api/services/ifc.services';

const useGeoreferenceIfc = () =>
  useMutation({
    mutationFn: ({ file, parcelId }: { file: File; parcelId: string }) =>
      georeferenceIfc(file, parcelId),
  });

export default useGeoreferenceIfc;
