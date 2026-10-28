import { COLORS, FONT, SPACE } from '../../styles/theme';

interface LoadingProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  fullPage?: boolean;
}

const Loading: React.FC<LoadingProps> = ({
  message = 'Loading...',
  size = 'md',
  fullPage = false,
}) => {
  const dim = size === 'sm' ? 24 : size === 'lg' ? 48 : 36;
  const border = size === 'sm' ? '2px' : '3px';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: fullPage ? '80px' : SPACE['3xl'],
        minHeight: fullPage ? '60vh' : undefined,
      }}
    >
      <div
        style={{
          width: `${dim}px`,
          height: `${dim}px`,
          border: `${border} solid ${COLORS.border}`,
          borderTop: `${border} solid ${COLORS.accent}`,
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      {message && (
        <p
          style={{
            marginTop: SPACE.lg,
            color: COLORS.textMuted,
            fontSize: FONT.sizeMd,
            fontWeight: FONT.weightMedium,
          }}
        >
          {message}
        </p>
      )}
    </div>
  );
};

export default Loading;
