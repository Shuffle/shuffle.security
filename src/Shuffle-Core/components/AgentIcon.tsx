import singulAgentIcon from '@/assets/singul-agent-icon.png';

interface AgentIconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Renders the Singul agent icon — use this everywhere instead of 🤖.
 */
const AgentIcon = ({ size = 16, className, style }: AgentIconProps) => (
  <img
    src={singulAgentIcon}
    alt="AI Agent"
    width={size}
    height={size}
    className={className}
    style={{ borderRadius: '3px', objectFit: 'contain', ...style }}
  />
);

export default AgentIcon;
