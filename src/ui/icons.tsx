import type { ComponentProps, ComponentType } from 'react';
import type { IconBaseProps } from 'react-icons';
import {
  PiArrowBendUpLeft,
  PiArrowLeft,
  PiArrowRight,
  PiArrowsOut,
  PiBell,
  PiBuildings,
  PiCamera,
  PiCaretDown,
  PiCaretRight,
  PiChatCircle,
  PiChatsCircle,
  PiChatsCircleFill,
  PiCheck,
  PiCheckCircle,
  PiClock,
  PiDeviceMobile,
  PiDotsThreeBold,
  PiEye,
  PiEyeSlash,
  PiGear,
  PiHourglass,
  PiHouse,
  PiHouseFill,
  PiKey,
  PiLock,
  PiMagnifyingGlass,
  PiMegaphone,
  PiNote,
  PiPaperPlaneRight,
  PiPauseCircle,
  PiPencilSimple,
  PiPlayCircle,
  PiPlus,
  PiPushPin,
  PiShield,
  PiShieldCheck,
  PiSignOut,
  PiStar,
  PiTray,
  PiUser,
  PiUsers,
  PiUsersFill,
  PiWarning,
  PiX,
  PiXCircle,
} from 'react-icons/pi';

type IconProps = Omit<ComponentProps<'svg'>, 'children'>;

/**
 * Every icon is Phosphor Regular (react-icons/pi; 2026-11-08, the user's pick after the phone tab bar, replacing
 * Octicons): thin, rounded outlines, 1em square so they take the size of the text around them. Drawn in black wherever
 * they stand on their own. Always decorative: a label or an aria-label beside it says what it means. The names stay
 * Howdy's own, so a page never knows which set draws them.
 */
const go = (Icon: ComponentType<IconBaseProps>) =>
  function HowdyIcon(p: IconProps) {
    return <Icon aria-hidden="true" focusable="false" {...(p as IconBaseProps)} />;
  };

export const CloseIcon = go(PiX);
// The one Bold icon: Regular's three dots are ~1.5 px circles and all but vanish (2026-11-10, the user's report).
export const MoreIcon = go(PiDotsThreeBold);
export const StarIcon = go(PiStar);
export const ChevronDownIcon = go(PiCaretDown);
export const ChevronRightIcon = go(PiCaretRight);
// Open in full (the chat window's "open the full chat").
export const ExpandIcon = go(PiArrowsOut);
export const ReplyIcon = go(PiArrowBendUpLeft);
export const PencilIcon = go(PiPencilSimple);
export const HomeIcon = go(PiHouse);
export const FenceIcon = go(PiNote);
// Visitors: an eye (who looked at my profile).
export const TracksIcon = go(PiEye);
// How many replies a post has, beside its Star (2026-11-07).
export const CommentIcon = go(PiChatCircle);
export const WhisperIcon = go(PiChatsCircle);
export const BellIcon = go(PiBell);
export const SearchIcon = go(PiMagnifyingGlass);
export const UsersIcon = go(PiUsers);
// Next to an error message, so it is not told by colour alone.
export const AlertIcon = go(PiWarning);
export const CheckCircleIcon = go(PiCheckCircle);
export const XCircleIcon = go(PiXCircle);
export const ArrowRightIcon = go(PiArrowRight);
// Back to the list (a conversation on a phone).
export const BackIcon = go(PiArrowLeft);
export const UserIcon = go(PiUser);
// Groups: a building, so it never reads like Friends' two people.
export const GroupIcon = go(PiBuildings);
export const SettingsIcon = go(PiGear);
// Time Capsules: words sealed until a day comes.
export const CapsuleIcon = go(PiHourglass);
export const ShieldIcon = go(PiShield);
export const EyeIcon = go(PiEye);
export const EyeOffIcon = go(PiEyeSlash);
export const KeyIcon = go(PiKey);
export const PlusIcon = go(PiPlus);
// A group's pinned notice.
export const PinIcon = go(PiPushPin);
export const PlayIcon = go(PiPlayCircle);
// Add or change a photo.
export const CameraIcon = go(PiCamera);
// Post, Reply, Send.
export const SendIcon = go(PiPaperPlaneRight);
// Your signed-in devices, and signing out (the phone's You sheet).
// The chosen one in a set (a Describe word).
export const CheckIcon = go(PiCheck);
export const DevicesIcon = go(PiDeviceMobile);
export const SignOutIcon = go(PiSignOut);
// Send feedback about Howdy (ADR-059).
export const FeedbackIcon = go(PiMegaphone);
// Moderation: appeals from suspended people waiting to be read.
export const InboxIcon = go(PiTray);
// Moderation, all clear: a shield with a tick (the plain shield carries a "!" and reads as a warning).
export const ShieldCheckIcon = go(PiShieldCheck);
// "Slow down, try again in a minute" (the hourglass already means Capsules).
export const ClockIcon = go(PiClock);
// Something only certain people can see, such as a private wall.
export const LockIcon = go(PiLock);
export const PauseIcon = go(PiPauseCircle);

/** A turning arc for "loading"; the caller adds `animate-spin`. */
export const SpinnerIcon = (p: IconProps) => (
  <svg viewBox="0 0 16 16" width="1em" height="1em" fill="none" aria-hidden="true" focusable="false" {...p}>
    <path d="M8 1.5A6.5 6.5 0 1 0 14.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

/* The phone tab bar: outline, and the filled one on the current tab. */
export const TabHomeIcon = go(PiHouse);
export const TabHomeFillIcon = go(PiHouseFill);
export const TabFriendsIcon = go(PiUsers);
export const TabFriendsFillIcon = go(PiUsersFill);
export const TabMessagesIcon = go(PiChatsCircle);
export const TabMessagesFillIcon = go(PiChatsCircleFill);
