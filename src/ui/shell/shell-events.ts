/**
 * Ways for a page to reach into the top bar without holding its state: open the Free to talk panel, or put the cursor in
 * the people search. The top bar listens; nothing happens where it is not on screen.
 */
export const OPEN_FREE_TO_TALK = 'howdy:open-free-to-talk';
export const FOCUS_PEOPLE_SEARCH = 'howdy:focus-people-search';

export const openFreeToTalk = () => window.dispatchEvent(new Event(OPEN_FREE_TO_TALK));
export const focusPeopleSearch = () => window.dispatchEvent(new Event(FOCUS_PEOPLE_SEARCH));
