import type { ZoningComplianceResponse } from '@/api/types';

import { cn } from '@/lib/utils';

const fmtNum = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—' : String(v);

const fmtCompliant = (c: boolean | null | undefined) => {
  if (c === true) return 'Cumple';
  if (c === false) return 'No cumple';

  return 'N/D';
};

const complianceTextClass = (c: boolean | null | undefined) => {
  if (c === true) return 'text-green-700';
  if (c === false) return 'text-red-700';

  return 'text-gray-500';
};

const complianceBorderClass = (c: boolean | null | undefined) => {
  if (c === true) return 'border-green-300';
  if (c === false) return 'border-red-300';

  return 'border-gray-200';
};

export type ZoningResultPanelProps = {
  data: ZoningComplianceResponse;
};

export const ZoningResultPanel = ({ data }: ZoningResultPanelProps) => (
  <div className="space-y-3 text-sm text-gray-800">
    <p className="text-base">
      <span className="font-semibold">Zona:</span>
      <span className="ml-1">
        {data.zoningAreaName} · Padrón {data.parcelId} · {data.municipalityCode}
      </span>
    </p>
    <p>
      <span className="font-semibold">Resultado global:</span>
      <span className={cn('ml-1 font-semibold', complianceTextClass(data.overallCompliant))}>
        {fmtCompliant(data.overallCompliant)}
      </span>
    </p>
    <div>
      <p className="mb-2 font-semibold">Parámetros</p>
      <ul className="space-y-2">
        {data.parameterChecks.map((c) => (
          <li
            key={`${c.parameterKind}-${c.unit}-${String(c.measuredValue)}`}
            className={cn(
              'rounded-lg border-l-4 bg-gray-50/80 px-3 py-2 leading-snug',
              complianceBorderClass(c.compliant),
            )}
          >
            <strong>{c.parameterKind}</strong>
            <span className="ml-1">
              ({c.unit}): medido {fmtNum(c.measuredValue)} · límite {fmtNum(c.limitValue)} —{' '}
              <span className={cn('font-medium', complianceTextClass(c.compliant))}>
                {fmtCompliant(c.compliant)}
              </span>
            </span>
            {c.notes && (
              <p className="mt-1 text-xs text-gray-600">
                {c.notes}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
    {(data.warnings ?? []).length > 0 && (
      <div>
        <p className="mb-1 font-semibold text-amber-800">Advertencias</p>
        <ul className="space-y-1 text-xs text-amber-900">
          {(data.warnings ?? []).map((w) => (
            <li key={w}>
              {w}
            </li>
          ))}
        </ul>
      </div>
    )}
  </div>
);
