import { BallScaleLoader } from '@/components/ui/ball-scale-loader';

interface ViewerLoadingOverlayProps {
  message?: string;
  show: boolean;
}

export const ViewerLoadingOverlay = ({
  message,
  show,
}: ViewerLoadingOverlayProps) => {
  if (!show) return null;

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-9 bg-primary/90">
      <BallScaleLoader size={56} />
      {message && (
        <p className="text-lg text-light-blue">
          {message}
        </p>
      )}
    </div>
  );
};
