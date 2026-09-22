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
export const UserIcon = (p: IconProps) => (
  <Svg d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 21a7.5 7.5 0 0 1 15 0" {...p} />
);
export const LockIcon = (p: IconProps) => (
  <Svg
    d="M6 11h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1zM8 11V8a4 4 0 0 1 8 0v3"
    {...p}
  />
);
export const MailIcon = (p: IconProps) => (
  <Svg
    d="M4 5.5h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1zM3.5 7l8.5 6 8.5-6"
    {...p}
  />
);
export const EyeIcon = (p: IconProps) => (
  <Svg d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" {...p} />
);
export const EyeOffIcon = (p: IconProps) => (
  <Svg
    d="M3 3l18 18M10.6 6.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.7C3.8 8.4 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.4 4.5-1M9.9 9.9a3 3 0 0 0 4.2 4.2"
    {...p}
  />
);
export const ArrowRightIcon = (p: IconProps) => <Svg d="M5 12h14M13 6l6 6-6 6" {...p} />;
export const BoltIcon = (p: IconProps) => <Svg d="M13 2 4 14h7l-1 8 9-12h-7z" {...p} />;
export const ToolsIcon = (p: IconProps) => (
  <Svg d="M14.7 6.3a4 4 0 0 0-5.2 5.2L3 18l3 3 6.5-6.5a4 4 0 0 0 5.2-5.2L15 12l-3-3z" {...p} />
);
