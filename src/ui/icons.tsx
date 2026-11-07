import type { ComponentProps, ComponentType } from 'react';
import type { IconBaseProps } from 'react-icons';
import {
  GoAlert,
  GoArrowLeft,
  GoArrowRight,
  GoBell,
  GoCheck,
  GoCheckCircle,
  GoClock,
  GoChevronDown,
  GoCommentDiscussion,
  GoDeviceMobile,
  GoEye,
  GoEyeClosed,
  GoGear,
  GoHome,
  GoHourglass,
  GoImage,
  GoInbox,
  GoKebabHorizontal,
  GoKey,
  GoLock,
  GoMegaphone,
  GoNote,
  GoOrganization,
  GoPaperAirplane,
  GoPencil,
  GoPeople,
  GoPerson,
  GoPin,
  GoPlay,
  GoPlus,
  GoReply,
  GoScreenFull,
  GoSearch,
  GoSignOut,
  GoShield,
  GoShieldCheck,
  GoStar,
  GoStarFill,
  GoX,
  GoXCircle,
} from 'react-icons/go';

type IconProps = Omit<ComponentProps<'svg'>, 'children'>;

/**
 * Every icon is GitHub's Octicons (react-icons/go, 2026-11-01): crisp filled shapes on a 16 px grid, 1em square so they
 * take the size of the text around them. Always decorative: a label or an aria-label beside it says what it means.
 * The names stay Howdy's own, so a page never knows which set draws them.
 */
const go = (Icon: ComponentType<IconBaseProps>) =>
  function HowdyIcon(p: IconProps) {
    return <Icon aria-hidden="true" focusable="false" {...(p as IconBaseProps)} />;
  };

export const CloseIcon = go(GoX);
export const MoreIcon = go(GoKebabHorizontal);
export const StarIcon = go(GoStar);
export const ChevronDownIcon = go(GoChevronDown);
// Open in full (the chat window's "open the full chat").
export const ExpandIcon = go(GoScreenFull);
export const ReplyIcon = go(GoReply);
export const PencilIcon = go(GoPencil);
export const HomeIcon = go(GoHome);
export const FenceIcon = go(GoNote);
// Visitors: an eye (who looked at my profile).
export const TracksIcon = go(GoEye);
// The one reaction on posts and Stories (2026-11-07): outline = not given yet, filled = you gave it.
export const StarFillIcon = go(GoStarFill);
export const WhisperIcon = go(GoCommentDiscussion);
export const BellIcon = go(GoBell);
export const SearchIcon = go(GoSearch);
export const UsersIcon = go(GoPeople);
// Next to an error message, so it is not told by colour alone.
export const AlertIcon = go(GoAlert);
export const CheckCircleIcon = go(GoCheckCircle);
export const XCircleIcon = go(GoXCircle);
export const ArrowRightIcon = go(GoArrowRight);
// Back to the list (a conversation on a phone).
export const BackIcon = go(GoArrowLeft);
export const UserIcon = go(GoPerson);
// Groups: a building, so it never reads like Friends' two people.
export const GroupIcon = go(GoOrganization);
export const SettingsIcon = go(GoGear);
// Time Capsules: words sealed until a day comes.
export const CapsuleIcon = go(GoHourglass);
export const ShieldIcon = go(GoShield);
export const EyeIcon = go(GoEye);
export const EyeOffIcon = go(GoEyeClosed);
export const KeyIcon = go(GoKey);
export const PlusIcon = go(GoPlus);
// A group's pinned notice.
export const PinIcon = go(GoPin);
export const PlayIcon = go(GoPlay);
// Add or change a photo (Octicons has no camera).
export const CameraIcon = go(GoImage);
// Post, Reply, Send.
export const SendIcon = go(GoPaperAirplane);
// Your signed-in devices, and signing out (the phone's You sheet).
// The chosen one in a set (a Describe word).
export const CheckIcon = go(GoCheck);
export const DevicesIcon = go(GoDeviceMobile);
export const SignOutIcon = go(GoSignOut);
// Send feedback about Howdy (ADR-059).
export const FeedbackIcon = go(GoMegaphone);
// Moderation: appeals from suspended people waiting to be read.
export const InboxIcon = go(GoInbox);
// Moderation, all clear: a shield with a tick (the plain shield carries a "!" and reads as a warning).
export const ShieldCheckIcon = go(GoShieldCheck);
// "Slow down, try again in a minute" (the hourglass already means Capsules).
export const ClockIcon = go(GoClock);
// Something only certain people can see, such as a private wall.
export const LockIcon = go(GoLock);

/** Octicons has no pause: drawn on the same 16 px grid as GoPlay (a ring with two bars), filled like the rest. */
export const PauseIcon = (p: IconProps) => (
  <svg
    viewBox="0 0 16 16"
    width="1em"
    height="1em"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
    {...p}
  >
    <path
      fillRule="evenodd"
      d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0ZM6 5h1.5v6H6Zm2.5 0H10v6H8.5Z"
    />
  </svg>
);

/** A turning arc for "loading" (Octicons has none that spins); the caller adds `animate-spin`. */
export const SpinnerIcon = (p: IconProps) => (
  <svg viewBox="0 0 16 16" width="1em" height="1em" fill="none" aria-hidden="true" focusable="false" {...p}>
    <path d="M8 1.5A6.5 6.5 0 1 0 14.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
