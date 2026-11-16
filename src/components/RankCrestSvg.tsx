import React from 'react';
import { getRankTier } from '../shared/chessTypes';

interface RankCrestSvgProps {
  elo: number;
  size?: number;
  className?: string;
}

export const RankCrestSvg: React.FC<RankCrestSvgProps> = ({ elo, size = 20, className = '' }) => {
  const tier = getRankTier(elo);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-label={`${tier.name} rank`}
    >
      {/* Shield base */}
      <path
        d="M12 2.5L20 6V12.2C20 16.9 16.6 20.6 12 22C7.4 20.6 4 16.9 4 12.2V6L12 2.5Z"
        fill={tier.subtleBg}
        stroke={tier.color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Tier-specific architectural motif */}
      {(tier.id === 'iron' || tier.id === 'bronze') && (
        <path d="M12 7.5L15 12L12 16.5L9 12L12 7.5Z" stroke={tier.color} strokeWidth="1.4" />
      )}
      {(tier.id === 'silver' || tier.id === 'gold') && (
        <>
          <path d="M8 14.5L9.5 9.5L12 11.8L14.5 9.5L16 14.5H8Z" fill={tier.color} fillOpacity="0.85" />
          <path d="M8.5 16.5H15.5" stroke={tier.color} strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}
      {(tier.id === 'platinum' || tier.id === 'diamond') && (
        <>
          <path d="M12 6.8L16.2 12L12 17.2L7.8 12L12 6.8Z" fill={tier.color} fillOpacity="0.28" stroke={tier.color} strokeWidth="1.4" />
          <circle cx="12" cy="12" r="1.5" fill={tier.color} />
        </>
      )}
      {(tier.id === 'master' || tier.id === 'grandmaster') && (
        <>
          <path d="M7.5 14.5L8.8 9L12 11.4L15.2 9L16.5 14.5H7.5Z" fill={tier.color} />
          <circle cx="12" cy="7.2" r="1.1" fill={tier.color} />
          <path d="M8 16.8H16" stroke={tier.color} strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
};
