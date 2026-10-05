import { useMutation } from '@tanstack/react-query';

import type { ValidateIfcZoningParams } from '@/api/types';

import { validateIfcZoning } from '@/api/services/ifc.services';

const useValidateIfcZoning = () =>
  useMutation({ mutationFn: (params: ValidateIfcZoningParams) => validateIfcZoning(params) });

export default useValidateIfcZoning;
