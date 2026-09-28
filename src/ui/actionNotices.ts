import type { VoiceSound } from "./sounds";

export type ActionNoticeId = "single-frame-play";

export type ActionNotice = {
  id: ActionNoticeId;
  body: string;
  sound?: VoiceSound;
};

export const ACTION_NOTICES: Record<ActionNoticeId, ActionNotice> = {
  "single-frame-play": {
    id: "single-frame-play",
    body: "Please add some more frames (and modify those) if you want stuff to happen on playback. Right now there is only one frame in the timeline.",
    sound: "hint1",
  },
};

export const ACTION_NOTICE_EVENT = "mozayk-action-notice";
export const ACTION_NOTICE_DISMISS_EVENT = "mozayk-action-notice-dismiss";

export function showActionNotice(id: ActionNoticeId): void {
  const notice = ACTION_NOTICES[id];
  if (!notice) return;
  window.dispatchEvent(
    new CustomEvent(ACTION_NOTICE_EVENT, { detail: notice }),
  );
}

/** Dismiss any visible action notice (e.g. after add/duplicate frame). */
export function dismissActionNotice(): void {
  window.dispatchEvent(new Event(ACTION_NOTICE_DISMISS_EVENT));
}
