import type { ComponentProps } from 'react';

type IconProps = Omit<ComponentProps<'svg'>, 'children'>;

/**
 * Every line icon: a 1 px hairline at ANY size (`vector-effect: non-scaling-stroke`, so a 24-unit drawing shown at 20 px
 * is still exactly 1 px, never a blurry 0.83), with sharp corners (miter joins) and clean square-cut ends. Dots are real
 * filled dots (`dots`, in the 24-unit grid): a dot drawn as a 1 px line would all but vanish.
 */
function Svg(props: IconProps & { d: string; dots?: [number, number][] }) {
  const { d, dots, ...rest } = props;
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="butt"
      strokeLinejoin="miter"
      strokeMiterlimit="8"
      shapeRendering="geometricPrecision"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {d && <path d={d} vectorEffect="non-scaling-stroke" />}
      {dots?.map(([cx, cy]) => (
        <circle key={`${cx},${cy}`} cx={cx} cy={cy} r="1.15" fill="currentColor" stroke="none" />
      ))}
    </svg>
  );
}

export const CloseIcon = (p: IconProps) => <Svg d="M6 6l12 12M18 6L6 18" {...p} />;
export const MoreIcon = (p: IconProps) => (
  <Svg
    d=""
    dots={[
      [5, 12],
      [12, 12],
      [19, 12],
    ]}
    {...p}
  />
);
export const StarIcon = (p: IconProps) => (
  <Svg d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z" {...p} />
);
export const ChevronDownIcon = (p: IconProps) => <Svg d="M6 9l6 6 6-6" {...p} />;
export const FlipIcon = (p: IconProps) => (
  <Svg d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" {...p} />
);
export const PencilIcon = (p: IconProps) => (
  <Svg d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4zM13.5 6.5l4 4" {...p} />
);
export const HomeIcon = (p: IconProps) => <Svg d="M3 11l9-8 9 8M5 10v10h14V10" {...p} />;
export const FenceIcon = (p: IconProps) => <Svg d="M5 4v16M12 4v16M19 4v16M3 9h18M3 15h18" {...p} />;
// Two footprints: an oval print with a heel line, walking up and to the right.
// Visitors: an eye (who looked at my profile). Footprints were too busy to read as a 1 px line at menu size.
export const TracksIcon = (p: IconProps) => (
  <Svg
    d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
    dots={[[12, 12]]}
    {...p}
  />
);
// A smiling face: "pick a reaction".
export const ReactIcon = (p: IconProps) => (
  <Svg
    d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM8.5 14a4 4 0 0 0 7 0"
    dots={[
      [9, 9.5],
      [15, 9.5],
    ]}
    {...p}
  />
);
// Messages: a speech bubble with a tail and two lines of text, which is what makes it read as "messages" when small.
export const WhisperIcon = (p: IconProps) => (
  <Svg
    d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-8l-5 4v-4H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5zM8 9h8M8 12h5"
    {...p}
  />
);
export const BellIcon = (p: IconProps) => (
  <Svg d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0" {...p} />
);
export const SearchIcon = (p: IconProps) => (
  <Svg d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5" {...p} />
);
export const UsersIcon = (p: IconProps) => (
  <Svg
    d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 20v-1a4 4 0 0 0-3-3.9M15 4.1a3.5 3.5 0 0 1 0 6.8"
    {...p}
  />
);
// A circle with "!": next to an error message, so it is not told by colour alone.
export const AlertIcon = (p: IconProps) => (
  <Svg d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 7.5v5.5" dots={[[12, 16.2]]} {...p} />
);
export const CheckCircleIcon = (p: IconProps) => (
  <Svg d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM8.5 12.2l2.3 2.3 4.7-4.8" {...p} />
);
export const XCircleIcon = (p: IconProps) => (
  <Svg d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM9.5 9.5l5 5M14.5 9.5l-5 5" {...p} />
);
export const ArrowRightIcon = (p: IconProps) => <Svg d="M5 12h14M13 6l6 6-6 6" {...p} />;
export const UserIcon = (p: IconProps) => (
  <Svg d="M20 21v-1a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" {...p} />
);
// Three heads, the middle one in front: a group, not just two friends.
export const GroupIcon = (p: IconProps) => (
  <Svg
    d="M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6.5 20v-1a4 4 0 0 1 4-4h3a4 4 0 0 1 4 4v1M5 11.5a2.3 2.3 0 1 1 0-4.6M2 18v-.5a3 3 0 0 1 2.5-3M19 11.5a2.3 2.3 0 1 0 0-4.6M22 18v-.5a3 3 0 0 0-2.5-3"
    {...p}
  />
);
export const SettingsIcon = (p: IconProps) => (
  <Svg
    d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
    {...p}
  />
);
// An hourglass: words sealed until a day comes (Time Capsules).
export const CapsuleIcon = (p: IconProps) => (
  <Svg d="M6 3h12M6 21h12M7 3v3a5 5 0 0 0 5 5 5 5 0 0 0 5-5V3M7 21v-3a5 5 0 0 1 5-5 5 5 0 0 1 5 5v3" {...p} />
);
export const ShieldIcon = (p: IconProps) => (
  <Svg d="M12 21s8-3.5 8-10V5l-8-3-8 3v6c0 6.5 8 10 8 10z" {...p} />
);
export const SpinnerIcon = (p: IconProps) => <Svg d="M12 3a9 9 0 1 0 9 9" {...p} />;
export const BoltIcon = (p: IconProps) => <Svg d="M13 2 4 14h7l-1 8 9-12h-7z" {...p} />;
export const ToolsIcon = (p: IconProps) => (
  <Svg d="M14.7 6.3a4 4 0 0 0-5.2 5.2L3 18l3 3 6.5-6.5a4 4 0 0 0 5.2-5.2L15 12l-3-3z" {...p} />
);
// A simple columned building: pediment, four columns, base — reads as "Town Hall" at nav-icon size.
export const TownHallIcon = (p: IconProps) => (
  <Svg d="M4 10L12 4L20 10M6 10v9M10 10v9M14 10v9M18 10v9M3 21h18" {...p} />
);
export const EyeIcon = (p: IconProps) => (
  <Svg d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" {...p} />
);
export const EyeOffIcon = (p: IconProps) => (
  <Svg
    d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"
    {...p}
  />
);
export const KeyIcon = (p: IconProps) => (
  <Svg d="M15.5 7.5a3.5 3.5 0 1 1-3.4 4.3L4 20M7 17l2 2M9 15l2 2" {...p} />
);
export const PlusIcon = (p: IconProps) => <Svg d="M12 5v14M5 12h14" {...p} />;
export const PauseIcon = (p: IconProps) => <Svg d="M9 5v14M15 5v14" {...p} />;
export const PlayIcon = (p: IconProps) => <Svg d="M8 5l11 7-11 7z" {...p} />;
export const CameraIcon = (p: IconProps) => (
  <Svg d="M3 8h4l2-3h6l2 3h4v11H3zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" {...p} />
);
// A paper plane: Post, Reply, Send.
export const SendIcon = (p: IconProps) => <Svg d="M21 3L3 10.5l7 2.5 2.5 7zM21 3L10 13" {...p} />;
