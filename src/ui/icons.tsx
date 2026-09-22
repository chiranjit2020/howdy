import type { ComponentProps } from 'react';

type IconProps = Omit<ComponentProps<'svg'>, 'children'>;

function Svg(props: IconProps & { d: string }) {
  const { d, ...rest } = props;
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={d} />
    </svg>
  );
}

export const CloseIcon = (p: IconProps) => <Svg d="M6 6l12 12M18 6L6 18" {...p} />;
export const ChevronDownIcon = (p: IconProps) => <Svg d="M6 9l6 6 6-6" {...p} />;
export const FlipIcon = (p: IconProps) => (
  <Svg d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" {...p} />
);
export const HomeIcon = (p: IconProps) => <Svg d="M3 11l9-8 9 8M5 10v10h14V10" {...p} />;
export const FenceIcon = (p: IconProps) => <Svg d="M5 4v16M12 4v16M19 4v16M3 9h18M3 15h18" {...p} />;
// Two footprints: an oval print with a heel line, walking up and to the right.
export const TracksIcon = (p: IconProps) => (
  <Svg
    d="M8.5 3.5c1.7 0 2.5 1.7 2.5 3.6S10 11 8.5 11 6 9.1 6 7.1 6.8 3.5 8.5 3.5zM7 14.5h3M15.5 11.5c1.7 0 2.5 1.7 2.5 3.6s-1 3.9-2.5 3.9-2.5-1.9-2.5-3.9.8-3.6 2.5-3.6zM14 21h3"
    {...p}
  />
);
export const WhisperIcon = (p: IconProps) => (
  <Svg d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" {...p} />
);
export const BellIcon = (p: IconProps) => (
  <Svg d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0" {...p} />
);
export const UsersIcon = (p: IconProps) => (
  <Svg
    d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 20v-1a4 4 0 0 0-3-3.9M15 4.1a3.5 3.5 0 0 1 0 6.8"
    {...p}
  />
);
export const SpinnerIcon = (p: IconProps) => <Svg d="M12 3a9 9 0 1 0 9 9" {...p} />;
export const BoltIcon = (p: IconProps) => <Svg d="M13 2 4 14h7l-1 8 9-12h-7z" {...p} />;
export const ToolsIcon = (p: IconProps) => (
  <Svg d="M14.7 6.3a4 4 0 0 0-5.2 5.2L3 18l3 3 6.5-6.5a4 4 0 0 0 5.2-5.2L15 12l-3-3z" {...p} />
);
