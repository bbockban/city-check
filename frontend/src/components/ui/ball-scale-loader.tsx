import type { HTMLAttributes } from 'react';
import Loader from 'react-loaders';

import 'loaders.css/loaders.css';

interface BallScaleLoaderProps extends HTMLAttributes<HTMLDivElement> {
  active?: boolean;
  size?: number;
}

export const BallScaleLoader = ({
  active = true,
  size = 48,
  className = '',
  ...props
}: BallScaleLoaderProps) => {
  const loaderProps = {
    active,
    color: 'var(--color-medium-blue)',
    style: { transform: `scale(${size / 48})` },
    type: 'ball-scale-multiple' as const,
  };

  return (
    <div
      className={className}
      role="status"
      aria-label="Cargando"
      {...props}
    >
      <Loader {...(loaderProps as React.ComponentProps<typeof Loader>)} />
    </div>
  );
};
