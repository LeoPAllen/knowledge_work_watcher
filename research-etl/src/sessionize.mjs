import { createHash } from "node:crypto";

export const DEFAULT_INACTIVITY_MINUTES = 30;

function stableId(prefix, parts) {
  return `${prefix}_${createHash("sha256")
    .update(parts.join("\u001f"))
    .digest("hex")
    .slice(0, 20)}`;
}

function participantKey(event) {
  return event.participant_id_hash ?? "participant_missing";
}

function extensionSessionKey(event) {
  return event.session_id ?? "session_missing";
}

export function sessionize(records, inactivityMinutes = DEFAULT_INACTIVITY_MINUTES) {
  if (!(inactivityMinutes > 0)) {
    throw new RangeError("inactivity threshold must be positive");
  }
  const thresholdMs = inactivityMinutes * 60_000;
  const sorted = [...records].sort((left, right) => {
    const participant = participantKey(left.event).localeCompare(
      participantKey(right.event),
    );
    if (participant !== 0) {
      return participant;
    }
    const session = extensionSessionKey(left.event).localeCompare(
      extensionSessionKey(right.event),
    );
    if (session !== 0) {
      return session;
    }
    const timestamp =
      Date.parse(left.event.created_at) - Date.parse(right.event.created_at);
    return timestamp || left.event.event_id.localeCompare(right.event.event_id);
  });

  let prior = null;
  let sequence = 0;
  let activitySessionId = null;
  return sorted.map((record) => {
    const event = record.event;
    const currentKey = `${participantKey(event)}:${extensionSessionKey(event)}`;
    const timestamp = Date.parse(event.created_at);
    const startsSession =
      prior === null ||
      prior.key !== currentKey ||
      timestamp - prior.timestamp > thresholdMs;
    if (startsSession) {
      sequence = 1;
      activitySessionId = stableId("activity", [
        participantKey(event),
        extensionSessionKey(event),
        event.created_at,
        event.event_id,
      ]);
    } else {
      sequence += 1;
    }
    prior = { key: currentKey, timestamp };
    return {
      ...record,
      participant_key: participantKey(event),
      extension_session_key: extensionSessionKey(event),
      activity_session_id: activitySessionId,
      activity_sequence: sequence,
    };
  });
}

export function episodeId(kind, record, discriminator) {
  return stableId(kind, [
    record.participant_key,
    record.activity_session_id,
    String(discriminator),
  ]);
}
