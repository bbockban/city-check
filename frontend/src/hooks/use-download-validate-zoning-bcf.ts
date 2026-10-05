import { useMutation } from '@tanstack/react-query';

import type { ValidateIfcZoningParams } from '@/api/types';

import { downloadValidateZoningBcf } from '@/api/services/ifc.services';

const useDownloadValidateZoningBcf = () =>
  useMutation({ mutationFn: (params: ValidateIfcZoningParams) => downloadValidateZoningBcf(params) });

export default useDownloadValidateZoningBcf;
