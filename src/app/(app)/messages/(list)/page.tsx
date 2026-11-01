import { WhisperIcon } from '@/ui/icons';
import { EmptyState } from '@/ui/primitives';

export const metadata = { title: 'Messages' };

/**
 * /messages: the conversation list (from the layout) is the page. On wide screens this fills the chat pane beside it
 * until a conversation is picked; narrower screens show the list alone and never this.
 */
export default function MessagesHome() {
  return (
    <div className="clay flex flex-1 items-center justify-center">
      <EmptyState
        as="h2"
        icon={<WhisperIcon className="text-text-muted" />}
        title="Pick a conversation"
        description="Choose someone on the left, or start a new message with the pencil."
      />
    </div>
  );
}
